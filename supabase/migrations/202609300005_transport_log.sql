-- AGCORE v6.5: grain transport loads, field allocations and harvest completion.
create table if not exists public.transport_loads (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 load_number text not null, load_date date not null, destination_name text, truck_registration text,
 trailer_registration text, driver_name text, transporter text, ticket_number text,
 gross_tonnes numeric(14,3), tare_tonnes numeric(14,3), net_tonnes numeric(14,3) not null default 0,
 accepted_tonnes numeric(14,3), rejected_tonnes numeric(14,3), moisture_percent numeric(7,3), grade text,
 status text not null default 'Planned' check(status in ('Planned','Loaded','Dispatched','Delivered','Weighed','Reconciled','Exception')),
 notes text, source text not null default 'Web', created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,load_number)
);
create table if not exists public.transport_load_allocations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 load_id uuid not null references public.transport_loads(id) on delete cascade,
 field_id uuid not null references public.fields(id) on delete restrict,
 allocated_tonnes numeric(14,3) not null check(allocated_tonnes>0), crop_snapshot text, cultivar_snapshot text,
 season_snapshot text, field_harvest_complete boolean not null default false, completion_date date, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.transport_destinations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null, destination_type text not null default 'Buyer', town text, active boolean not null default true,
 created_at timestamptz not null default now(), unique(user_id,name)
);
create table if not exists public.transport_vehicles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 registration text not null, trailer_registration text, driver_name text, transporter text, active boolean not null default true,
 created_at timestamptz not null default now(), unique(user_id,registration)
);
alter table public.fields add column if not exists harvest_status text not null default 'Not started';
alter table public.fields add column if not exists harvest_completed_at date;
create index if not exists transport_loads_user_date_idx on public.transport_loads(user_id,load_date desc);
create index if not exists transport_allocations_field_idx on public.transport_load_allocations(field_id,completion_date);
alter table public.transport_loads enable row level security;alter table public.transport_load_allocations enable row level security;
alter table public.transport_destinations enable row level security;alter table public.transport_vehicles enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where tablename='transport_loads' and policyname='transport_loads_access') then create policy transport_loads_access on public.transport_loads for all to authenticated using(public.can_access_farmer(user_id,'yield')) with check(public.can_access_farmer(user_id,'yield')); end if;
 if not exists(select 1 from pg_policies where tablename='transport_load_allocations' and policyname='transport_allocations_access') then create policy transport_allocations_access on public.transport_load_allocations for all to authenticated using(public.can_access_farmer(user_id,'yield')) with check(public.can_access_farmer(user_id,'yield')); end if;
 if not exists(select 1 from pg_policies where tablename='transport_destinations' and policyname='transport_destinations_access') then create policy transport_destinations_access on public.transport_destinations for all to authenticated using(public.can_access_farmer(user_id,'yield')) with check(public.can_access_farmer(user_id,'yield')); end if;
 if not exists(select 1 from pg_policies where tablename='transport_vehicles' and policyname='transport_vehicles_access') then create policy transport_vehicles_access on public.transport_vehicles for all to authenticated using(public.can_access_farmer(user_id,'yield')) with check(public.can_access_farmer(user_id,'yield')); end if;
end $$;

create or replace function public.complete_transport_field_harvest(p_field_id uuid,p_completion_date date,p_notes text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_field public.fields%rowtype;v_tonnes numeric:=0;v_plan_id uuid;v_activity_type text;
begin
 select * into v_field from public.fields where id=p_field_id for update;
 if not found or not public.can_access_farmer(v_field.user_id,'actualise') then raise exception 'Field not found or access denied';end if;
 select coalesce(sum(a.allocated_tonnes),0) into v_tonnes from public.transport_load_allocations a join public.transport_loads l on l.id=a.load_id where a.field_id=p_field_id and l.status='Reconciled';
 if v_tonnes<=0 then raise exception 'No reconciled tonnes were found for this field';end if;
 update public.fields set harvest_status='Completed',harvest_completed_at=p_completion_date where id=p_field_id;
 update public.transport_load_allocations set field_harvest_complete=true,completion_date=p_completion_date,updated_at=now() where field_id=p_field_id and user_id=v_field.user_id;
 select id,activity_type into v_plan_id,v_activity_type from public.activity_plans where field_id=p_field_id and status='Planned' and activity_type ilike '%harvest%' order by planned_date desc limit 1 for update;
 if v_plan_id is not null then
   update public.activity_plan_products set actual_rate_per_ha=coalesce(actual_rate_per_ha,planned_rate_per_ha),actual_quantity=coalesce(actual_quantity,planned_quantity),actual_unit_price=coalesce(actual_unit_price,planned_unit_price),actual_cost=coalesce(actual_cost,planned_cost) where plan_id=v_plan_id;
   update public.activity_plan_operations set actual_rate_per_ha=coalesce(actual_rate_per_ha,planned_rate_per_ha),actual_quantity=coalesce(actual_quantity,planned_quantity),actual_unit_price=coalesce(actual_unit_price,planned_unit_price),actual_cost=coalesce(actual_cost,planned_cost) where plan_id=v_plan_id;
   update public.activity_plans set status='Actualised',actual_date=p_completion_date,actual_total=planned_total,actual_notes=concat('Completed from Transport Log · ',round(v_tonnes,3),' t',case when p_notes is not null then ' · '||p_notes else '' end),updated_at=now() where id=v_plan_id;
 end if;
 insert into public.activities(user_id,activity_type,field_name,crop,date,area_ha,notes) values(v_field.user_id,coalesce(v_activity_type,'Harvesting'),v_field.field_name,v_field.crop,p_completion_date,v_field.area_ha,concat(round(v_tonnes,3),' t reconciled · ',round(v_tonnes/nullif(v_field.area_ha,0),3),' t/ha',case when p_notes is not null then ' · '||p_notes else '' end));
 return jsonb_build_object('field_id',p_field_id,'tonnes',v_tonnes,'yield_per_ha',v_tonnes/nullif(v_field.area_ha,0),'actualised_plan_id',v_plan_id);
end $$;
grant execute on function public.complete_transport_field_harvest(uuid,date,text) to authenticated;

create or replace view public.transport_field_yield_summary with(security_invoker=true) as
select f.user_id,f.id field_id,f.farm_name,f.field_name,f.crop,f.cultivar,f.season,f.area_ha,f.harvest_status,f.harvest_completed_at,
 coalesce(sum(a.allocated_tonnes) filter(where l.status='Reconciled'),0)::numeric(14,3) reconciled_tonnes,
 (coalesce(sum(a.allocated_tonnes) filter(where l.status='Reconciled'),0)/nullif(f.area_ha,0))::numeric(14,3) yield_t_ha,
 count(distinct l.id) filter(where l.status='Reconciled') reconciled_loads
from public.fields f left join public.transport_load_allocations a on a.field_id=f.id left join public.transport_loads l on l.id=a.load_id group by f.user_id,f.id;
grant select on public.transport_field_yield_summary to authenticated;
