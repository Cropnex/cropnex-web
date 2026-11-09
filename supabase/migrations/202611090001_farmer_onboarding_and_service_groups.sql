-- CropNex v6.44.0: verified farmer entry and multi-field advisory jobs.
begin;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists business_name text;
alter table public.profiles add column if not exists vat_number text;

create table if not exists public.self_service_farmer_accounts(
 user_id uuid primary key references auth.users(id) on delete cascade,activated_at timestamptz not null default now()
);
alter table public.self_service_farmer_accounts enable row level security;
revoke all on public.self_service_farmer_accounts from anon,authenticated;
grant select on public.self_service_farmer_accounts to authenticated;
drop policy if exists self_service_farmer_read on public.self_service_farmer_accounts;
create policy self_service_farmer_read on public.self_service_farmer_accounts for select to authenticated using(user_id=auth.uid() or public.is_agcore_admin());

-- Only the Farmer role may use automatic verification; other roles remain moderated.
create or replace function public.protect_marketplace_verification() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if public.is_agcore_admin(auth.uid()) then return new;end if;
 if new.roles=array['Farmer']::text[] and new.verification_status='Verified'
 and exists(select 1 from public.self_service_farmer_accounts a join public.user_roles r on r.user_id=a.user_id and r.role='Farmer' and r.active join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null where a.user_id=new.user_id) then return new;end if;
 if tg_op='INSERT' then new.verification_status:='Pending';new.roles:=array[]::text[];
 elsif new.verification_status is distinct from old.verification_status or new.roles is distinct from old.roles then raise exception 'Only CropNex administration can approve these account roles';end if;
 return new;
end $$;

create or replace function public.activate_verified_farmer(p_user uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare u auth.users%rowtype;a public.role_applications%rowtype;v_role text;v_name text;v_company text;v_phone text;v_vat text;v_details jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('registration:'||p_user::text,0));
 select * into u from auth.users where id=p_user;
 if not found then raise exception 'Sign in first';end if;
 if u.email_confirmed_at is null then return jsonb_build_object('state','verify_email');end if;
 select * into a from public.role_applications where user_id=p_user;
 if a.status in ('Rejected','Suspended') then return jsonb_build_object('state','blocked');end if;
 if exists(select 1 from public.user_roles where user_id=p_user and active) or exists(select 1 from public.admin_users where user_id=p_user and active) or exists(select 1 from public.organization_members where user_id=p_user and active) then return jsonb_build_object('state','active');end if;
 if exists(select 1 from public.user_roles where user_id=p_user and role='Farmer' and not active) then return jsonb_build_object('state','blocked');end if;
 v_role:=coalesce(nullif(u.raw_user_meta_data->>'account_type',''),case when a.user_id is not null and cardinality(a.requested_roles)=1 then a.requested_roles[1] when a.user_id is null then 'Farmer' else 'Moderated' end);
 if a.user_id is not null and a.requested_roles is distinct from array['Farmer']::text[] then v_role:='Moderated';end if;
 v_name:=trim(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),a.contact_name,''));
 v_company:=trim(coalesce(nullif(u.raw_user_meta_data->>'business_name',''),nullif(u.raw_user_meta_data->>'farm_name',''),a.business_name,''));
 v_phone:=trim(coalesce(nullif(u.raw_user_meta_data->>'phone',''),a.phone,''));v_vat:=nullif(trim(coalesce(u.raw_user_meta_data->>'vat_number',a.vat_number,'')),'');
 v_details:=jsonb_build_object('full_name',v_name,'business_name',v_company,'phone',v_phone,'vat_number',v_vat);
 if v_role<>'Farmer' then
  if a.user_id is null and v_role in ('Buyer','Transporter','Agronomist','Chemical Representative') then
   insert into public.role_applications(user_id,requested_roles,contact_name,business_name,phone,vat_number,status,submitted_at)
   values(p_user,array[v_role],v_name,v_company,nullif(v_phone,''),v_vat,'Pending',now());
  end if;
  return v_details||jsonb_build_object('state','approval');
 end if;
 if length(v_name)<2 or length(v_company)<2 or length(regexp_replace(v_phone,'[^0-9]','','g')) not between 7 and 15 then return v_details||jsonb_build_object('state','farmer_details');end if;
 insert into public.profiles(id,full_name,farm_name,business_name,phone,vat_number,updated_at)
 values(p_user,v_name,v_company,v_company,v_phone,v_vat,now()) on conflict(id) do update set full_name=excluded.full_name,business_name=excluded.business_name,phone=excluded.phone,vat_number=excluded.vat_number,updated_at=now();
 insert into public.self_service_farmer_accounts(user_id) values(p_user) on conflict do nothing;
 insert into public.user_roles(user_id,role,granted_by) values(p_user,'Farmer',p_user) on conflict(user_id,role) do nothing;
 insert into public.role_applications(user_id,requested_roles,contact_name,business_name,phone,vat_number,status,submitted_at,reviewed_at)
 values(p_user,array['Farmer'],v_name,v_company,v_phone,v_vat,'Approved',now(),now())
 on conflict(user_id) do update set status='Approved',contact_name=excluded.contact_name,business_name=excluded.business_name,phone=excluded.phone,vat_number=excluded.vat_number,reviewed_at=now(),updated_at=now();
 insert into public.marketplace_profiles(user_id,business_name,phone,vat_number,roles,verification_status)
 values(p_user,v_company,v_phone,v_vat,array['Farmer'],'Verified')
 on conflict(user_id) do update set business_name=excluded.business_name,phone=excluded.phone,vat_number=excluded.vat_number,roles=array['Farmer'],verification_status='Verified',updated_at=now();
 return v_details||jsonb_build_object('state','active');
