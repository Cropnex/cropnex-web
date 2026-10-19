-- AGCORE v6.12.0: traceable shed receipts, usages and adjustments.

alter table public.inventory_transactions add column if not exists season text;
alter table public.inventory_transactions add column if not exists location_id uuid references public.inventory_locations(id) on delete set null;
alter table public.inventory_transactions add column if not exists field_id uuid references public.fields(id) on delete set null;
alter table public.inventory_transactions add column if not exists movement_reason text;
create index if not exists inventory_transactions_season_location_idx on public.inventory_transactions(user_id,season,location_id,transaction_date desc);

update public.inventory_transactions t set
  location_id=i.location_id,
  season=coalesce(i.season,(select p.current_season from public.user_season_preferences p where p.user_id=t.user_id))
from public.inventory_items i where i.id=t.inventory_item_id and (t.location_id is null or t.season is null);

drop trigger if exists inventory_transactions_current_season on public.inventory_transactions;
create trigger inventory_transactions_current_season before insert on public.inventory_transactions for each row execute function public.apply_current_season();

create or replace function public.post_inventory_movement(
  p_item_id uuid,p_transaction_date date,p_movement text,p_quantity numeric,
  p_unit_cost numeric default null,p_reference text default null,p_reason text default null,p_field_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_item public.inventory_items%rowtype;v_next numeric;v_type text;v_season text;
begin
  select * into v_item from public.inventory_items where id=p_item_id and user_id=auth.uid() and status<>'Inactive' for update;
  if not found then raise exception 'Inventory item not found or access denied';end if;
  if p_quantity<0 then raise exception 'Quantity cannot be negative';end if;
  if p_movement='Receipt' then v_next:=v_item.quantity+p_quantity;v_type:='Stock In';
  elsif p_movement='Usage' then
    if p_quantity>v_item.quantity then raise exception 'Not enough stock available';end if;
    v_next:=v_item.quantity-p_quantity;v_type:='Stock Out';
  elsif p_movement='Adjustment' then v_next:=p_quantity;v_type:=case when p_quantity>=v_item.quantity then 'Adjustment Increase' else 'Adjustment Decrease' end;
  else raise exception 'Unsupported inventory movement';end if;
  v_season:=coalesce(v_item.season,(select current_season from public.user_season_preferences where user_id=auth.uid()));
  insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes,season,location_id,field_id,movement_reason)
  values(auth.uid(),v_item.id,coalesce(p_transaction_date,current_date),v_type,case when p_movement='Adjustment' then abs(v_next-v_item.quantity) else p_quantity end,coalesce(p_unit_cost,v_item.unit_cost),nullif(trim(p_reference),''),nullif(trim(p_reason),''),v_season,v_item.location_id,p_field_id,nullif(trim(p_reason),''));
  update public.inventory_items set quantity=v_next,unit_cost=coalesce(p_unit_cost,unit_cost) where id=v_item.id;
  return jsonb_build_object('item_id',v_item.id,'movement',p_movement,'previous_quantity',v_item.quantity,'new_quantity',v_next,'difference',v_next-v_item.quantity);
end $$;
grant execute on function public.post_inventory_movement(uuid,date,text,numeric,numeric,text,text,uuid) to authenticated;
