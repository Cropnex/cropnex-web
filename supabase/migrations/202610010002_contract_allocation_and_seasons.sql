-- AGCORE v6.7: FIFO grain-contract pricing and multi-season field boundaries.
create table if not exists public.farm_seasons(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,source_season text,status text not null default 'Active',created_at timestamptz not null default now(),unique(user_id,name)
);
create table if not exists public.user_season_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,current_season text not null,updated_at timestamptz not null default now()
);
create table if not exists public.transport_pricing_allocations(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 transport_allocation_id uuid not null references public.transport_load_allocations(id) on delete cascade,
 grain_position_id uuid references public.grain_positions(id) on delete set null,
 season text,crop text,grade text,priced_tonnes numeric(14,3) not null check(priced_tonnes>0),
 price_per_tonne numeric(14,2) not null default 0,price_source text not null check(price_source in('Contract','SAFEX estimate','Unpriced')),
 contract_reference text,created_at timestamptz not null default now()
);
create index if not exists transport_pricing_allocation_idx on public.transport_pricing_allocations(transport_allocation_id);
alter table public.farm_seasons enable row level security;alter table public.user_season_preferences enable row level security;alter table public.transport_pricing_allocations enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where tablename='farm_seasons' and policyname='farm_seasons_access') then create policy farm_seasons_access on public.farm_seasons for all to authenticated using(public.can_access_farmer(user_id,'planning')) with check(public.can_access_farmer(user_id,'planning'));end if;
 if not exists(select 1 from pg_policies where tablename='user_season_preferences' and policyname='season_preferences_own') then create policy season_preferences_own on public.user_season_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());end if;
 if not exists(select 1 from pg_policies where tablename='transport_pricing_allocations' and policyname='transport_pricing_access') then create policy transport_pricing_access on public.transport_pricing_allocations for all to authenticated using(public.can_access_farmer(user_id,'yield')) with check(public.can_access_farmer(user_id,'yield'));end if;
end $$;

create or replace function public.create_farm_season(p_name text,p_source_season text default null,p_copy_fields boolean default true)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_user uuid:=auth.uid();v_count integer:=0;v_field public.fields%rowtype;
begin
 if nullif(trim(p_name),'') is null then raise exception 'Season name is required';end if;
 insert into public.farm_seasons(user_id,name,source_season) values(v_user,trim(p_name),nullif(trim(p_source_season),'')) on conflict(user_id,name) do nothing;
 if p_copy_fields and nullif(trim(p_source_season),'') is not null then
  for v_field in select * from public.fields where user_id=v_user and season=p_source_season loop
   insert into public.fields(user_id,field_name,farm_name,crop,season,planting_date,cultivar,soil_type,expected_yield,status,area_ha,notes,boundary,farmer_id,farm_id,cultivar_id)
   values(v_user,v_field.field_name,v_field.farm_name,null,trim(p_name),null,null,v_field.soil_type,null,'Unplanned',v_field.area_ha,v_field.notes,v_field.boundary,v_field.farmer_id,v_field.farm_id,null);
   v_count:=v_count+1;
  end loop;
 end if;
 insert into public.user_season_preferences(user_id,current_season) values(v_user,trim(p_name)) on conflict(user_id) do update set current_season=excluded.current_season,updated_at=now();
 return jsonb_build_object('season',trim(p_name),'fields_copied',v_count,'plans_copied',0);
end $$;
grant execute on function public.create_farm_season(text,text,boolean) to authenticated;

