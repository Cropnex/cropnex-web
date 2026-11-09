-- CropNex v6.45.0: season first, then create farm + field from a drawn boundary.
begin;
create or replace function public.can_manage_mapped_fields(p_owner uuid,p_module text) returns boolean language sql stable security definer set search_path=public,auth as $$
 select auth.uid() is not null and public.can_edit_farmer(p_owner,p_module) and (
  public.is_agcore_admin() or (
   exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
   and not exists(select 1 from public.role_applications where user_id=auth.uid() and status in ('Rejected','Suspended'))
   and not exists(select 1 from public.organization_members where user_id=auth.uid() and active and role='Employee')
   and ((p_owner=auth.uid() and exists(select 1 from public.user_roles where user_id=auth.uid() and active and role='Farmer'))
    or (p_owner<>auth.uid() and exists(select 1 from public.organization_members where user_id=auth.uid() and active)))
  )
 )
$$;
revoke all on function public.can_manage_mapped_fields(uuid,text) from public,anon,authenticated;

create or replace function public.ensure_farming_operation(p_owner uuid) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid;v_name text;
begin
 if not public.can_manage_mapped_fields(p_owner,'farm-map') then raise exception 'Farm Map editing access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('operation:'||p_owner::text,0));
 select id into v_id from public.farmers where user_id=p_owner and active order by created_at,id limit 1;
 if v_id is not null then return v_id;end if;
 select coalesce(nullif(trim(p.business_name),''),nullif(trim(p.farm_name),''),nullif(trim(u.raw_user_meta_data->>'business_name'),''),nullif(trim(u.raw_user_meta_data->>'farm_name'),'')) into v_name from auth.users u left join public.profiles p on p.id=u.id where u.id=p_owner;
 if v_name is null then raise exception 'Add your company or farming-operation name in Settings first';end if;
 if exists(select 1 from public.farmers where user_id=p_owner and name=v_name and not active) then raise exception 'Your farming operation is inactive; contact your administrator';end if;
 insert into public.farmers(user_id,name) values(p_owner,v_name) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.ensure_farming_operation(uuid) from public,anon,authenticated;

create or replace function public.get_farmer_start() returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_name text;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select coalesce(nullif(trim(p.business_name),''),nullif(trim(p.farm_name),''),nullif(trim(u.raw_user_meta_data->>'business_name'),''),nullif(trim(u.raw_user_meta_data->>'farm_name'),''),'Your farming operation') into v_name from auth.users u left join public.profiles p on p.id=u.id where u.id=auth.uid();
 return jsonb_build_object('operation_name',v_name,'has_season',exists(select 1 from public.farm_seasons where user_id=auth.uid()) or exists(select 1 from public.fields where user_id=auth.uid() and nullif(trim(season),'') is not null),'has_boundary',exists(select 1 from public.fields where user_id=auth.uid() and public.advisory_request_boundary_valid(boundary)));
end $$;
revoke all on function public.get_farmer_start() from public,anon;
grant execute on function public.get_farmer_start() to authenticated;

