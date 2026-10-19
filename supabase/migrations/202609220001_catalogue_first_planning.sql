-- AGCORE catalogue-first planning.
-- Plans may use any approved master product before stock is purchased.
-- Existing Shed-linked plans remain valid and unchanged.

alter table public.activity_plan_products
  alter column inventory_item_id drop not null;
alter table public.activity_plan_products
  add column if not exists master_product_id uuid references public.master_products(id) on delete restrict;
create index if not exists activity_plan_products_master_idx
  on public.activity_plan_products(master_product_id);

alter table public.crop_template_lines
  add column if not exists master_product_id uuid references public.master_products(id) on delete restrict;
alter table public.crop_template_lines
  add column if not exists planned_unit_price numeric(14,4) not null default 0 check(planned_unit_price >= 0);
create index if not exists crop_template_lines_master_idx
  on public.crop_template_lines(master_product_id);

-- Replace the original product/operation rule with one that accepts either a
-- master-catalogue product or an existing Shed item for backwards compatibility.
alter table public.crop_template_lines drop constraint if exists crop_template_lines_check;
alter table public.crop_template_lines
  add constraint crop_template_lines_source_check check(
    (line_type='Product' and (master_product_id is not null or inventory_item_id is not null) and operation_id is null)
    or (line_type='Operation' and operation_id is not null and master_product_id is null and inventory_item_id is null)
  );

-- Existing rows can be linked automatically where the Shed item already points
-- at the catalogue. No names or quantities are changed.
update public.activity_plan_products p
set master_product_id=i.master_product_id
from public.inventory_items i
where p.inventory_item_id=i.id and p.master_product_id is null and i.master_product_id is not null;

update public.crop_template_lines l
set master_product_id=i.master_product_id
from public.inventory_items i
where l.inventory_item_id=i.id and l.master_product_id is null and i.master_product_id is not null;

-- Actualising remains strict: the farmer chooses a Shed item at completion time.
-- The chosen stock item must match the planned catalogue product when both are linked.
create or replace function public.actualise_activity_plan_v2(
  p_plan_id uuid, p_actual_date date, p_lines jsonb, p_actual_notes text default null
) returns jsonb language plpgsql security invoker as $$
declare
  v_plan public.activity_plans%rowtype; v_line jsonb; v_product public.activity_plan_products%rowtype;
  v_item public.inventory_items%rowtype; v_operation public.activity_plan_operations%rowtype;
  v_rate numeric; v_qty numeric; v_cost numeric; v_total numeric := 0;
begin
  select * into v_plan from public.activity_plans where id=p_plan_id and user_id=auth.uid() for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_plan.status <> 'Planned' then raise exception 'This activity has already been actualised'; end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    select * into v_product from public.activity_plan_products where id=(v_line->>'id')::uuid and plan_id=p_plan_id and user_id=auth.uid() for update;
    if not found then raise exception 'Invalid product line'; end if;
    select * into v_item from public.inventory_items where id=(v_line->>'inventory_item_id')::uuid and user_id=auth.uid() for update;
    if not found then raise exception 'Choose a Shed product before actualising %',v_product.product_name; end if;
    if v_product.master_product_id is not null and v_item.master_product_id is distinct from v_product.master_product_id then
      raise exception 'The selected Shed item does not match planned product %',v_product.product_name;
    end if;
    v_rate := (v_line->>'rate')::numeric; v_qty := v_rate*v_plan.planned_area_ha;
    if v_rate<0 then raise exception 'Product rate cannot be negative'; end if;
    if v_item.quantity<v_qty then raise exception 'Not enough % in the Shed (need %, available %)',v_item.name,v_qty,v_item.quantity; end if;
    v_cost := round(v_item.unit_cost*v_qty,2); v_total := v_total+v_cost;
    update public.inventory_items set quantity=quantity-v_qty where id=v_item.id;
    insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes)
      values(auth.uid(),v_item.id,p_actual_date,'Stock Out',v_qty,v_item.unit_cost,'PLAN-'||left(p_plan_id::text,8),v_plan.activity_type||' · '||v_plan.field_name);
    update public.activity_plan_products set inventory_item_id=v_item.id,product_name=v_item.name,unit=v_item.unit,
      actual_rate_per_ha=v_rate,actual_quantity=v_qty,actual_unit_price=v_item.unit_cost,actual_cost=v_cost where id=v_product.id;
  end loop;
  for v_operation in select * from public.activity_plan_operations where plan_id=p_plan_id and user_id=auth.uid() for update loop
    v_qty := v_operation.planned_rate_per_ha*v_plan.planned_area_ha;
    v_cost := round(v_qty*v_operation.planned_unit_price,2); v_total := v_total+v_cost;
    update public.activity_plan_operations set actual_rate_per_ha=planned_rate_per_ha,actual_quantity=v_qty,
      actual_unit_price=planned_unit_price,actual_cost=v_cost where id=v_operation.id;
  end loop;
  update public.activity_plans set status='Actualised',actual_date=p_actual_date,actual_notes=p_actual_notes,actual_total=v_total,updated_at=now() where id=p_plan_id;
  insert into public.activities(user_id,activity_type,field_name,crop,date,area_ha,notes)
    values(auth.uid(),v_plan.activity_type,v_plan.field_name,v_plan.crop,p_actual_date,v_plan.planned_area_ha,'Actual · '||coalesce(p_actual_notes,'Confirmed from plan'));
  return jsonb_build_object('plan_id',p_plan_id,'actual_total',v_total,'status','Actualised');
end $$;
grant execute on function public.actualise_activity_plan_v2(uuid,date,jsonb,text) to authenticated;
