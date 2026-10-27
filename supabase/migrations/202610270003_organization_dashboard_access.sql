-- CropNex v6.34: per-person dashboard access for organisation teams.

alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('Organisation Owner','Organisation Administrator','Director','Field Manager','Analyst','Warehouse Manager','Accountant','Farm Operator','Foreman','Office Manager','Read Only Analyst'));

create table if not exists public.organization_member_dashboard_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null check (module_key in (
    'dashboard','farm-map','fields','planning','activities','scouting','jobs',
    'inventory','equipment','fuel','labour','financials','harvest','transport',
    'grain-market','reports','weather','rainfall','scanner','alerts','assistant',
    'whatsapp-inbox','master-data','offline-sync','settings'
  )),
  enabled boolean not null default true,
  can_edit boolean not null default false,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,user_id,module_key)
);

create index if not exists org_member_dashboard_access_user_idx
  on public.organization_member_dashboard_access(user_id,enabled,organization_id);
alter table public.organization_member_dashboard_access add column if not exists can_edit boolean not null default false;

alter table public.organization_member_dashboard_access enable row level security;
drop policy if exists organization_dashboard_access_read on public.organization_member_dashboard_access;
create policy organization_dashboard_access_read on public.organization_member_dashboard_access
  for select to authenticated using (
    user_id=auth.uid() or public.is_organization_admin(organization_id)
  );
drop policy if exists organization_dashboard_access_manage on public.organization_member_dashboard_access;
create policy organization_dashboard_access_manage on public.organization_member_dashboard_access
  for all to authenticated using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id) and granted_by=auth.uid());