create or replace function public.start_farmer_season(p_name text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_farmer uuid;v_name text:=trim(p_name);
begin
 if not public.can_manage_mapped_fields(auth.uid(),'farm-map') then raise exception 'Farmer editing access required';end if;
 if v_name is null or v_name !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Enter a season like 2026/2027';end if;
 if right(v_name,4)::integer<>left(v_name,4)::integer+1 then raise exception 'The season must use consecutive years, for example 2026/2027';end if;
 v_farmer:=public.ensure_farming_operation(auth.uid());
 insert into public.farm_seasons(user_id,name) values(auth.uid(),v_name) on conflict(user_id,name) do nothing;
 insert into public.user_season_preferences(user_id,current_season) values(auth.uid(),v_name) on conflict(user_id) do update set current_season=excluded.current_season,updated_at=now();
 return jsonb_build_object('season',v_name,'farmer_id',v_farmer);
end $$;
revoke all on function public.start_farmer_season(text) from public,anon;
grant execute on function public.start_farmer_season(text) to authenticated;

create table if not exists public.field_boundary_requests(
 actor_id uuid not null references auth.users(id) on delete cascade,request_key uuid not null,payload jsonb not null,
 field_id uuid not null references public.fields(id) on delete cascade,created_at timestamptz not null default now(),primary key(actor_id,request_key)
);
alter table public.field_boundary_requests enable row level security;
revoke all on public.field_boundary_requests from anon,authenticated;
grant select on public.field_boundary_requests to authenticated;
drop policy if exists boundary_requests_own on public.field_boundary_requests;
create policy boundary_requests_own on public.field_boundary_requests for select to authenticated using(actor_id=auth.uid());

create or replace function public.save_mapped_field(p_farmer uuid,p_farm uuid,p_new_farm text,p_field_name text,p_season text,p_area numeric,p_boundary jsonb,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_farmer public.farmers%rowtype;v_farm public.farms%rowtype;v_field public.fields%rowtype;v_previous public.field_boundary_requests%rowtype;v_payload jsonb;v_name text:=regexp_replace(trim(p_new_farm),'\s+',' ','g');v_field_name text:=regexp_replace(trim(p_field_name),'\s+',' ','g');v_farmer_id uuid;
begin
 if auth.uid() is null or p_request_key is null then raise exception 'Sign in and use a valid save request';end if;
 v_payload:=jsonb_build_object('farmer',p_farmer,'farm',p_farm,'new_farm',v_name,'name',v_field_name,'season',p_season,'area',p_area,'boundary',p_boundary);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_key::text,0));
 select * into v_previous from public.field_boundary_requests where actor_id=auth.uid() and request_key=p_request_key;
 if found then
  if v_previous.payload is distinct from v_payload then raise exception 'This save request belongs to different field details';end if;
  select * into v_field from public.fields where id=v_previous.field_id;
  if not public.can_manage_mapped_fields(v_field.user_id,'farm-map') then raise exception 'Farm Map editing access required';end if;
  return to_jsonb(v_field);
 end if;
 if not public.advisory_request_boundary_valid(p_boundary) or p_area is null or round(p_area,2)<=0 or p_area::text in ('NaN','Infinity','-Infinity') then raise exception 'Draw a valid boundary and enter positive hectares';end if;
 if coalesce(length(v_field_name),0)=0 or length(v_field_name)>150 then raise exception 'Enter a field name of up to 150 characters';end if;
 if p_farm is null and (coalesce(length(v_name),0)=0 or length(v_name)>200) then raise exception 'Enter the farm name';end if;
 if p_farm is not null and nullif(v_name,'') is not null then raise exception 'Choose an existing farm or enter a new farm, not both';end if;
 v_farmer_id:=coalesce(p_farmer,public.ensure_farming_operation(auth.uid()));
 select * into v_farmer from public.farmers where id=v_farmer_id and active;
 if not found or not public.can_manage_mapped_fields(v_farmer.user_id,'farm-map') then raise exception 'Choose a permitted farming operation';end if;
 if nullif(trim(p_season),'') is null or not (exists(select 1 from public.farm_seasons where user_id=v_farmer.user_id and name=p_season) or exists(select 1 from public.fields where user_id=v_farmer.user_id and season=p_season)) then raise exception 'Create a season for this farming operation first';end if;
 if p_farm is not null then
  select * into v_farm from public.farms where id=p_farm and farmer_id=v_farmer.id and user_id=v_farmer.user_id and active for share;
  if not found then raise exception 'Choose a saved farm belonging to this operation';end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('farm:'||v_farmer.id::text||lower(v_name),0));
  select * into v_farm from public.farms where farmer_id=v_farmer.id and user_id=v_farmer.user_id and lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(v_name) order by created_at,id limit 1;
  if found and not v_farm.active then raise exception 'This farm is inactive; choose an active farm';end if;
  if v_farm.id is null then insert into public.farms(user_id,farmer_id,name) values(v_farmer.user_id,v_farmer.id,v_name) returning * into v_farm;end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('field:'||v_farm.id::text||p_season||lower(v_field_name),0));
 if exists(select 1 from public.fields where farm_id=v_farm.id and season=p_season and lower(trim(field_name))=lower(v_field_name)) then raise exception 'This field name already exists on this farm in the selected season';end if;
 insert into public.fields(user_id,farmer_id,farm_id,farm_name,field_name,season,area_ha,boundary,status)
 values(v_farmer.user_id,v_farmer.id,v_farm.id,v_farm.name,v_field_name,p_season,round(p_area,2),p_boundary,'Unplanned') returning * into v_field;
 insert into public.field_boundary_requests(actor_id,request_key,payload,field_id) values(auth.uid(),p_request_key,v_payload,v_field.id);
 return to_jsonb(v_field);