end $$;
revoke all on function public.activate_verified_farmer(uuid) from public,anon,authenticated;

create or replace function public.ensure_cropnex_registration() returns jsonb language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'Sign in first';end if;return public.activate_verified_farmer(auth.uid());end $$;
revoke all on function public.ensure_cropnex_registration() from public,anon;
grant execute on function public.ensure_cropnex_registration() to authenticated;

create or replace function public.complete_farmer_registration(p_name text,p_phone text,p_company text,p_vat text default null) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare u auth.users%rowtype;
begin
 select * into u from auth.users where id=auth.uid() for update;
 if not found or u.email_confirmed_at is null then raise exception 'Confirm your email before completing your farmer profile';end if;
 if exists(select 1 from public.role_applications where user_id=u.id and (status in ('Rejected','Suspended') or requested_roles is distinct from array['Farmer']::text[])) or coalesce(u.raw_user_meta_data->>'account_type','Farmer')<>'Farmer' then raise exception 'This account requires administrator review';end if;
 if length(trim(coalesce(p_name,'')))<2 or length(trim(coalesce(p_company,'')))<2 or length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) not between 7 and 15 then raise exception 'Enter your name, phone number and company or farm business name';end if;
 update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}')||jsonb_build_object('account_type','Farmer','full_name',left(trim(p_name),150),'business_name',left(trim(p_company),200),'phone',left(trim(p_phone),40),'vat_number',nullif(left(trim(p_vat),40),'')) where id=u.id;
 return public.activate_verified_farmer(u.id);
end $$;
revoke all on function public.complete_farmer_registration(text,text,text,text) from public,anon;
grant execute on function public.complete_farmer_registration(text,text,text,text) to authenticated;

create or replace function public.on_verified_cropnex_registration() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.email_confirmed_at is not null then perform public.activate_verified_farmer(new.id);end if;return new;end $$;
revoke all on function public.on_verified_cropnex_registration() from public,anon,authenticated;
drop trigger if exists cropnex_verified_registration on auth.users;
create trigger cropnex_verified_registration after insert or update of email_confirmed_at,raw_user_meta_data on auth.users for each row execute function public.on_verified_cropnex_registration();

create table if not exists public.advisory_request_groups(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),created_by uuid not null references auth.users(id),
 client_request_id uuid not null,service_type text not null,requested_date date,notes text,created_at timestamptz not null default now(),
 unique(created_by,client_request_id)
);
alter table public.advisory_request_groups enable row level security;
alter table public.advisory_requests add column if not exists group_id uuid references public.advisory_request_groups(id);
create unique index if not exists advisory_group_field_unique on public.advisory_requests(group_id,field_id) where group_id is not null;
revoke all on public.advisory_request_groups from anon,authenticated;
grant select on public.advisory_request_groups to authenticated;
drop policy if exists advisory_request_groups_read on public.advisory_request_groups;
create policy advisory_request_groups_read on public.advisory_request_groups for select to authenticated using(exists(select 1 from public.advisory_requests r where r.group_id=advisory_request_groups.id and public.advisory_read_field(r.field_id)));

