-- AGCORE equipment service specifications, checklists and history.
create table if not exists public.equipment_service_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  engine_oil_spec text, engine_oil_capacity numeric,
  hydraulic_oil_spec text, hydraulic_oil_capacity numeric,
  transmission_oil_spec text, transmission_oil_capacity numeric,
  coolant_spec text, coolant_capacity numeric,
  engine_oil_filter text, primary_fuel_filter text, secondary_fuel_filter text,
  hydraulic_filter text, transmission_filter text, primary_air_filter text,
  secondary_air_filter text, cabin_filter text,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, equipment_id)
);

create table if not exists public.equipment_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  service_date date not null,
  engine_hours numeric,
  supplier text,
  total_cost numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.equipment_services add column if not exists supplier text;
alter table public.equipment_services add column if not exists total_cost numeric not null default 0;
alter table public.equipment_services add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.equipment_services add column if not exists equipment_id uuid references public.equipment(id) on delete cascade;
alter table public.equipment_services add column if not exists service_date date;
alter table public.equipment_services add column if not exists engine_hours numeric;
alter table public.equipment_services add column if not exists notes text;
alter table public.equipment_services add column if not exists created_at timestamptz not null default now();

create table if not exists public.equipment_service_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.equipment_services(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  item_type text not null,
  item_name text not null,
  part_number text,
  quantity numeric not null default 1,
  unit text not null default 'each',
  cost numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.equipment_service_profiles enable row level security;
alter table public.equipment_services enable row level security;
alter table public.equipment_service_items enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='equipment_service_profiles' and policyname='equipment_service_profiles_own') then
    create policy equipment_service_profiles_own on public.equipment_service_profiles for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='equipment_services' and policyname='equipment_services_own') then
    create policy equipment_services_own on public.equipment_services for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='equipment_service_items' and policyname='equipment_service_items_own') then
    create policy equipment_service_items_own on public.equipment_service_items for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
  end if;
end $$;

create index if not exists equipment_services_equipment_idx on public.equipment_services(equipment_id, service_date desc);
create index if not exists equipment_service_items_service_idx on public.equipment_service_items(service_id);
