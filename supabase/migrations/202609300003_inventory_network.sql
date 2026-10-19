-- AGCORE v6.3: multi-location inventory network.
-- Works for a farmer with multiple sheds and is ready for organisation warehouses.

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location_type text not null default 'Farm Shed' check (location_type in ('Farm Shed','Warehouse','Fuel Store','Workshop Store','Other')),
  farm_name text,
  town text,
  province text,
  owner_type text not null default 'Farmer' check (owner_type in ('Farmer','Organisation','Supplier','Other')),
  owner_name text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id,name)
);

alter table public.inventory_items add column if not exists location_id uuid references public.inventory_locations(id) on delete restrict;
alter table public.inventory_items add column if not exists owner_type text not null default 'Farmer';
alter table public.inventory_items add column if not exists owner_name text;
alter table public.inventory_items add column if not exists stock_status text not null default 'Available';

-- Preserve existing free-text locations as real locations.
insert into public.inventory_locations(user_id,name,location_type,owner_type)
select distinct user_id,coalesce(nullif(trim(location),''),'Main Shed'),'Farm Shed','Farmer'
from public.inventory_items i
where not exists (
  select 1 from public.inventory_locations l
  where l.user_id=i.user_id and l.name=coalesce(nullif(trim(i.location),''),'Main Shed')
)
on conflict (user_id,name) do nothing;

update public.inventory_items i
set location_id=l.id,location=l.name
from public.inventory_locations l
where i.location_id is null and l.user_id=i.user_id
  and l.name=coalesce(nullif(trim(i.location),''),'Main Shed');

create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  to_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  status text not null default 'Draft' check (status in ('Draft','Requested','Approved','Dispatched','Received','Cancelled','Exception')),
  requested_date date not null default current_date,
  dispatched_at timestamptz,
  received_at timestamptz,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  check (from_location_id<>to_location_id)
);

create table if not exists public.inventory_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  source_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_dispatched numeric(16,4) not null check (quantity_dispatched>0),
  quantity_received numeric(16,4),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_stocktakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  stocktake_date date not null default current_date,
  status text not null default 'In Progress' check (status in ('In Progress','Completed','Cancelled')),
  reference text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_stocktake_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stocktake_id uuid not null references public.inventory_stocktakes(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  expected_quantity numeric(16,4) not null,
  counted_quantity numeric(16,4) not null check (counted_quantity>=0),
  variance numeric(16,4) generated always as (counted_quantity-expected_quantity) stored,
  reason text,
  unique(stocktake_id,inventory_item_id)
);

create index if not exists inventory_items_location_idx on public.inventory_items(location_id,status);
create index if not exists inventory_transfers_user_status_idx on public.inventory_transfers(user_id,status,requested_date desc);
create index if not exists inventory_stocktakes_location_date_idx on public.inventory_stocktakes(location_id,stocktake_date desc);

alter table public.inventory_locations enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_lines enable row level security;
alter table public.inventory_stocktakes enable row level security;
alter table public.inventory_stocktake_counts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventory_locations' and policyname='inventory_locations_own') then
    create policy inventory_locations_own on public.inventory_locations for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventory_transfers' and policyname='inventory_transfers_own') then
    create policy inventory_transfers_own on public.inventory_transfers for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventory_transfer_lines' and policyname='inventory_transfer_lines_own') then
    create policy inventory_transfer_lines_own on public.inventory_transfer_lines for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventory_stocktakes' and policyname='inventory_stocktakes_own') then
    create policy inventory_stocktakes_own on public.inventory_stocktakes for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventory_stocktake_counts' and policyname='inventory_stocktake_counts_own') then
    create policy inventory_stocktake_counts_own on public.inventory_stocktake_counts for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
end $$;

create or replace function public.dispatch_inventory_transfer(p_transfer_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_transfer public.inventory_transfers%rowtype; v_line public.inventory_transfer_lines%rowtype; v_item public.inventory_items%rowtype;
begin
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id and user_id=auth.uid() for update;
  if not found then raise exception 'Transfer not found or access denied'; end if;
  if v_transfer.status not in ('Draft','Requested','Approved') then raise exception 'Only an open transfer can be dispatched'; end if;
  for v_line in select * from public.inventory_transfer_lines where transfer_id=p_transfer_id and user_id=auth.uid() loop
    select * into v_item from public.inventory_items where id=v_line.source_item_id and user_id=auth.uid() for update;
    if v_item.location_id<>v_transfer.from_location_id then raise exception '% is not held at the sending location',v_item.name; end if;
    if v_item.quantity<v_line.quantity_dispatched then raise exception 'Not enough % available',v_item.name; end if;
    update public.inventory_items set quantity=quantity-v_line.quantity_dispatched where id=v_item.id;
    insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes)
      values(auth.uid(),v_item.id,current_date,'Transfer Out',v_line.quantity_dispatched,v_item.unit_cost,coalesce(v_transfer.reference,'TRANSFER-'||left(p_transfer_id::text,8)),'Dispatched to inventory location');
  end loop;
  update public.inventory_transfers set status='Dispatched',dispatched_at=now() where id=p_transfer_id;