-- Accept stored point arrays and GeoJSON, but reject empty/malformed geometry.
create or replace function public.advisory_request_boundary_valid(p_boundary jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare ring jsonb;point jsonb;lat numeric;lng numeric;points text[]:=array[]::text[];
begin
 if jsonb_typeof(p_boundary)='array' then ring:=p_boundary;
 elsif p_boundary->>'type'='Polygon' then ring:=p_boundary->'coordinates'->0;
 elsif p_boundary->>'type'='MultiPolygon' then ring:=p_boundary->'coordinates'->0->0;
 else return false;end if;
 if jsonb_typeof(ring) is distinct from 'array' then return false;end if;
 for point in select * from jsonb_array_elements(ring) loop
  if jsonb_typeof(point)='object' then lat:=(point->>'lat')::numeric;lng:=(point->>'lng')::numeric;
  elsif jsonb_typeof(point)='array' then lng:=(point->>0)::numeric;lat:=(point->>1)::numeric;
  else return false;end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then return false;end if;
  if not (lat::text||','||lng::text)=any(points) then points:=array_append(points,lat::text||','||lng::text);end if;
 end loop;
 return cardinality(points)>=3;
exception when others then return false;
end $$;
revoke all on function public.advisory_request_boundary_valid(jsonb) from public,anon,authenticated;

create or replace function public.advisory_create_request_group(p_fields uuid[],p_service text,p_advisor uuid,p_date date,p_notes text,p_request_key uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_fields uuid[];v_field uuid;v_owner uuid;v_season text;v_group uuid;v_existing public.advisory_request_groups%rowtype;v_child uuid;
begin
 if auth.uid() is null or p_request_key is null then raise exception 'Sign in and use a valid request key';end if;
 select array_agg(distinct id order by id) into v_fields from unnest(p_fields) chosen(id);
 if coalesce(cardinality(v_fields),0)=0 then raise exception 'Select at least one field';end if;
 if cardinality(v_fields)>250 then raise exception 'Choose up to 250 fields per service request';end if;
 if p_service not in ('Chemical soil grids','Soil classification','Leaf analysis','Soil sampling','Field inspection','Crop scouting','Other') then raise exception 'Choose a valid service';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_key::text,0));
 select * into v_existing from public.advisory_request_groups where created_by=auth.uid() and client_request_id=p_request_key;
 if found then
  if v_existing.service_type is distinct from p_service or v_existing.requested_date is distinct from p_date or v_existing.notes is distinct from p_notes
   or (select array_agg(field_id order by field_id) from public.advisory_requests where group_id=v_existing.id) is distinct from v_fields
   or exists(select 1 from public.advisory_requests where group_id=v_existing.id and advisor_id is distinct from p_advisor) then raise exception 'This request key belongs to different service details';end if;
  if exists(select 1 from public.advisory_requests where group_id=v_existing.id and not public.advisory_manage_field(field_id)) then raise exception 'Farmer editing access required';end if;
  return v_existing.id;
 end if;
 perform id from public.fields where id=any(v_fields) order by id for share;
 select user_id,season into v_owner,v_season from public.fields where id=v_fields[1];
 if v_owner is null or exists(select 1 from unnest(v_fields) chosen(id) left join public.fields f on f.id=chosen.id where f.id is null or f.user_id<>v_owner or f.season is distinct from v_season or not public.advisory_manage_field(f.id)) then raise exception 'Select permitted fields from one farming account and season';end if;
 if exists(select 1 from public.fields where id=any(v_fields) and (not public.advisory_request_boundary_valid(boundary) or area_ha is null or area_ha<=0)) then raise exception 'Save a boundary and positive hectares for every selected field';end if;
 if p_advisor is not null and exists(select 1 from unnest(v_fields) chosen(id) where not exists(select 1 from public.advisory_links l where l.field_id=chosen.id and l.advisor_id=p_advisor and l.status='Active' and public.advisory_is_advisor(l.advisor_id))) then raise exception 'The selected adviser needs an active connection to every selected field';end if;
 insert into public.advisory_request_groups(owner_id,created_by,client_request_id,service_type,requested_date,notes) values(v_owner,auth.uid(),p_request_key,p_service,p_date,p_notes) returning id into v_group;
 foreach v_field in array v_fields loop
  v_child:=public.advisory_save_request(v_field,p_service,p_advisor,p_date,p_notes);
  update public.advisory_requests set group_id=v_group where id=v_child;
 end loop;
 return v_group;
end $$;
revoke all on function public.advisory_create_request_group(uuid[],text,uuid,date,text,uuid) from public,anon;
grant execute on function public.advisory_create_request_group(uuid[],text,uuid,date,text,uuid) to authenticated;

create or replace function public.get_advisory_client_requests(p_owner uuid,p_season text default null) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') from public.advisory_requests r
 where r.owner_id=p_owner and public.advisory_read_field(r.field_id) and (p_season is null or coalesce(r.field_snapshot->>'season','')=p_season)
$$;
revoke all on function public.get_advisory_client_requests(uuid,text) from public,anon;
grant execute on function public.get_advisory_client_requests(uuid,text) to authenticated;

create or replace function public.get_advisory_clients() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.client_name),'[]') from (
  select f.user_id owner_id,coalesce(max(a.business_name),max(p.business_name),max(p.farm_name),'Farm client') client_name,count(*) field_count,sum(f.area_ha) shared_ha
  from public.fields f left join public.role_applications a on a.user_id=f.user_id left join public.profiles p on p.id=f.user_id
  where public.advisory_read_field(f.id) group by f.user_id
 ) c
$$;
revoke all on function public.get_advisory_clients() from public,anon;
grant execute on function public.get_advisory_clients() to authenticated;
commit;