create or replace function public.reprice_grain_harvest(p_user_id uuid,p_season text,p_crop text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_row record;v_contract record;v_remaining numeric;v_contract_remaining numeric;v_use numeric;v_safex numeric:=0;v_allocated numeric:=0;
begin
 if not public.can_access_farmer(p_user_id,'yield') then raise exception 'Access denied';end if;
 delete from public.transport_pricing_allocations where user_id=p_user_id and season=p_season and lower(crop)=lower(p_crop);
 select price_per_tonne into v_safex from public.safex_reference_prices where (user_id=p_user_id or user_id is null) and (lower(commodity)=lower(p_crop) or (lower(p_crop) like '%maize%' and lower(commodity) like '%maize%')) order by observed_at desc limit 1;
 for v_row in select a.id allocation_id,a.allocated_tonnes,l.grade,l.load_date from public.transport_load_allocations a join public.transport_loads l on l.id=a.load_id join public.fields f on f.id=a.field_id where a.user_id=p_user_id and l.status='Reconciled' and f.season=p_season and lower(coalesce(f.crop,a.crop_snapshot,''))=lower(p_crop) order by l.load_date,l.created_at,a.created_at loop
  v_remaining:=v_row.allocated_tonnes;
  for v_contract in select gp.*,gp.tonnes-coalesce((select sum(pa.priced_tonnes) from public.transport_pricing_allocations pa where pa.grain_position_id=gp.id),0) available from public.grain_positions gp where gp.user_id=p_user_id and gp.season=p_season and gp.status<>'Cancelled' and gp.price_per_tonne is not null and (lower(gp.commodity)=lower(p_crop) or (lower(p_crop) like '%maize%' and lower(gp.commodity) like '%maize%')) order by gp.contract_date nulls last,gp.created_at loop
   exit when v_remaining<=0;v_contract_remaining:=greatest(v_contract.available,0);if v_contract_remaining<=0 then continue;end if;v_use:=least(v_remaining,v_contract_remaining);
   insert into public.transport_pricing_allocations(user_id,transport_allocation_id,grain_position_id,season,crop,grade,priced_tonnes,price_per_tonne,price_source,contract_reference) values(p_user_id,v_row.allocation_id,v_contract.id,p_season,p_crop,v_row.grade,v_use,v_contract.price_per_tonne,'Contract',coalesce(v_contract.reference,v_contract.buyer_or_broker));v_remaining:=v_remaining-v_use;v_allocated:=v_allocated+v_use;
  end loop;
  if v_remaining>0 then insert into public.transport_pricing_allocations(user_id,transport_allocation_id,season,crop,grade,priced_tonnes,price_per_tonne,price_source,contract_reference) values(p_user_id,v_row.allocation_id,p_season,p_crop,v_row.grade,v_remaining,coalesce(v_safex,0),case when v_safex is null then 'Unpriced' else 'SAFEX estimate' end,null);end if;
 end loop;
 return jsonb_build_object('season',p_season,'crop',p_crop,'contract_tonnes',v_allocated,'safex_price',v_safex);
end $$;
grant execute on function public.reprice_grain_harvest(uuid,text,text) to authenticated;

create or replace view public.field_grain_value_summary with(security_invoker=true) as
select f.user_id,f.id field_id,f.farm_name,f.field_name,f.crop,f.cultivar,f.season,f.area_ha,f.harvest_status,
 coalesce(sum(pa.priced_tonnes),0)::numeric(14,3) reconciled_tonnes,
 coalesce(sum(pa.priced_tonnes*pa.price_per_tonne),0)::numeric(16,2) estimated_income,
 (coalesce(sum(pa.priced_tonnes*pa.price_per_tonne),0)/nullif(sum(pa.priced_tonnes),0))::numeric(14,2) average_price_per_tonne,
 coalesce(sum(pa.priced_tonnes) filter(where pa.price_source='Contract'),0)::numeric(14,3) contract_tonnes,
 coalesce(sum(pa.priced_tonnes) filter(where pa.price_source='SAFEX estimate'),0)::numeric(14,3) safex_tonnes,
 coalesce(sum(pa.priced_tonnes) filter(where pa.price_source='Unpriced'),0)::numeric(14,3) unpriced_tonnes
from public.fields f left join public.transport_load_allocations a on a.field_id=f.id left join public.transport_pricing_allocations pa on pa.transport_allocation_id=a.id group by f.user_id,f.id;
grant select on public.field_grain_value_summary to authenticated;

-- Preserve the v6.6 view name used throughout the app, but price it from FIFO
-- contracts first and the current SAFEX estimate second.
create or replace view public.field_harvest_live_summary with(security_invoker=true) as
with finance as(select user_id,field_id,sum(amount) filter(where transaction_type='Income') booked_income,sum(amount) filter(where transaction_type='Expense') costs from public.financial_transactions where field_id is not null group by user_id,field_id),loads as(select a.field_id,count(distinct l.id) reconciled_loads,max(l.load_date) latest_load from public.transport_load_allocations a join public.transport_loads l on l.id=a.load_id and l.status='Reconciled' group by a.field_id)
select v.user_id,v.field_id,v.farm_name,v.field_name,v.crop,v.cultivar,v.season,v.area_ha,v.harvest_status,f.harvest_completed_at,
 v.reconciled_tonnes,coalesce(l.reconciled_loads,0) reconciled_loads,(v.reconciled_tonnes/nullif(v.area_ha,0))::numeric(14,3) yield_t_ha,
 coalesce(v.average_price_per_tonne,0)::numeric(14,2) market_price_per_tonne,
 coalesce(nullif(fin.booked_income,0),v.estimated_income,0)::numeric(16,2) projected_income,coalesce(fin.costs,0)::numeric(16,2) costs,
 (coalesce(nullif(fin.booked_income,0),v.estimated_income,0)-coalesce(fin.costs,0))::numeric(16,2) margin,l.latest_load,(v.harvest_status='Completed') finished
from public.field_grain_value_summary v join public.fields f on f.id=v.field_id left join finance fin on fin.field_id=v.field_id and fin.user_id=v.user_id left join loads l on l.field_id=v.field_id;
grant select on public.field_harvest_live_summary to authenticated;
