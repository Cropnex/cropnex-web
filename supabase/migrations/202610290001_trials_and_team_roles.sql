-- CropNex Trials, trial images, employee job assignment and team role presets.

alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members add constraint organization_members_role_check check (role in (
  'Organisation Owner','Organisation Administrator','Director','Field Manager','Analyst','Warehouse Manager',
  'Accountant','Farm Operator','Foreman','Office Manager','Read Only Analyst','Farmer','Employee'
));

alter table public.organization_member_dashboard_access drop constraint if exists organization_member_dashboard_access_module_key_check;
alter table public.organization_member_dashboard_access add constraint organization_member_dashboard_access_module_key_check check (module_key in (
  'dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour',
  'financials','harvest','transport','grain-market','reports','trials','weather','rainfall','scanner','alerts',
  'assistant','whatsapp-inbox','master-data','offline-sync','settings'
));

create table if not exists public.trials (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade, season text not null,
  name text not null, crop text, cultivar text, objective text, start_date date, end_date date,
  crop_price_per_tonne numeric(14,2) not null default 0 check(crop_price_per_tonne>=0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.trial_treatments (
  id uuid primary key default gen_random_uuid(), trial_id uuid not null references public.trials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, name text not null,
  is_control boolean not null default false, operation_cost_per_ha numeric(14,2) not null default 0,
  notes text, created_at timestamptz not null default now()
);
create table if not exists public.trial_inputs (
  id uuid primary key default gen_random_uuid(), trial_id uuid not null references public.trials(id) on delete cascade,
  treatment_id uuid not null references public.trial_treatments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_type text not null check(input_type in ('Seed','Product','Operation')),
  product_name text not null, rate numeric(14,4) not null default 0 check(rate>=0), rate_unit text not null default 'per ha',
  unit_price numeric(14,2) not null default 0 check(unit_price>=0), notes text, created_at timestamptz not null default now()
);
create table if not exists public.trial_strips (
  id uuid primary key default gen_random_uuid(), trial_id uuid not null references public.trials(id) on delete cascade,
  treatment_id uuid not null references public.trial_treatments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  strip_name text not null, area_ha numeric(12,4) not null check(area_ha>0),
  yield_source text not null default 'Manual' check(yield_source in ('Manual','Field average')),
  tonnes numeric(14,3) not null default 0 check(tonnes>=0), moisture numeric(7,3), record_date date, notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.trial_photos (
  id uuid primary key default gen_random_uuid(), trial_id uuid not null references public.trials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, object_path text not null,
  caption text, created_at timestamptz not null default now()
);
grant select,insert,update,delete on public.trials,public.trial_treatments,public.trial_inputs,public.trial_strips,public.trial_photos to authenticated;
alter table public.trial_treatments add constraint trial_treatments_trial_id_id_unique unique(trial_id,id);
alter table public.trial_inputs add constraint trial_inputs_treatment_in_trial_fk foreign key(trial_id,treatment_id) references public.trial_treatments(trial_id,id) on delete cascade;
alter table public.trial_strips add constraint trial_strips_treatment_in_trial_fk foreign key(trial_id,treatment_id) references public.trial_treatments(trial_id,id) on delete cascade;

do $$ declare t text; begin
  foreach t in array array['trials','trial_treatments','trial_inputs','trial_strips','trial_photos'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists trials_team_read on public.%I',t);
    execute format('drop policy if exists trials_team_insert on public.%I',t);
    execute format('drop policy if exists trials_team_update on public.%I',t);
    execute format('drop policy if exists trials_team_delete on public.%I',t);
    execute format('create policy trials_team_read on public.%I for select to authenticated using (public.can_access_farmer(user_id,''trials''))',t);
    execute format('create policy trials_team_insert on public.%I for insert to authenticated with check (public.can_edit_farmer(user_id,''trials''))',t);
    execute format('create policy trials_team_update on public.%I for update to authenticated using (public.can_access_farmer(user_id,''trials'')) with check (public.can_edit_farmer(user_id,''trials''))',t);
    execute format('create policy trials_team_delete on public.%I for delete to authenticated using (public.can_edit_farmer(user_id,''trials''))',t);
  end loop;
end $$;

-- Child records must belong to the same farmer and trial as their parent.
do $$ declare t text; begin
  foreach t in array array['trial_treatments','trial_inputs','trial_strips','trial_photos'] loop
    execute format('drop policy if exists trials_team_read on public.%I',t);
    execute format('drop policy if exists trials_team_insert on public.%I',t);
    execute format('drop policy if exists trials_team_update on public.%I',t);
    execute format('drop policy if exists trials_team_delete on public.%I',t);
    execute format('create policy trials_team_read on public.%I for select to authenticated using (exists(select 1 from public.trials p where p.id=trial_id and p.user_id=%I.user_id and public.can_access_farmer(p.user_id,''trials'')))',t,t);
    execute format('create policy trials_team_insert on public.%I for insert to authenticated with check (exists(select 1 from public.trials p where p.id=trial_id and p.user_id=%I.user_id and public.can_edit_farmer(p.user_id,''trials'')))',t,t);
    execute format('create policy trials_team_update on public.%I for update to authenticated using (exists(select 1 from public.trials p where p.id=trial_id and p.user_id=%I.user_id and public.can_access_farmer(p.user_id,''trials''))) with check (exists(select 1 from public.trials p where p.id=trial_id and p.user_id=%I.user_id and public.can_edit_farmer(p.user_id,''trials'')))',t,t,t);
    execute format('create policy trials_team_delete on public.%I for delete to authenticated using (exists(select 1 from public.trials p where p.id=trial_id and p.user_id=%I.user_id and public.can_edit_farmer(p.user_id,''trials'')))',t,t);
  end loop;
end $$;

-- Existing access helpers preserve the organisation model while making Employee dashboards viewable.
create or replace function public.can_access_farmer(p_farmer_user_id uuid,p_capability text default 'view',p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select p_user_id=p_farmer_user_id or public.is_agcore_admin(p_user_id)
  or exists (
    select 1 from public.organization_farmers f join public.organization_members m on m.organization_id=f.organization_id and m.user_id=p_user_id and m.active
    where f.farmer_user_id=p_farmer_user_id and f.access_status='Active'
      and m.role in ('Organisation Owner','Organisation Administrator','Director','Accountant','Analyst','Read Only Analyst','Office Manager','Warehouse Manager','Farmer','Employee')
      and public.can_access_organization_module(f.organization_id,case p_capability when 'financial' then 'financials' when 'yield' then 'harvest' when 'inventory' then 'inventory' when 'planning' then 'planning' when 'actualise' then 'activities' else p_capability end,p_user_id)
      and (p_capability<>'planning' or f.planning_access) and (p_capability<>'inventory' or f.inventory_access)
      and (p_capability<>'yield' or f.yield_access) and (p_capability<>'financial' or f.financial_access)
  ) or exists (
    select 1 from public.organization_farmer_assignments a join public.organization_farmers f on f.organization_id=a.organization_id and f.farmer_user_id=a.farmer_user_id
      join public.organization_members m on m.organization_id=a.organization_id and m.user_id=a.manager_user_id and m.active
    where a.farmer_user_id=p_farmer_user_id and a.manager_user_id=p_user_id and a.active and f.access_status='Active'
      and public.can_access_organization_module(a.organization_id,case p_capability when 'financial' then 'financials' when 'yield' then 'harvest' when 'inventory' then 'inventory' when 'planning' then 'planning' when 'actualise' then 'activities' else p_capability end,p_user_id)
      and (p_capability not in ('planning','actualise','activities','inventory','financial','financials','yield','harvest')
        or (p_capability in ('planning','activities') and a.can_plan) or (p_capability='actualise' and a.can_actualise)
        or (p_capability='activities' and a.can_actualise) or (p_capability='inventory' and a.can_manage_inventory)
        or (p_capability in ('financial','financials') and a.can_view_budgets) or (p_capability in ('yield','harvest') and a.can_view_yield))
  )
$$;
grant execute on function public.can_access_farmer(uuid,text,uuid) to authenticated;

-- Keep the established edit checks, but allow the new Farmer role to use explicit edit grants.
create or replace function public.can_edit_farmer(p_farmer_user_id uuid,p_module_key text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select p_user_id=p_farmer_user_id or public.is_agcore_admin(p_user_id) or exists (
    select 1 from public.organization_farmers f join public.organization_members m on m.organization_id=f.organization_id and m.user_id=p_user_id and m.active
    where f.farmer_user_id=p_farmer_user_id and f.access_status='Active'
      and m.role in ('Organisation Owner','Organisation Administrator','Director','Accountant','Analyst','Read Only Analyst','Office Manager','Warehouse Manager','Farmer')
      and public.can_edit_organization_module(f.organization_id,p_module_key,p_user_id)
      and (p_module_key<>'financials' or f.financial_access) and (p_module_key<>'inventory' or f.inventory_access)
      and (p_module_key<>'harvest' or f.yield_access) and (p_module_key<>'planning' or f.planning_access)
  ) or exists (
    select 1 from public.organization_farmer_assignments a join public.organization_farmers f on f.organization_id=a.organization_id and f.farmer_user_id=a.farmer_user_id
    where a.farmer_user_id=p_farmer_user_id and a.manager_user_id=p_user_id and a.active and f.access_status='Active'
      and public.can_edit_organization_module(a.organization_id,p_module_key,p_user_id)
      and (p_module_key not in ('planning','activities','inventory','financials','harvest') or (p_module_key='planning' and a.can_plan)
        or (p_module_key='activities' and a.can_actualise) or (p_module_key='inventory' and a.can_manage_inventory)
        or (p_module_key='financials' and a.can_view_budgets) or (p_module_key='harvest' and a.can_view_yield))
  )
$$;
grant execute on function public.can_edit_farmer(uuid,text,uuid) to authenticated;

create or replace function public.add_organization_member_by_email(p_organization_id uuid,p_email text,p_role text,p_module_keys text[],p_edit_module_keys text[] default '{}'::text[])
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_user_id uuid; v_module text;
begin
  if not public.is_organization_admin(p_organization_id,auth.uid()) then raise exception 'Organisation administrator access required'; end if;
  if p_role not in ('Organisation Owner','Organisation Administrator','Director','Field Manager','Analyst','Warehouse Manager','Accountant','Farm Operator','Foreman','Office Manager','Read Only Analyst','Farmer','Employee') then raise exception 'Choose a valid organisation role'; end if;
  select id into v_user_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user_id is null then raise exception 'No CropNex account exists for that email yet. Ask the person to register first.'; end if;
  insert into public.organization_members(organization_id,user_id,role,active,added_by) values(p_organization_id,v_user_id,p_role,true,auth.uid())
    on conflict(organization_id,user_id) do update set role=excluded.role,active=true;
  delete from public.organization_member_dashboard_access where organization_id=p_organization_id and user_id=v_user_id;
  foreach v_module in array coalesce(p_module_keys,'{}'::text[]) loop
    if v_module not in ('dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour','financials','harvest','transport','grain-market','reports','trials','weather','rainfall','scanner','alerts','assistant','whatsapp-inbox','master-data','offline-sync','settings') then raise exception 'Unknown dashboard: %',v_module; end if;
    insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,granted_by,can_edit)
      values(p_organization_id,v_user_id,v_module,true,auth.uid(),v_module=any(coalesce(p_edit_module_keys,'{}'::text[])) and p_role<>'Employee');
  end loop;
  update public.organization_member_dashboard_access set can_edit=(module_key=any(coalesce(p_edit_module_keys,'{}'::text[])) and p_role<>'Employee'),updated_at=now() where organization_id=p_organization_id and user_id=v_user_id;
  return v_user_id;
end $$;
grant execute on function public.add_organization_member_by_email(uuid,text,text,text[],text[]) to authenticated;

create or replace function public.set_organization_member_dashboards(p_organization_id uuid,p_user_id uuid,p_module_keys text[],p_edit_module_keys text[] default '{}'::text[])
returns void language plpgsql security definer set search_path=public as $$
declare v_module text; v_role text;
begin
  if not public.is_organization_admin(p_organization_id,auth.uid()) then raise exception 'Organisation administrator access required'; end if;
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=p_user_id and active;
  if v_role is null then raise exception 'Active organisation team member not found'; end if;
  delete from public.organization_member_dashboard_access where organization_id=p_organization_id and user_id=p_user_id;
  foreach v_module in array coalesce(p_module_keys,'{}'::text[]) loop
    if v_module not in ('dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour','financials','harvest','transport','grain-market','reports','trials','weather','rainfall','scanner','alerts','assistant','whatsapp-inbox','master-data','offline-sync','settings') then raise exception 'Unknown dashboard: %',v_module; end if;
    insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,granted_by,can_edit)
      values(p_organization_id,p_user_id,v_module,true,auth.uid(),v_module=any(coalesce(p_edit_module_keys,'{}'::text[])) and v_role<>'Employee');
  end loop;
end $$;
grant execute on function public.set_organization_member_dashboards(uuid,uuid,text[],text[]) to authenticated;

drop policy if exists organization_farmers_visible on public.organization_farmers;
create policy organization_farmers_visible on public.organization_farmers for select to authenticated using (
  public.is_organization_admin(organization_id) or farmer_user_id=auth.uid()
  or exists(select 1 from public.organization_members m where m.organization_id=organization_farmers.organization_id and m.user_id=auth.uid() and m.active
    and m.role in ('Director','Accountant','Analyst','Read Only Analyst','Office Manager','Warehouse Manager','Farmer','Employee')
    and exists(select 1 from public.organization_member_dashboard_access a where a.organization_id=m.organization_id and a.user_id=m.user_id and a.enabled))
  or exists(select 1 from public.organization_farmer_assignments a where a.organization_id=organization_farmers.organization_id and a.farmer_user_id=organization_farmers.farmer_user_id and a.manager_user_id=auth.uid() and a.active)
);

alter table public.work_orders add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='work_order_products' and column_name='user_id') then
    alter table public.work_order_products enable row level security;
    drop policy if exists organization_dashboard_select on public.work_order_products;
    drop policy if exists organization_dashboard_insert on public.work_order_products;
    drop policy if exists organization_dashboard_update on public.work_order_products;
    drop policy if exists organization_dashboard_delete on public.work_order_products;
    create policy organization_dashboard_select on public.work_order_products for select to authenticated using (public.can_access_farmer(user_id,'jobs'));
    create policy organization_dashboard_insert on public.work_order_products for insert to authenticated with check (public.can_edit_farmer(user_id,'jobs'));
    create policy organization_dashboard_update on public.work_order_products for update to authenticated using (public.can_access_farmer(user_id,'jobs')) with check (public.can_edit_farmer(user_id,'jobs'));
    create policy organization_dashboard_delete on public.work_order_products for delete to authenticated using (public.can_edit_farmer(user_id,'jobs'));
  end if;
end $$;
create or replace function public.get_organization_job_assignees(p_farmer_user_id uuid)
returns table(user_id uuid,full_name text) language sql stable security definer set search_path=public,auth as $$
  select distinct m.user_id,coalesce(u.raw_user_meta_data->>'full_name',u.email) as full_name
  from public.organization_farmers f join public.organization_members m on m.organization_id=f.organization_id and m.active and m.role='Employee'
    join auth.users u on u.id=m.user_id
  where f.farmer_user_id=p_farmer_user_id and f.access_status='Active'
    and public.can_edit_farmer(p_farmer_user_id,'jobs',auth.uid())
  order by full_name
$$;
grant execute on function public.get_organization_job_assignees(uuid) to authenticated;

insert into storage.buckets(id,name,public) values('trial-photos','trial-photos',false) on conflict(id) do nothing;
drop policy if exists trial_photos_read on storage.objects;
create policy trial_photos_read on storage.objects for select to authenticated using (
  bucket_id='trial-photos' and public.can_access_farmer((storage.foldername(name))[1]::uuid,'trials')
);
drop policy if exists trial_photos_add on storage.objects;
create policy trial_photos_add on storage.objects for insert to authenticated with check (
  bucket_id='trial-photos' and public.can_edit_farmer((storage.foldername(name))[1]::uuid,'trials')
);
drop policy if exists trial_photos_remove on storage.objects;
create policy trial_photos_remove on storage.objects for delete to authenticated using (
  bucket_id='trial-photos' and public.can_edit_farmer((storage.foldername(name))[1]::uuid,'trials')
);
