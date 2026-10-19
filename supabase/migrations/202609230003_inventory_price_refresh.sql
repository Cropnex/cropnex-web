-- Inventory prices become authoritative when stock is linked to a catalogue product.
create or replace function public.refresh_planning_prices_from_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.master_product_id is null or coalesce(new.unit_cost,0) <= 0 then
    return new;
  end if;

  update public.crop_template_lines
  set inventory_item_id=new.id,
      planned_unit_price=new.unit_cost,
      unit=coalesce(nullif(new.unit,''),unit)
  where user_id=new.user_id
    and master_product_id=new.master_product_id
    and line_type='Product';

  update public.activity_plan_products product
  set inventory_item_id=new.id,
      planned_unit_price=new.unit_cost,
      planned_cost=product.planned_quantity*new.unit_cost,
      unit=coalesce(nullif(new.unit,''),product.unit)
  from public.activity_plans plan
  where product.plan_id=plan.id
    and product.user_id=new.user_id
    and product.master_product_id=new.master_product_id
    and plan.status='Planned';

  update public.activity_plans plan
  set planned_total=coalesce((select sum(p.planned_cost) from public.activity_plan_products p where p.plan_id=plan.id),0)
                  +coalesce((select sum(o.planned_cost) from public.activity_plan_operations o where o.plan_id=plan.id),0)
  where plan.user_id=new.user_id and plan.status='Planned';

  return new;
end $$;

drop trigger if exists inventory_price_refresh_planning on public.inventory_items;
create trigger inventory_price_refresh_planning
after insert or update of unit_cost,master_product_id,unit on public.inventory_items
for each row execute function public.refresh_planning_prices_from_inventory();