create or replace function public.can_access_organization_module(
  p_organization_id uuid,p_module_key text,p_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_organization_admin(p_organization_id,p_user_id) or exists (
    select 1 from public.organization_members m
    join public.organization_member_dashboard_access a
      on a.organization_id=m.organization_id and a.user_id=m.user_id and a.enabled
    where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active
      and a.module_key=p_module_key
  )
$$;
grant execute on function public.can_access_organization_module(uuid,text,uuid) to authenticated;

create or replace function public.can_edit_organization_module(
  p_organization_id uuid,p_module_key text,p_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_organization_admin(p_organization_id,p_user_id) or exists (
    select 1 from public.organization_members m
    join public.organization_member_dashboard_access a
      on a.organization_id=m.organization_id and a.user_id=m.user_id and a.enabled and a.can_edit
    where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active
      and a.module_key=p_module_key
  )
$$;
grant execute on function public.can_edit_organization_module(uuid,text,uuid) to authenticated;

drop policy if exists organization_farmers_visible on public.organization_farmers;
create policy organization_farmers_visible on public.organization_farmers for select to authenticated using (
  public.is_organization_admin(organization_id) or farmer_user_id=auth.uid()
  or exists (
    select 1 from public.organization_members m
    where m.organization_id=organization_farmers.organization_id and m.user_id=auth.uid() and m.active
      and m.role in ('Director','Accountant','Analyst','Read Only Analyst','Office Manager','Warehouse Manager')
      and exists(select 1 from public.organization_member_dashboard_access a where a.organization_id=m.organization_id and a.user_id=m.user_id and a.enabled)
  )
  or exists(select 1 from public.organization_farmer_assignments a where a.organization_id=organization_farmers.organization_id and a.farmer_user_id=organization_farmers.farmer_user_id and a.manager_user_id=auth.uid() and a.active)
);

create or replace function public.create_organization_with_owner(
  p_name text,p_registration_number text,p_organisation_type text,p_owner_email text
) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare v_owner uuid; v_org uuid;
begin
  if not public.is_agcore_admin(auth.uid()) then raise exception 'CropNex administrator access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Enter an organisation name'; end if;
  select id into v_owner from auth.users where lower(email)=lower(trim(p_owner_email)) limit 1;
  if v_owner is null then raise exception 'The owner must create a CropNex account before the organisation is set up'; end if;
  insert into public.organizations(name,registration_number,organisation_type,country,created_by)
  values(trim(p_name),nullif(trim(p_registration_number),''),coalesce(nullif(trim(p_organisation_type),''),'Agricultural Business'),'South Africa',auth.uid())
  returning id into v_org;
  insert into public.organization_members(organization_id,user_id,role,active,added_by)
  values(v_org,v_owner,'Organisation Owner',true,auth.uid());
  return v_org;
end $$;
grant execute on function public.create_organization_with_owner(text,text,text,text) to authenticated;

drop function if exists public.get_organization_members(uuid);
create function public.get_organization_members(p_organization_id uuid)
returns table(user_id uuid,email text,full_name text,role text,modules text[],edit_modules text[])
language sql stable security definer set search_path=public,auth as $$
  select m.user_id,u.email,coalesce(u.raw_user_meta_data->>'full_name',''),m.role,
    coalesce(array_agg(a.module_key order by a.module_key) filter(where a.enabled),'{}'::text[]),
    coalesce(array_agg(a.module_key order by a.module_key) filter(where a.enabled and a.can_edit),'{}'::text[])
  from public.organization_members m join auth.users u on u.id=m.user_id
  left join public.organization_member_dashboard_access a on a.organization_id=m.organization_id and a.user_id=m.user_id
  where m.organization_id=p_organization_id and m.active
    and public.is_organization_admin(p_organization_id,auth.uid())
  group by m.user_id,u.email,u.raw_user_meta_data,m.role
  order by m.role,u.email
$$;
grant execute on function public.get_organization_members(uuid) to authenticated;

create or replace function public.link_organization_farmer_by_email(p_organization_id uuid,p_email text)
returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare v_farmer uuid;
begin
  if not public.is_organization_admin(p_organization_id,auth.uid()) then raise exception 'Organisation administrator access required'; end if;
  select id into v_farmer from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_farmer is null then raise exception 'No CropNex account exists for that email yet. Ask the farmer to register first.'; end if;
  insert into public.organization_farmers(organization_id,farmer_user_id,access_status,financial_access,planning_access,inventory_access,yield_access,linked_by)
  values(p_organization_id,v_farmer,'Active',true,true,true,true,auth.uid())
  on conflict(organization_id,farmer_user_id) do update set access_status='Active',financial_access=true,linked_by=auth.uid();
  return v_farmer;
end $$;
grant execute on function public.link_organization_farmer_by_email(uuid,text) to authenticated;

create or replace function public.add_organization_member_by_email(
  p_organization_id uuid,p_email text,p_role text,p_module_keys text[],p_edit_module_keys text[] default '{}'::text[]
) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare v_user_id uuid; v_module text;
begin
  if not public.is_organization_admin(p_organization_id,auth.uid()) then
    raise exception 'Organisation administrator access required';
  end if;
  if p_role not in ('Organisation Owner','Organisation Administrator','Director','Field Manager','Analyst','Warehouse Manager','Accountant','Farm Operator','Foreman','Office Manager','Read Only Analyst') then
    raise exception 'Choose a valid organisation role';
  end if;
  select id into v_user_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user_id is null then raise exception 'No CropNex account exists for that email yet. Ask the person to register first.'; end if;
  insert into public.organization_members(organization_id,user_id,role,active,added_by)
  values(p_organization_id,v_user_id,p_role,true,auth.uid())
  on conflict(organization_id,user_id) do update set role=excluded.role,active=true;
  delete from public.organization_member_dashboard_access
    where organization_id=p_organization_id and user_id=v_user_id;
  foreach v_module in array coalesce(p_module_keys,'{}'::text[]) loop
    if v_module not in ('dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour','financials','harvest','transport','grain-market','reports','weather','rainfall','scanner','alerts','assistant','whatsapp-inbox','master-data','offline-sync','settings') then
      raise exception 'Unknown dashboard: %',v_module;
    end if;
    insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,granted_by,can_edit)
    values(p_organization_id,v_user_id,v_module,true,auth.uid(),v_module=any(coalesce(p_edit_module_keys,'{}'::text[])))
    on conflict(organization_id,user_id,module_key) do update set can_edit=excluded.can_edit;
  end loop;
  update public.organization_member_dashboard_access set can_edit=(module_key=any(coalesce(p_edit_module_keys,'{}'::text[]))),updated_at=now()
    where organization_id=p_organization_id and user_id=v_user_id;
  return v_user_id;
end $$;
grant execute on function public.add_organization_member_by_email(uuid,text,text,text[],text[]) to authenticated;

create or replace function public.set_organization_member_dashboards(
  p_organization_id uuid,p_user_id uuid,p_module_keys text[],p_edit_module_keys text[] default '{}'::text[]
) returns void
language plpgsql security definer set search_path=public as $$
declare v_module text;
begin
  if not public.is_organization_admin(p_organization_id,auth.uid()) then raise exception 'Organisation administrator access required'; end if;
  if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_user_id and active) then
    raise exception 'Active organisation team member not found';
  end if;
  delete from public.organization_member_dashboard_access where organization_id=p_organization_id and user_id=p_user_id;
  foreach v_module in array coalesce(p_module_keys,'{}'::text[]) loop
    if v_module not in ('dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour','financials','harvest','transport','grain-market','reports','weather','rainfall','scanner','alerts','assistant','whatsapp-inbox','master-data','offline-sync','settings') then
      raise exception 'Unknown dashboard: %',v_module;
    end if;
    insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,granted_by,can_edit)
    values(p_organization_id,p_user_id,v_module,true,auth.uid(),v_module=any(coalesce(p_edit_module_keys,'{}'::text[])));
  end loop;
  update public.organization_member_dashboard_access set can_edit=(module_key=any(coalesce(p_edit_module_keys,'{}'::text[]))),updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
