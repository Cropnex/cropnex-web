-- Farm Map actuals may add or replace catalogue products/seeds and operations.
-- The legacy actualisation RPC continues to post shed movements and costing.
create or replace function public.actualise_activity_group_v1(
  p_actual_start_date date,
  p_actual_end_date date,
  p_plans jsonb,
  p_actual_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry jsonb;
  v_product_line jsonb;
  v_operation_line jsonb;
  v_products jsonb;
  v_operations jsonb;
  v_plan public.activity_plans%rowtype;
  v_source public.activity_plans%rowtype;
  v_op public.activity_plan_operations%rowtype;
  v_catalog_product public.master_products%rowtype;
  v_catalog_operation public.standard_operations%rowtype;
  v_product_id uuid;
  v_operation_id uuid;
  v_actual_total numeric;
  v_count integer := 0;
  v_note text;
begin
  if p_actual_start_date is null or p_actual_end_date is null or p_actual_end_date < p_actual_start_date then
    raise exception 'Enter a valid actual date range';
  end if;
  if jsonb_typeof(p_plans) <> 'array' or jsonb_array_length(p_plans) = 0 then
    raise exception 'Select at least one field';
  end if;

  for v_entry in select value from jsonb_array_elements(p_plans) loop
    select * into v_plan from public.activity_plans
    where id=(v_entry->>'plan_id')::uuid and user_id=auth.uid() for update;
    if not found then raise exception 'Activity plan not found or access denied'; end if;
    if v_plan.status <> 'Planned' then raise exception 'One of the selected activities has already been actualised'; end if;
    if v_count=0 then v_source:=v_plan;
    elsif v_plan.season is distinct from v_source.season or v_plan.activity_type is distinct from v_source.activity_type then
      raise exception 'Selected activities must have the same activity and season';
    end if;

    v_products:='[]'::jsonb;
    for v_product_line in select value from jsonb_array_elements(coalesce(v_entry->'products','[]'::jsonb)) loop
      select * into v_catalog_product from public.master_products
      where id=(v_product_line->>'master_product_id')::uuid and status='Approved';
      if not found then raise exception 'Choose an approved product or seed from the catalogue'; end if;
      if nullif(v_product_line->>'id','') is null then
        insert into public.activity_plan_products(user_id,plan_id,inventory_item_id,master_product_id,product_name,unit,
          planned_rate_per_ha,planned_quantity,planned_unit_price,planned_cost)
        values(auth.uid(),v_plan.id,null,v_catalog_product.id,v_catalog_product.name,
          coalesce(nullif(v_product_line->>'unit',''),v_catalog_product.pack_unit,'unit'),0,0,
          greatest(coalesce((v_product_line->>'unit_price')::numeric,0),0),0)
        returning id into v_product_id;
      else
        v_product_id:=(v_product_line->>'id')::uuid;
        update public.activity_plan_products set master_product_id=v_catalog_product.id,
          product_name=v_catalog_product.name,unit=coalesce(nullif(v_product_line->>'unit',''),v_catalog_product.pack_unit,'unit')
        where id=v_product_id and plan_id=v_plan.id and user_id=auth.uid();
        if not found then raise exception 'Product line not found for %',v_plan.field_name; end if;
      end if;
      v_products:=v_products||jsonb_build_array(jsonb_set(v_product_line,'{id}',to_jsonb(v_product_id::text),true));
    end loop;

    v_operations:='[]'::jsonb;
    for v_operation_line in select value from jsonb_array_elements(coalesce(v_entry->'operations','[]'::jsonb)) loop
      select * into v_catalog_operation from public.standard_operations
      where id=(v_operation_line->>'operation_id')::uuid and active;
      if not found then raise exception 'Choose an active operation from the operations list'; end if;
      if nullif(v_operation_line->>'id','') is null then
        insert into public.activity_plan_operations(user_id,plan_id,operation_id,operation_name,unit,
          planned_rate_per_ha,planned_quantity,planned_unit_price,planned_cost)
        values(auth.uid(),v_plan.id,v_catalog_operation.id,v_catalog_operation.name,v_catalog_operation.unit,
          0,0,greatest(coalesce((v_operation_line->>'unit_price')::numeric,v_catalog_operation.unit_cost),0),0)
        returning id into v_operation_id;
      else
        v_operation_id:=(v_operation_line->>'id')::uuid;
        update public.activity_plan_operations set operation_id=v_catalog_operation.id,
          operation_name=v_catalog_operation.name,unit=v_catalog_operation.unit,
          planned_unit_price=greatest(coalesce((v_operation_line->>'unit_price')::numeric,v_catalog_operation.unit_cost),0)
        where id=v_operation_id and plan_id=v_plan.id and user_id=auth.uid();
        if not found then raise exception 'Operation line not found for %',v_plan.field_name; end if;
      end if;
      v_operations:=v_operations||jsonb_build_array(jsonb_set(v_operation_line,'{id}',to_jsonb(v_operation_id::text),true));
    end loop;

    v_note:=concat(coalesce(p_actual_notes,'Actual confirmed from Farm Map'),' · actual period ',p_actual_start_date,' to ',p_actual_end_date);
    perform public.actualise_activity_plan_v2(v_plan.id,p_actual_end_date,v_products,v_note);

    for v_op in select * from public.activity_plan_operations where plan_id=v_plan.id and user_id=auth.uid() for update loop
      select ops.value into v_operation_line from jsonb_array_elements(v_operations) as ops(value)
      where ops.value->>'id'=v_op.id::text limit 1;
      if found then
        if coalesce((v_operation_line->>'rate')::numeric,0)<0 then raise exception 'Operation rate cannot be negative'; end if;
        update public.activity_plan_operations set
          actual_rate_per_ha=coalesce((v_operation_line->>'rate')::numeric,0),
          actual_quantity=coalesce((v_operation_line->>'rate')::numeric,0)*v_plan.planned_area_ha,
          actual_unit_price=planned_unit_price,
          actual_cost=round(coalesce((v_operation_line->>'rate')::numeric,0)*v_plan.planned_area_ha*planned_unit_price,2)
        where id=v_op.id;
      else
        update public.activity_plan_operations set actual_rate_per_ha=null,actual_quantity=null,actual_unit_price=null,actual_cost=null where id=v_op.id;
      end if;
    end loop;

    select coalesce(sum(actual_cost),0) into v_actual_total from public.activity_plan_products where plan_id=v_plan.id and user_id=auth.uid();
    select v_actual_total+coalesce(sum(actual_cost),0) into v_actual_total from public.activity_plan_operations where plan_id=v_plan.id and user_id=auth.uid();
    update public.activity_plans set actual_start_date=p_actual_start_date,actual_end_date=p_actual_end_date,
      actual_notes=v_note,actual_total=v_actual_total,updated_at=now() where id=v_plan.id and user_id=auth.uid();
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('actualised_count',v_count,'actual_start_date',p_actual_start_date,'actual_end_date',p_actual_end_date);
end;
$$;
grant execute on function public.actualise_activity_group_v1(date,date,jsonb,text) to authenticated;
