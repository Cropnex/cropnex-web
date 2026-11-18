-- Enforce farm isolation at the database boundary, including on existing projects.
begin;

create or replace function public.is_private_farmer()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and active and role='Farmer')
    or exists(select 1 from public.organization_members where user_id=auth.uid() and active and role='Farmer')
    or exists(select 1 from public.role_applications where user_id=auth.uid() and 'Farmer'=any(requested_roles))
$$;
revoke all on function public.is_private_farmer() from public,anon;
grant execute on function public.is_private_farmer() to authenticated;

create or replace function public.can_access_farmer(p_farmer_user_id uuid,p_capability text default 'view',p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select p_user_id=auth.uid() and (p_user_id=p_farmer_user_id or public.is_agcore_admin(p_user_id) or (not public.is_private_farmer() and (exists (
    select 1 from public.organization_farmers f join public.organization_members m on m.organization_id=f.organization_id and m.user_id=p_user_id and m.active
    where f.farmer_user_id=p_farmer_user_id and f.access_status='Active'
      and m.role in ('Organisation Owner','Organisation Administrator','Director','Accountant','Analyst','Read Only Analyst','Office Manager','Warehouse Manager','Employee')
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
  ))))
$$;
grant execute on function public.can_access_farmer(uuid,text,uuid) to authenticated;

-- Keep the established edit checks, but allow the new Farmer role to use explicit edit grants.
create or replace function public.can_edit_farmer(p_farmer_user_id uuid,p_module_key text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select p_user_id=auth.uid() and (p_user_id=p_farmer_user_id or public.is_agcore_admin(p_user_id) or (not public.is_private_farmer() and (exists (
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
  ))))
$$;
grant execute on function public.can_edit_farmer(uuid,text,uuid) to authenticated;


-- A restrictive policy caps access even if a production database has an older
-- permissive policy. Existing module and owner policies still grant access.
do $$
declare
  entry record;
  read_rule text;
  write_rule text;
begin
  for entry in select * from (values
    ('profiles','id',null), ('user_roles','user_id',null),
    ('role_applications','user_id',null), ('verification_documents','user_id',null), ('farm_settings','user_id',null),
    ('fields','user_id','fields'), ('farmers','user_id','farm-map'), ('farms','user_id','farm-map'),
    ('map_layers','user_id','farm-map'), ('farm_crop_colours','user_id','farm-map'),
    ('farm_seasons','user_id','planning'), ('user_season_preferences','user_id',null),
    ('inventory_locations','user_id','inventory'), ('inventory_items','user_id','inventory'),
    ('inventory_transactions','user_id','inventory'), ('inventory_transfers','user_id','inventory'),
    ('inventory_transfer_lines','user_id','inventory'), ('inventory_stocktakes','user_id','inventory'),
    ('inventory_stocktake_counts','user_id','inventory'), ('activity_plans','user_id','planning'),
    ('activity_plan_products','user_id','activities'), ('activity_plan_operations','user_id','activities'),
    ('activities','user_id','activities'), ('crop_plans','user_id','planning'),
    ('cultivars','user_id','fields'), ('standard_operations','user_id','planning'),
    ('activity_templates','user_id','planning'), ('activity_template_products','user_id','planning'),
    ('crop_templates','user_id','planning'), ('crop_template_activities','user_id','planning'),
    ('crop_template_lines','user_id','planning'), ('harvest_records','user_id','harvest'),
    ('financial_transactions','user_id','financials'), ('field_budgets','user_id','financials'),
    ('business_commitments','user_id','financials'), ('crop_yield_expectations','user_id','financials'),
    ('crop_price_scenarios','user_id','financials'), ('grain_positions','user_id',null),
    ('production_forecasts','user_id',null), ('transport_loads','user_id','transport'),
    ('transport_load_allocations','user_id','transport'), ('transport_destinations','user_id','harvest'),
    ('transport_vehicles','user_id','harvest'), ('transport_pricing_allocations','user_id','harvest'),
    ('equipment','user_id','equipment'), ('equipment_service_profiles','user_id','equipment'),
    ('equipment_services','user_id','equipment'), ('equipment_service_items','user_id','equipment'),
    ('fuel_logs','user_id','fuel'), ('fuel_records','user_id','fuel'),
    ('work_orders','user_id','jobs'), ('work_order_products','user_id','jobs'),
    ('employees','user_id','labour'), ('labour_entries','user_id','labour'),
    ('scouting_records','user_id','scouting'), ('scouting_observations','user_id','scouting'),
    ('rain_gauges','user_id','rainfall'), ('rainfall_readings','user_id','rainfall'),
    ('trials','user_id','trials'), ('trial_treatments','user_id','trials'), ('trial_inputs','user_id','trials'),
    ('trial_strips','user_id','trials'), ('trial_photos','user_id','trials'), ('trial_visits','user_id','trials'),
    ('document_scans','user_id',null), ('alert_preferences','user_id',null),
    ('whatsapp_senders','user_id',null), ('whatsapp_inbox','user_id',null),
    ('marketplace_profiles','user_id',null), ('marketplace_notifications','user_id',null),
    ('marketplace_documents','owner_id',null), ('product_requests','user_id',null)
  ) as scoped(table_name,owner_column,module_key)
  where exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relname=scoped.table_name and c.relkind in ('r','p')
      and a.attname=scoped.owner_column and a.attnum>0 and not a.attisdropped
  )
  loop
    if entry.module_key is null then
      read_rule := format('(%I = auth.uid() or public.is_agcore_admin())', entry.owner_column);
      write_rule := read_rule;
    else
      read_rule := format('public.can_access_farmer(%I, %L)', entry.owner_column, entry.module_key);
      write_rule := format('public.can_edit_farmer(%I, %L)', entry.owner_column, entry.module_key);
    end if;
    execute format('alter table public.%I enable row level security', entry.table_name);
    execute format('drop policy if exists cropnex_private_read on public.%I', entry.table_name);
    execute format('drop policy if exists cropnex_private_insert on public.%I', entry.table_name);
    execute format('drop policy if exists cropnex_private_update on public.%I', entry.table_name);
    execute format('drop policy if exists cropnex_private_delete on public.%I', entry.table_name);
    execute format('create policy cropnex_private_read on public.%I as restrictive for select to public using (%s)', entry.table_name, read_rule);
    execute format('create policy cropnex_private_insert on public.%I as restrictive for insert to public with check (%s)', entry.table_name, write_rule);
    execute format('create policy cropnex_private_update on public.%I as restrictive for update to public using (%s) with check (%s)', entry.table_name, write_rule, write_rule);
    execute format('create policy cropnex_private_delete on public.%I as restrictive for delete to public using (%s)', entry.table_name, write_rule);
  end loop;
end $$;


-- Role assignments go through the existing administrator-only functions.
alter table public.admin_users enable row level security;
revoke insert, update, delete, truncate on public.admin_users, public.user_roles from public, anon, authenticated;
drop policy if exists cropnex_admin_only on public.admin_users;
create policy cropnex_admin_only on public.admin_users as restrictive
  for select to public using (public.is_agcore_admin());

-- Prevent an owned stock record from referring to another account's shed.
-- NOT VALID leaves existing records intact while enforcing all new references.
create unique index if not exists inventory_locations_id_owner
  on public.inventory_locations(id, user_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.inventory_items'::regclass and conname='inventory_item_shed_owner_fk') then
    alter table public.inventory_items add constraint inventory_item_shed_owner_fk
      foreign key (location_id, user_id) references public.inventory_locations(id, user_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.inventory_transfers'::regclass and conname='inventory_transfer_source_owner_fk') then
    alter table public.inventory_transfers add constraint inventory_transfer_source_owner_fk
      foreign key (from_location_id, user_id) references public.inventory_locations(id, user_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.inventory_transfers'::regclass and conname='inventory_transfer_destination_owner_fk') then
    alter table public.inventory_transfers add constraint inventory_transfer_destination_owner_fk
      foreign key (to_location_id, user_id) references public.inventory_locations(id, user_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.inventory_stocktakes'::regclass and conname='inventory_stocktake_shed_owner_fk') then
    alter table public.inventory_stocktakes add constraint inventory_stocktake_shed_owner_fk
      foreign key (location_id, user_id) references public.inventory_locations(id, user_id) not valid;
  end if;
end $$;

update storage.buckets set public=false
where id in ('cropnex-layers','agcore-layers','scouting-photos','trial-photos','advisory-files',
             'marketplace-documents','verification-documents','product-request-labels')
  and public;

-- Keep deployed report views on the same permission boundary as base tables.
do $$
declare report record;
begin
  for report in select viewname from pg_views where schemaname='public' and viewname in (
    'inventory_location_summary','activity_plan_report','transport_field_yield_summary',
    'field_grain_value_summary','field_harvest_live_summary','field_performance_report',
    'diesel_consumption_summary','rainfall_season_summary','crop_revenue_forecast','business_commitment_summary'
  ) loop
    execute format('alter view public.%I set (security_invoker=true)',report.viewname);
  end loop;
end $$;

-- Public signup must never confer the global administrator role.
create or replace function public.admin_bootstrap_available()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(
    select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null
      and raw_app_meta_data->>'cropnex_bootstrap_admin'='true'
  ) and not exists(select 1 from public.admin_users)
$$;

create or replace function public.claim_first_super_admin() returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not public.admin_bootstrap_available() then raise exception 'Administrator setup requires a pre-authorized account'; end if;
  perform pg_advisory_xact_lock(6142026);
  if exists(select 1 from public.admin_users) then raise exception 'The first administrator has already been established'; end if;
  insert into public.admin_users(user_id,admin_level,appointed_by) values(auth.uid(),'Super Admin',auth.uid());
  insert into public.user_roles(user_id,role,granted_by) values(auth.uid(),'Farmer',auth.uid()) on conflict(user_id,role) do update set active=true,granted_by=excluded.granted_by,granted_at=now();
  insert into public.role_applications(user_id,requested_roles,contact_name,business_name,status,submitted_at,reviewed_at,reviewed_by)
  values(auth.uid(),array['Farmer'],coalesce((select raw_user_meta_data->>'full_name' from auth.users where id=auth.uid()),'CropNex Administrator'),coalesce((select raw_user_meta_data->>'business_name' from auth.users where id=auth.uid()),'CropNex'),'Approved',now(),now(),auth.uid())
  on conflict(user_id) do update set status='Approved',reviewed_at=now(),reviewed_by=auth.uid();
  insert into public.marketplace_profiles(user_id,business_name,roles,verification_status)
  values(auth.uid(),'CropNex',array['Farmer'],'Verified') on conflict(user_id) do update set roles=array['Farmer'],verification_status='Verified',updated_at=now();
  return true;
end $$;
grant execute on function public.claim_first_super_admin() to authenticated;

commit;


