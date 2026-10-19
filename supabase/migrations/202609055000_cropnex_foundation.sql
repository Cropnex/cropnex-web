-- CropNex database foundation.
-- The versioned migrations that follow are upgrades and assume these core
-- tables already exist. This migration creates the first-install baseline.

create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_name text not null,
  farm_name text,
  crop text,
  season text,
  planting_date date,
  cultivar text,
  soil_type text,
  expected_yield numeric(12,3),
  status text not null default 'Active',
  area_ha numeric(12,3) not null default 0 check (area_ha >= 0),
  notes text,
  boundary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  unit text not null default 'unit',
  quantity numeric(14,4) not null default 0,
  minimum_quantity numeric(14,4),
  unit_cost numeric(14,4),
  supplier text,
  batch_number text,
  expiry_date date,
  location text,
  status text not null default 'Active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  transaction_date date not null default current_date,
  transaction_type text not null,
  quantity numeric(14,4) not null,
  unit_cost numeric(14,4),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  field_name text not null,
  crop text,
  date date not null default current_date,
  area_ha numeric(12,3),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  brand text,
  model text,
  registration text,
  serial_number text,
  year integer,
  purchase_date date,
  purchase_price numeric(14,2),
  engine_hours numeric(14,2) not null default 0,
  service_interval numeric(14,2),
  last_service_hours numeric(14,2),
  fuel_type text,
  status text not null default 'Active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid references public.fields(id) on delete set null,
  transaction_date date not null default current_date,
  transaction_type text not null check (transaction_type in ('Income','Expense')),
  category text not null,
  description text not null,
  quantity numeric(14,4),
  unit text,
  unit_price numeric(14,4),
  amount numeric(16,2) not null default 0,
  supplier_or_customer text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grain_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season text not null,
  commodity text not null,
  position_type text not null default 'Contract',
  contract_date date,
  delivery_month text,
  tonnes numeric(14,3) not null default 0 check (tonnes >= 0),
  price_per_tonne numeric(14,2),
  strike_price numeric(14,2),
  premium_per_tonne numeric(14,2),
  buyer_or_broker text,
  reference text,
  status text not null default 'Open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.harvest_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete restrict,
  harvest_date date not null default current_date,
  crop text,
  season text,
  area_ha numeric(12,3) not null default 0,
  tonnes_harvested numeric(14,3) not null default 0,
  moisture_percent numeric(6,3),
  quality_grade text,
  destination_type text,
  destination_name text,
  price_per_tonne numeric(14,2),
  transport_cost numeric(14,2),
  other_cost numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.production_forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season text not null,
  commodity text not null,
  expected_tonnes numeric(14,3) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  field_id uuid references public.fields(id) on delete set null,
  field_name text,
  activity_type text not null,
  planned_date date,
  operator_name text,
  equipment_id uuid references public.equipment(id) on delete set null,
  implement_name text,
  estimated_hours numeric(12,2),
  diesel_litres numeric(12,2),
  status text not null default 'Planned',
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_order_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  product_name text not null,
  quantity numeric(14,4) not null default 0,
  unit text not null default 'unit',
  unit_cost numeric(14,4),
  created_at timestamptz not null default now()
);

create table if not exists public.field_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  season text,
  expected_yield numeric(12,3),
  expected_price numeric(14,2),
  budgeted_cost_per_ha numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, field_id, season)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'Farm worker',
  phone text,
  email text,
  hourly_rate numeric(12,2),
  employment_type text not null default 'Permanent',
  status text not null default 'Active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labour_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  field_id uuid references public.fields(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  work_date date not null default current_date,
  start_time time,
  end_time time,
  hours_worked numeric(10,2) not null default 0,
  activity_type text,
  description text,
  hourly_rate numeric(12,2),
  total_cost numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  low_stock_enabled boolean not null default true,
  service_due_enabled boolean not null default true,
  overdue_jobs_enabled boolean not null default true,
  negative_margin_enabled boolean not null default true,
  unpriced_grain_enabled boolean not null default true,
  upcoming_jobs_days integer not null default 7 check (upcoming_jobs_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fields_user_season_idx on public.fields(user_id, season);
create index if not exists inventory_items_user_idx on public.inventory_items(user_id, name);
create index if not exists inventory_transactions_user_date_idx on public.inventory_transactions(user_id, transaction_date desc);
create index if not exists activities_user_date_idx on public.activities(user_id, date desc);
create index if not exists equipment_user_idx on public.equipment(user_id, name);
create index if not exists financial_transactions_user_date_idx on public.financial_transactions(user_id, transaction_date desc);
create index if not exists grain_positions_user_season_idx on public.grain_positions(user_id, season);
create index if not exists harvest_records_user_date_idx on public.harvest_records(user_id, harvest_date desc);
create index if not exists work_orders_user_date_idx on public.work_orders(user_id, planned_date);
create index if not exists labour_entries_user_date_idx on public.labour_entries(user_id, work_date desc);

alter table public.fields enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.activities enable row level security;
alter table public.equipment enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.grain_positions enable row level security;
alter table public.harvest_records enable row level security;
alter table public.production_forecasts enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_products enable row level security;
alter table public.field_budgets enable row level security;
alter table public.employees enable row level security;
alter table public.labour_entries enable row level security;
alter table public.alert_preferences enable row level security;

create policy cropnex_fields_owner on public.fields for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_inventory_items_owner on public.inventory_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_inventory_transactions_owner on public.inventory_transactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_activities_owner on public.activities for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_equipment_owner on public.equipment for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_financial_transactions_owner on public.financial_transactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_grain_positions_owner on public.grain_positions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_harvest_records_owner on public.harvest_records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_production_forecasts_owner on public.production_forecasts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_work_orders_owner on public.work_orders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_work_order_products_owner on public.work_order_products for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_field_budgets_owner on public.field_budgets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_employees_owner on public.employees for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_labour_entries_owner on public.labour_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cropnex_alert_preferences_owner on public.alert_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
