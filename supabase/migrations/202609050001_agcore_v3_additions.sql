-- AGCORE v3.0 additive migration
-- Safe for the existing project: creates only new tables/indexes/policies.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  farm_name text,
  province text,
  preferred_currency text not null default 'ZAR',
  area_unit text not null default 'ha',
  updated_at timestamptz not null default now()
);

create table if not exists public.crop_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season text not null,
  crop text not null,
  planned_area_ha numeric(12,2) not null default 0 check (planned_area_ha >= 0),
  target_yield_t_ha numeric(12,2) not null default 0 check (target_yield_t_ha >= 0),
  budget_per_ha numeric(14,2) not null default 0 check (budget_per_ha >= 0),
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  equipment_name text not null,
  litres numeric(12,2) not null check (litres > 0),
  cost_per_litre numeric(12,2) not null default 0 check (cost_per_litre >= 0),
  meter_reading numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists crop_plans_user_season_idx on public.crop_plans(user_id, season);
create index if not exists fuel_logs_user_date_idx on public.fuel_logs(user_id, log_date desc);

alter table public.profiles enable row level security;
alter table public.crop_plans enable row level security;
alter table public.fuel_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_own_rows') then
    create policy profiles_own_rows on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crop_plans' and policyname='crop_plans_own_rows') then
    create policy crop_plans_own_rows on public.crop_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fuel_logs' and policyname='fuel_logs_own_rows') then
    create policy fuel_logs_own_rows on public.fuel_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

