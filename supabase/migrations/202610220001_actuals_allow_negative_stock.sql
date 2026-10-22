-- CropNex: actualise planned work even when shed stock is missing or insufficient.
-- The product usage remains auditable; the resulting negative balance raises an Inventory alert.
create or replace function public.actualise_activity_plan_v2(
  p_plan_id uuid, p_actual_date date, p_lines jsonb, p_actual_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.activity_plans%rowtype;
  v_line jsonb;
  v_product public.activity_plan_products%rowtype;
  v_item public.inventory_items%rowtype;
  v_location public.inventory_locations%rowtype;
  v_operation public.activity_plan_operations%rowtype;
  v_rate numeric;
  v_qty numeric;
  v_cost numeric;
  v_total numeric := 0;
  v_category text;
begin
  select * into v_plan from public.activity_plans
  where id=p_plan_id and user_id=auth.uid() for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_plan.status <> 'Planned' then raise exception 'This activity has already been actualised'; end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    select * into v_product from public.activity_plan_products
    where id=(v_line->>'id')::uuid and plan_id=p_plan_id and user_id=auth.uid() for update;
    if not found then raise exception 'Invalid product line'; end if;
    v_rate := coalesce(nullif(v_line->>'rate','')::numeric,0);
    if v_rate < 0 then raise exception 'Product rate cannot be negative'; end if;
    v_qty := v_rate * v_plan.planned_area_ha;

    if nullif(v_line->>'inventory_item_id','') is not null then
      select * into v_item from public.inventory_items
      where id=(v_line->>'inventory_item_id')::uuid and user_id=auth.uid() for update;
      if not found then raise exception 'Choose a valid source shed for %',v_product.product_name; end if;
      if v_item.location_id is null then raise exception '% must be assigned to a shed before use',v_item.name; end if;
      if v_product.master_product_id is not null and v_item.master_product_id is distinct from v_product.master_product_id then
        raise exception 'The selected shed item does not match planned product %',v_product.product_name;
      end if;
    else
      if nullif(v_line->>'location_id','') is null then raise exception 'Choose a shed for %',v_product.product_name; end if;
      select * into v_location from public.inventory_locations
      where id=(v_line->>'location_id')::uuid and user_id=auth.uid() and active for share;
      if not found then raise exception 'Choose a valid active source shed for %',v_product.product_name; end if;
      if v_product.master_product_id is not null then
        select * into v_item from public.inventory_items
        where user_id=auth.uid() and location_id=v_location.id and status<>'Inactive'
          and master_product_id=v_product.master_product_id
        order by created_at limit 1 for update;
      else
        select * into v_item from public.inventory_items
        where user_id=auth.uid() and location_id=v_location.id and status<>'Inactive'
          and lower(name)=lower(v_product.product_name) and unit=v_product.unit
        order by created_at limit 1 for update;
      end if;
      if not found then
        v_category := 'Other';
        if v_product.master_product_id is not null then
          select coalesce(product_class,category,'Other') into v_category
          from public.master_products where id=v_product.master_product_id;
        end if;
        insert into public.inventory_items(
          user_id,season,master_product_id,name,category,unit,quantity,unit_cost,
          location,location_id,status,notes,owner_type,stock_status
        ) values (
          auth.uid(),v_plan.season,v_product.master_product_id,v_product.product_name,
          coalesce(v_category,'Other'),coalesce(nullif(v_product.unit,''),'unit'),0,
          v_product.planned_unit_price,v_location.name,v_location.id,'Active',
          'Created when activity was actualised; verify physical stock.', 'Farmer','Available'
        ) returning * into v_item;
      end if;
    end if;

    v_cost := round(coalesce(v_item.unit_cost,v_product.planned_unit_price,0)*v_qty,2);
    v_total := v_total + v_cost;
    update public.inventory_items set quantity=quantity-v_qty where id=v_item.id returning * into v_item;
    insert into public.inventory_transactions(
      user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,
      reference,notes,season,location_id,field_id,movement_reason
    ) values (
      auth.uid(),v_item.id,p_actual_date,'Stock Out',v_qty,v_item.unit_cost,
      'PLAN-'||left(p_plan_id::text,8),v_plan.activity_type||' · '||v_plan.field_name,
      v_plan.season,v_item.location_id,v_plan.field_id,'Activity actualised'
    );
    update public.activity_plan_products set inventory_item_id=v_item.id,
      product_name=v_item.name,unit=v_item.unit,actual_rate_per_ha=v_rate,
      actual_quantity=v_qty,actual_unit_price=v_item.unit_cost,actual_cost=v_cost
    where id=v_product.id;
  end loop;

  for v_operation in select * from public.activity_plan_operations
    where plan_id=p_plan_id and user_id=auth.uid() for update loop
    v_qty := v_operation.planned_rate_per_ha*v_plan.planned_area_ha;
    v_cost := round(v_qty*v_operation.planned_unit_price,2);
    v_total := v_total+v_cost;
    update public.activity_plan_operations set actual_rate_per_ha=v_operation.planned_rate_per_ha,
      actual_quantity=v_qty,actual_unit_price=v_operation.planned_unit_price,actual_cost=v_cost
    where id=v_operation.id;
  end loop;

  update public.activity_plans set status='Actualised',actual_date=p_actual_date,
    actual_notes=p_actual_notes,actual_total=v_total,updated_at=now() where id=p_plan_id;
  insert into public.activities(user_id,activity_type,field_name,crop,season,date,area_ha,notes)
  values(auth.uid(),v_plan.activity_type,v_plan.field_name,v_plan.crop,v_plan.season,
    p_actual_date,v_plan.planned_area_ha,'Actual · '||coalesce(p_actual_notes,'Confirmed from plan'));
  return jsonb_build_object('plan_id',p_plan_id,'actual_total',v_total,'status','Actualised');
end;
$$;
grant execute on function public.actualise_activity_plan_v2(uuid,date,jsonb,text) to authenticated;