end $$;
revoke all on function public.save_mapped_field(uuid,uuid,text,text,text,numeric,jsonb,uuid) from public,anon;
grant execute on function public.save_mapped_field(uuid,uuid,text,text,text,numeric,jsonb,uuid) to authenticated;

create or replace function public.edit_mapped_field(p_field uuid,p_farm uuid,p_name text,p_area numeric) returns jsonb language plpgsql security definer set search_path=public as $$
declare f public.fields%rowtype;farm public.farms%rowtype;v_name text:=regexp_replace(trim(p_name),'\s+',' ','g');v_old_name text;v_old_season text;v_unique_name boolean;
begin
 select * into f from public.fields where id=p_field for update;
 if not found or not public.can_manage_mapped_fields(f.user_id,'fields') then raise exception 'Fields editing access required';end if;
 if coalesce(length(v_name),0)=0 or length(v_name)>150 or p_area is null or round(p_area,2)<=0 or p_area::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a field name and positive hectares';end if;
 select * into farm from public.farms where id=p_farm and active and user_id=f.user_id and (f.farmer_id is null or farmer_id=f.farmer_id) for share;
 if not found then raise exception 'Choose a saved farm from this farming operation';end if;
 perform pg_advisory_xact_lock(hashtextextended('field:'||farm.id::text||coalesce(f.season,'')||lower(v_name),0));
 if exists(select 1 from public.fields where farm_id=farm.id and season is not distinct from f.season and id<>f.id and lower(trim(field_name))=lower(v_name)) then raise exception 'This field name already exists on this farm in this season';end if;
 v_old_name:=f.field_name;v_old_season:=f.season;
 v_unique_name:=not exists(select 1 from public.fields where user_id=f.user_id and season is not distinct from f.season and field_name=f.field_name and id<>f.id);
 update public.fields set field_name=v_name,farm_id=farm.id,farm_name=farm.name,farmer_id=farm.farmer_id,area_ha=round(p_area,2) where id=f.id returning * into f;
 update public.activity_plans set field_name=f.field_name,farm_name=farm.name,farm_id=farm.id,farmer_id=farm.farmer_id where field_id=f.id;
 update public.activities set field_name=f.field_name where field_id=f.id;
 if v_unique_name then update public.activities set field_id=f.id,field_name=f.field_name where field_id is null and user_id=f.user_id and field_name=v_old_name and season is not distinct from v_old_season;end if;
 return to_jsonb(f);
end $$;
revoke all on function public.edit_mapped_field(uuid,uuid,text,numeric) from public,anon;
grant execute on function public.edit_mapped_field(uuid,uuid,text,numeric) to authenticated;

create or replace function public.rename_field_farm(p_farm uuid,p_name text) returns void language plpgsql security definer set search_path=public as $$
declare f public.farms%rowtype;v_name text:=regexp_replace(trim(p_name),'\s+',' ','g');
begin
 select * into f from public.farms where id=p_farm for update;
 if not found or not public.can_manage_mapped_fields(f.user_id,'fields') then raise exception 'Fields editing access required';end if;
 if coalesce(length(v_name),0)=0 or length(v_name)>200 then raise exception 'Enter a farm name of up to 200 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('farm:'||f.farmer_id::text||lower(v_name),0));
 if exists(select 1 from public.farms where farmer_id=f.farmer_id and id<>f.id and lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(v_name)) then raise exception 'This farm name already exists; use a different name';end if;
 update public.farms set name=v_name where id=f.id;
 update public.fields set farm_name=v_name where farm_id=f.id;
 update public.activity_plans set farm_name=v_name where field_id in(select id from public.fields where farm_id=f.id);
end $$;
revoke all on function public.rename_field_farm(uuid,text) from public,anon;
grant execute on function public.rename_field_farm(uuid,text) to authenticated;
commit;