end $$;

create or replace function public.receive_inventory_transfer(p_transfer_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_transfer public.inventory_transfers%rowtype; v_line public.inventory_transfer_lines%rowtype; v_source public.inventory_items%rowtype; v_target public.inventory_items%rowtype; v_qty numeric;
begin
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id and user_id=auth.uid() for update;
  if not found then raise exception 'Transfer not found or access denied'; end if;
  if v_transfer.status<>'Dispatched' then raise exception 'Only a dispatched transfer can be received'; end if;
  for v_line in select * from public.inventory_transfer_lines where transfer_id=p_transfer_id and user_id=auth.uid() loop
    select * into v_source from public.inventory_items where id=v_line.source_item_id and user_id=auth.uid();
    v_qty:=coalesce(v_line.quantity_received,v_line.quantity_dispatched);
    select * into v_target from public.inventory_items
      where user_id=auth.uid() and location_id=v_transfer.to_location_id and status<>'Inactive'
        and coalesce(master_product_id::text,name)=coalesce(v_source.master_product_id::text,v_source.name)
        and unit=v_source.unit and coalesce(batch_number,'')=coalesce(v_source.batch_number,'') limit 1 for update;
    if not found then
      insert into public.inventory_items(user_id,master_product_id,name,category,unit,quantity,minimum_quantity,unit_cost,supplier,batch_number,expiry_date,location,location_id,status,notes,owner_type,owner_name,stock_status)
      select auth.uid(),master_product_id,name,category,v_source.unit,v_qty,minimum_quantity,unit_cost,supplier,batch_number,expiry_date,l.name,l.id,'Active','Created from inventory transfer',owner_type,owner_name,'Available'
      from public.inventory_locations l where l.id=v_transfer.to_location_id returning * into v_target;
    else
      update public.inventory_items set quantity=quantity+v_qty,unit_cost=coalesce(v_source.unit_cost,unit_cost) where id=v_target.id returning * into v_target;
    end if;
    update public.inventory_transfer_lines set quantity_received=v_qty where id=v_line.id;
    insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes)
      values(auth.uid(),v_target.id,current_date,'Transfer In',v_qty,v_source.unit_cost,coalesce(v_transfer.reference,'TRANSFER-'||left(p_transfer_id::text,8)),'Received from inventory location');
  end loop;
  update public.inventory_transfers set status='Received',received_at=now() where id=p_transfer_id;
end $$;

create or replace function public.complete_inventory_stocktake(p_stocktake_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_take public.inventory_stocktakes%rowtype; v_count public.inventory_stocktake_counts%rowtype; v_item public.inventory_items%rowtype;
begin
  select * into v_take from public.inventory_stocktakes where id=p_stocktake_id and user_id=auth.uid() for update;
  if not found then raise exception 'Stocktake not found or access denied'; end if;
  if v_take.status<>'In Progress' then raise exception 'This stocktake is already closed'; end if;
  for v_count in select * from public.inventory_stocktake_counts where stocktake_id=p_stocktake_id and user_id=auth.uid() loop
    select * into v_item from public.inventory_items where id=v_count.inventory_item_id and user_id=auth.uid() and location_id=v_take.location_id for update;
    update public.inventory_items set quantity=v_count.counted_quantity where id=v_item.id;
    if v_count.variance<>0 then
      insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes)
      values(auth.uid(),v_item.id,v_take.stocktake_date,case when v_count.variance>0 then 'Stocktake Increase' else 'Stocktake Decrease' end,abs(v_count.variance),v_item.unit_cost,coalesce(v_take.reference,'STOCKTAKE-'||left(p_stocktake_id::text,8)),coalesce(v_count.reason,'Stocktake variance'));
    end if;
  end loop;
  update public.inventory_stocktakes set status='Completed',completed_at=now() where id=p_stocktake_id;
end $$;

grant execute on function public.dispatch_inventory_transfer(uuid) to authenticated;
grant execute on function public.receive_inventory_transfer(uuid) to authenticated;
grant execute on function public.complete_inventory_stocktake(uuid) to authenticated;

create or replace view public.inventory_location_summary with (security_invoker=true) as
select l.user_id,l.id location_id,l.name,l.location_type,l.farm_name,l.town,l.province,l.owner_type,l.owner_name,
       count(i.id) filter(where i.status<>'Inactive') item_count,
       coalesce(sum(i.quantity*i.unit_cost) filter(where i.status<>'Inactive'),0)::numeric(16,2) stock_value,
       count(i.id) filter(where i.status<>'Inactive' and i.minimum_quantity is not null and i.quantity<=i.minimum_quantity) low_stock_count
from public.inventory_locations l left join public.inventory_items i on i.location_id=l.id
where l.active=true group by l.user_id,l.id;
grant select on public.inventory_location_summary to authenticated;