end $$;
grant execute on function public.set_organization_member_dashboards(uuid,uuid,text[],text[]) to authenticated;

create or replace function public.can_access_farmer(
  p_farmer_user_id uuid,p_capability text default 'view',p_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path=public as $$
  select p_user_id=p_farmer_user_id or public.is_agcore_admin(p_user_id)
  or exists (
    select 1 from public.organization_farmers f
    join public.organization_members m on m.organization_id=f.organization_id and m.user_id=p_user_id and m.active
    where f.farmer_user_id=p_farmer_user_id and f.access_status='Active'
      and m.role in ('Organisation Owner','Organisation Administrator','Director','Accountant','Analyst','Read Only Analyst','Office Manager','Warehouse Manager')
      and public.can_access_organization_module(f.organization_id,
        case p_capability when 'financial' then 'financials' when 'yield' then 'harvest' when 'inventory' then 'inventory' when 'planning' then 'planning' when 'actualise' then 'activities' else p_capability end,p_user_id)
      and (p_capability<>'planning' or f.planning_access)
      and (p_capability<>'inventory' or f.inventory_access)
      and (p_capability<>'yield' or f.yield_access)
      and (p_capability<>'financial' or f.financial_access)
  ) or exists (
    select 1 from public.organization_farmer_assignments a
    join public.organization_farmers f on f.organization_id=a.organization_id and f.farmer_user_id=a.farmer_user_id
    join public.organization_members m on m.organization_id=a.organization_id and m.user_id=a.manager_user_id and m.active
    where a.farmer_user_id=p_farmer_user_id and a.manager_user_id=p_user_id and a.active and f.access_status='Active'
      and public.can_access_organization_module(a.organization_id,
        case p_capability when 'financial' then 'financials' when 'yield' then 'harvest' when 'inventory' then 'inventory' when 'planning' then 'planning' when 'actualise' then 'activities' else p_capability end,p_user_id)
      and (p_capability not in ('planning','actualise','activities','inventory','financial','financials','yield','harvest')
        or (p_capability in ('planning','activities') and a.can_plan)
        or (p_capability='actualise' and a.can_actualise)
        or (p_capability='activities' and a.can_actualise)
        or (p_capability='inventory' and a.can_manage_inventory)
        or (p_capability='financial' and a.can_view_budgets)
        or (p_capability='financials' and a.can_view_budgets)
        or (p_capability in ('yield','harvest') and a.can_view_yield))
  )
$$;
grant execute on function public.can_access_farmer(uuid,text,uuid) to authenticated;

create or replace function public.can_edit_farmer(
  p_farmer_user_id uuid,p_module_key text,p_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path=public as $$
  select p_user_id=p_farmer_user_id or public.is_agcore_admin(p_user_id) or exists (
    select 1 from public.organization_farmers f
    join public.organization_members m on m.organization_id=f.organization_id and m.user_id=p_user_id and m.active
    where f.farmer_user_id=p_farmer_user_id and f.access_status='Active'
      and m.role in ('Organisation Owner','Organisation Administrator','Director','Accountant','Analyst','Read Only Analyst','Office Manager','Warehouse Manager')
      and public.can_edit_organization_module(f.organization_id,p_module_key,p_user_id)
      and (p_module_key<>'financials' or f.financial_access)
      and (p_module_key<>'inventory' or f.inventory_access)
      and (p_module_key<>'harvest' or f.yield_access)
      and (p_module_key<>'planning' or f.planning_access)
  ) or exists (
    select 1 from public.organization_farmer_assignments a
    join public.organization_farmers f on f.organization_id=a.organization_id and f.farmer_user_id=a.farmer_user_id
    where a.farmer_user_id=p_farmer_user_id and a.manager_user_id=p_user_id and a.active and f.access_status='Active'
      and public.can_edit_organization_module(a.organization_id,p_module_key,p_user_id)
      and (p_module_key not in ('planning','activities','inventory','financials','harvest')
        or (p_module_key='planning' and a.can_plan)
        or (p_module_key='activities' and a.can_actualise)
        or (p_module_key='inventory' and a.can_manage_inventory)
        or (p_module_key='financials' and a.can_view_budgets)
        or (p_module_key='harvest' and a.can_view_yield))
  )
$$;
grant execute on function public.can_edit_farmer(uuid,text,uuid) to authenticated;

-- Each shared data set has separate read and write checks. A dashboard grant
-- alone lets a user review that area; editing also requires the explicit edit flag.
do $$ declare r record; begin
  for r in select * from (values
    ('fields','fields'),('farmers','farm-map'),('farms','farm-map'),('map_layers','farm-map'),
    ('activity_plans','planning'),('activity_plan_products','activities'),('activity_plan_operations','activities'),('activities','activities'),
    ('inventory_items','inventory'),('inventory_transactions','inventory'),('inventory_locations','inventory'),('inventory_transfers','inventory'),('inventory_transfer_lines','inventory'),('inventory_stocktakes','inventory'),('inventory_stocktake_counts','inventory'),
    ('harvest_records','harvest'),('financial_transactions','financials'),('field_budgets','financials'),('crop_revenue_forecast','financials'),('business_commitments','financials'),
    ('equipment','equipment'),('fuel_records','fuel'),('fuel_logs','fuel'),('work_orders','jobs'),('scouting_records','scouting'),('scouting_observations','scouting'),
    ('transport_loads','transport'),('transport_load_allocations','transport'),('market_listings','grain-market'),('rain_gauges','rainfall'),('rainfall_readings','rainfall')
  ) as m(table_name,module_key)
  loop
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='user_id') then
      execute format('drop policy if exists organization_authorized_access on public.%I',r.table_name);
      execute format('drop policy if exists organization_dashboard_select on public.%I',r.table_name);
      execute format('drop policy if exists organization_dashboard_insert on public.%I',r.table_name);
      execute format('drop policy if exists organization_dashboard_update on public.%I',r.table_name);
      execute format('drop policy if exists organization_dashboard_delete on public.%I',r.table_name);
      execute format('create policy organization_dashboard_select on public.%I for select to authenticated using (public.can_access_farmer(user_id,%L))',r.table_name,r.module_key);
      execute format('create policy organization_dashboard_insert on public.%I for insert to authenticated with check (public.can_edit_farmer(user_id,%L))',r.table_name,r.module_key);
      execute format('create policy organization_dashboard_update on public.%I for update to authenticated using (public.can_access_farmer(user_id,%L)) with check (public.can_edit_farmer(user_id,%L))',r.table_name,r.module_key,r.module_key);
      execute format('create policy organization_dashboard_delete on public.%I for delete to authenticated using (public.can_edit_farmer(user_id,%L))',r.table_name,r.module_key);
    end if;
  end loop;
end $$;
