-- AGCORE v6.4: organisation administration, roles and farmer assignments.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  organisation_type text not null default 'Agricultural Business',
  country text not null default 'South Africa',
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(name)
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('Organisation Owner','Organisation Administrator','Director','Field Manager','Analyst','Warehouse Manager')),
  active boolean not null default true,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id,user_id)
);

create table if not exists public.organization_farmers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  farmer_user_id uuid not null references auth.users(id) on delete cascade,
  access_status text not null default 'Active' check(access_status in ('Pending','Active','Suspended','Removed')),
  financial_access boolean not null default false,
  planning_access boolean not null default true,
  inventory_access boolean not null default true,
  yield_access boolean not null default true,
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  unique(organization_id,farmer_user_id)
);

create table if not exists public.organization_farmer_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  farmer_user_id uuid not null references auth.users(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  can_plan boolean not null default true,
  can_actualise boolean not null default true,
  can_manage_inventory boolean not null default true,
  can_view_budgets boolean not null default true,
  can_view_yield boolean not null default true,
  active boolean not null default true,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id,farmer_user_id,manager_user_id)
);

create table if not exists public.organization_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_idx on public.organization_members(user_id,active);
create index if not exists organization_farmers_user_idx on public.organization_farmers(farmer_user_id,access_status);
create index if not exists organization_assignments_manager_idx on public.organization_farmer_assignments(manager_user_id,active);

create or replace function public.is_organization_admin(p_organization_id uuid,p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_agcore_admin(p_user_id) or exists(
    select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_user_id and active
      and role in ('Organisation Owner','Organisation Administrator')
  )
$$;

create or replace function public.can_access_farmer(p_farmer_user_id uuid,p_capability text default 'view',p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select p_user_id=p_farmer_user_id or public.is_agcore_admin(p_user_id) or exists(
    select 1 from public.organization_farmers f join public.organization_members m on m.organization_id=f.organization_id
    where f.farmer_user_id=p_farmer_user_id and f.access_status='Active' and m.user_id=p_user_id and m.active
      and m.role in ('Organisation Owner','Organisation Administrator','Director','Analyst')
      and (p_capability<>'planning' or f.planning_access)
      and (p_capability<>'inventory' or f.inventory_access)
      and (p_capability<>'yield' or f.yield_access)
      and (p_capability<>'financial' or f.financial_access)
  ) or exists(
    select 1 from public.organization_farmer_assignments a join public.organization_farmers f
      on f.organization_id=a.organization_id and f.farmer_user_id=a.farmer_user_id
    where a.farmer_user_id=p_farmer_user_id and a.manager_user_id=p_user_id and a.active and f.access_status='Active'
      and (p_capability not in ('planning','actualise','inventory','financial','yield')
        or (p_capability='planning' and a.can_plan)
        or (p_capability='actualise' and a.can_actualise)
        or (p_capability='inventory' and a.can_manage_inventory)
        or (p_capability='financial' and a.can_view_budgets)
        or (p_capability='yield' and a.can_view_yield))
  )
$$;
grant execute on function public.is_organization_admin(uuid,uuid) to authenticated;
grant execute on function public.can_access_farmer(uuid,text,uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_farmers enable row level security;
alter table public.organization_farmer_assignments enable row level security;
alter table public.organization_audit_log enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where tablename='organizations' and policyname='organizations_visible') then
    create policy organizations_visible on public.organizations for select to authenticated using(public.is_agcore_admin(auth.uid()) or exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=auth.uid() and m.active));
  end if;
  if not exists(select 1 from pg_policies where tablename='organizations' and policyname='organizations_agcore_manage') then
    create policy organizations_agcore_manage on public.organizations for all to authenticated using(public.is_agcore_admin(auth.uid())) with check(public.is_agcore_admin(auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_members' and policyname='organization_members_visible') then
    create policy organization_members_visible on public.organization_members for select to authenticated using(public.is_organization_admin(organization_id) or user_id=auth.uid());
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_members' and policyname='organization_members_manage') then
    create policy organization_members_manage on public.organization_members for all to authenticated using(public.is_organization_admin(organization_id)) with check(public.is_organization_admin(organization_id));
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_farmers' and policyname='organization_farmers_visible') then
    create policy organization_farmers_visible on public.organization_farmers for select to authenticated using(public.is_organization_admin(organization_id) or farmer_user_id=auth.uid() or exists(select 1 from public.organization_members m where m.organization_id=organization_farmers.organization_id and m.user_id=auth.uid() and m.active));
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_farmers' and policyname='organization_farmers_manage') then
    create policy organization_farmers_manage on public.organization_farmers for all to authenticated using(public.is_organization_admin(organization_id)) with check(public.is_organization_admin(organization_id));
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_farmer_assignments' and policyname='organization_assignments_visible') then
    create policy organization_assignments_visible on public.organization_farmer_assignments for select to authenticated using(public.is_organization_admin(organization_id) or farmer_user_id=auth.uid() or manager_user_id=auth.uid());
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_farmer_assignments' and policyname='organization_assignments_manage') then
    create policy organization_assignments_manage on public.organization_farmer_assignments for all to authenticated using(public.is_organization_admin(organization_id)) with check(public.is_organization_admin(organization_id));
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_audit_log' and policyname='organization_audit_visible') then
    create policy organization_audit_visible on public.organization_audit_log for select to authenticated using(public.is_organization_admin(organization_id));
  end if;
  if not exists(select 1 from pg_policies where tablename='organization_audit_log' and policyname='organization_audit_insert') then
    create policy organization_audit_insert on public.organization_audit_log for insert to authenticated with check(public.is_organization_admin(organization_id) and actor_id=auth.uid());
  end if;
end $$;

-- Organisation access to the core farmer datasets. Existing owner policies remain in place.
do $$ declare t text; begin
  foreach t in array array['fields','activity_plans','activity_plan_products','activity_plan_operations','inventory_items','inventory_transactions','inventory_locations','inventory_transfers','inventory_transfer_lines','inventory_stocktakes','inventory_stocktake_counts','harvest_records'] loop
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='user_id')
      and not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='organization_authorized_access') then
      execute format('create policy organization_authorized_access on public.%I for all to authenticated using(public.can_access_farmer(user_id,''view'')) with check(public.can_access_farmer(user_id,''view''))',t);
    end if;
  end loop;
end $$;
