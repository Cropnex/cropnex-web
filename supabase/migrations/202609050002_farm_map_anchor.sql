-- AGCORE v3.1 farm identity and map anchor
create table if not exists public.farm_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  farmer_name text,
  main_farm_name text,
  latitude double precision,
  longitude double precision,
  updated_at timestamptz not null default now()
);

alter table public.farm_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='farm_settings' and policyname='farm_settings_own_row') then
    create policy farm_settings_own_row on public.farm_settings
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
