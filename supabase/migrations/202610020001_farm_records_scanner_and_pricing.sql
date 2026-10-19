-- AGCORE v6.8: diesel logbook, rainfall gauges, document scanner queue and crop price scenarios.
alter table public.fuel_logs add column if not exists equipment_id uuid references public.equipment(id) on delete set null;
alter table public.fuel_logs add column if not exists activity_type text;
alter table public.fuel_logs add column if not exists field_id uuid references public.fields(id) on delete set null;
alter table public.fuel_logs add column if not exists hours_worked numeric(12,2);
alter table public.fuel_logs add column if not exists operator_name text;
alter table public.fuel_logs add column if not exists reference text;

create table if not exists public.rain_gauges(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,farm_name text,latitude numeric(10,7),longitude numeric(10,7),active boolean not null default true,
 notes text,created_at timestamptz not null default now(),unique(user_id,name)
);
create table if not exists public.rainfall_readings(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 gauge_id uuid not null references public.rain_gauges(id) on delete cascade,reading_date date not null,
 rainfall_mm numeric(10,2) not null check(rainfall_mm>=0),notes text,created_at timestamptz not null default now(),
 unique(gauge_id,reading_date)
);
create table if not exists public.crop_price_scenarios(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 season text not null,crop text not null,manual_price_per_tonne numeric(14,2) not null check(manual_price_per_tonne>=0),
 effective_date date not null default current_date,notes text,updated_at timestamptz not null default now(),
 unique(user_id,season,crop)
);
create table if not exists public.document_scans(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 document_type text not null check(document_type in('Transport delivery note','Inventory receipt')),
 file_name text not null,storage_path text,scan_status text not null default 'Review' check(scan_status in('Review','Confirmed','Rejected','Failed')),
 extracted_data jsonb not null default '{}'::jsonb,confidence numeric(5,2),target_record_id uuid,
 confirmed_at timestamptz,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists fuel_logs_equipment_date_idx on public.fuel_logs(equipment_id,log_date desc);
create index if not exists rainfall_readings_gauge_date_idx on public.rainfall_readings(gauge_id,reading_date desc);
create index if not exists document_scans_user_status_idx on public.document_scans(user_id,scan_status,created_at desc);

alter table public.rain_gauges enable row level security;alter table public.rainfall_readings enable row level security;
alter table public.crop_price_scenarios enable row level security;alter table public.document_scans enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where tablename='rain_gauges' and policyname='rain_gauges_own') then create policy rain_gauges_own on public.rain_gauges for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());end if;
 if not exists(select 1 from pg_policies where tablename='rainfall_readings' and policyname='rainfall_readings_own') then create policy rainfall_readings_own on public.rainfall_readings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());end if;
 if not exists(select 1 from pg_policies where tablename='crop_price_scenarios' and policyname='crop_price_scenarios_access') then create policy crop_price_scenarios_access on public.crop_price_scenarios for all to authenticated using(public.can_access_farmer(user_id,'financial')) with check(public.can_access_farmer(user_id,'financial'));end if;
 if not exists(select 1 from pg_policies where tablename='document_scans' and policyname='document_scans_own') then create policy document_scans_own on public.document_scans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());end if;
end $$;

create or replace view public.diesel_consumption_summary with(security_invoker=true) as
select l.user_id,l.equipment_id,coalesce(e.name,l.equipment_name) equipment_name,l.activity_type,
 sum(l.litres)::numeric(14,2) litres,sum(coalesce(l.hours_worked,0))::numeric(14,2) hours_worked,
 (sum(l.litres)/nullif(sum(coalesce(l.hours_worked,0)),0))::numeric(14,2) litres_per_hour,
 sum(l.litres*l.cost_per_litre)::numeric(16,2) total_cost,count(*) entries
from public.fuel_logs l left join public.equipment e on e.id=l.equipment_id
group by l.user_id,l.equipment_id,coalesce(e.name,l.equipment_name),l.activity_type;
grant select on public.diesel_consumption_summary to authenticated;

create or replace view public.rainfall_season_summary with(security_invoker=true) as
select g.user_id,g.id gauge_id,g.name gauge_name,g.farm_name,
 extract(year from r.reading_date)::int calendar_year,sum(r.rainfall_mm)::numeric(12,2) rainfall_mm,
 count(*) reading_days,max(r.reading_date) latest_reading
from public.rain_gauges g left join public.rainfall_readings r on r.gauge_id=g.id
group by g.user_id,g.id,extract(year from r.reading_date);
grant select on public.rainfall_season_summary to authenticated;

-- Expected crop revenue uses signed contracts first and the farmer's editable crop price for remaining expected production.
create or replace view public.crop_revenue_forecast with(security_invoker=true) as
with production as(
 select f.user_id,f.season,f.crop,sum(coalesce(f.area_ha,0)*coalesce(f.expected_yield,0)) expected_tonnes
 from public.fields f where f.crop is not null group by f.user_id,f.season,f.crop
),contracts as(
 select user_id,season,commodity crop,sum(tonnes) filter(where status<>'Cancelled') contract_tonnes,
 sum(tonnes*price_per_tonne) filter(where status<>'Cancelled' and price_per_tonne is not null) contract_value
 from public.grain_positions group by user_id,season,commodity
)
select p.user_id,p.season,p.crop,p.expected_tonnes,least(p.expected_tonnes,coalesce(c.contract_tonnes,0))::numeric(14,3) contract_tonnes,
 greatest(p.expected_tonnes-coalesce(c.contract_tonnes,0),0)::numeric(14,3) estimated_tonnes,
 s.manual_price_per_tonne,
 (coalesce(c.contract_value,0)+greatest(p.expected_tonnes-coalesce(c.contract_tonnes,0),0)*coalesce(s.manual_price_per_tonne,0))::numeric(16,2) forecast_income,
 ((coalesce(c.contract_value,0)+greatest(p.expected_tonnes-coalesce(c.contract_tonnes,0),0)*coalesce(s.manual_price_per_tonne,0))/nullif(p.expected_tonnes,0))::numeric(14,2) weighted_price_per_tonne
from production p left join contracts c on c.user_id=p.user_id and c.season=p.season and lower(c.crop)=lower(p.crop)
left join public.crop_price_scenarios s on s.user_id=p.user_id and s.season=p.season and lower(s.crop)=lower(p.crop);
grant select on public.crop_revenue_forecast to authenticated;

