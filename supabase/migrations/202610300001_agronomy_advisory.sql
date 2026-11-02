-- CropNex v6.38.0. Field-scoped adviser consent, service requests and recommendations.
begin;
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check(role in ('Farmer','Buyer','Transporter','Agronomist','Chemical Representative'));
alter table public.organization_member_dashboard_access drop constraint if exists organization_member_dashboard_access_module_key_check;
alter table public.organization_member_dashboard_access add constraint organization_member_dashboard_access_module_key_check check(module_key in ('dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour','financials','harvest','transport','grain-market','reports','trials','advisory','weather','rainfall','scanner','alerts','assistant','whatsapp-inbox','master-data','offline-sync','settings'));
insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,can_edit,granted_by)
select organization_id,user_id,'advisory',enabled,can_edit,granted_by from public.organization_member_dashboard_access where module_key='fields'
on conflict(organization_id,user_id,module_key) do nothing;

create table if not exists public.advisory_links (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references public.fields(id) on delete cascade,
 owner_id uuid not null references auth.users(id), advisor_id uuid not null references auth.users(id), advisor_email text not null,
 status text not null default 'Pending' check(status in ('Pending','Active','Revoked','Declined')),
 share_plans boolean not null default false, share_scouting boolean not null default false, share_yield boolean not null default false,
 invited_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(field_id,advisor_id), check(owner_id<>advisor_id)
);
create table if not exists public.advisory_requests (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references public.fields(id), owner_id uuid not null references auth.users(id),
 advisor_id uuid references auth.users(id), service_type text not null check(service_type in ('Chemical soil grids','Soil classification','Leaf analysis','Soil sampling','Field inspection','Crop scouting','Other')),
 status text not null default 'Submitted' check(status in ('Submitted','Accepted','Scheduled','Sampling','Results ready','Completed','Cancelled')),
 requested_date date, scheduled_date date, notes text, field_snapshot jsonb not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.advisory_visits (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references public.fields(id), request_id uuid references public.advisory_requests(id),
 author_id uuid not null references auth.users(id), visit_date date not null, title text not null, notes text, created_at timestamptz not null default now()
);
create table if not exists public.advisory_documents (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references public.fields(id), request_id uuid references public.advisory_requests(id),
 author_id uuid not null references auth.users(id), category text not null, file_name text not null, storage_path text not null,
 notes text, sample_date date, depth_cm numeric, grid_points jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.advisory_recommendations (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references public.fields(id), author_id uuid not null references auth.users(id),
 request_id uuid references public.advisory_requests(id), title text not null, activity_type text not null, planned_date date not null,
 instructions text, lines jsonb not null, version integer not null default 1,
 status text not null default 'Draft' check(status in ('Draft','Submitted','Approved','Returned','Declined')),
 plan_id uuid references public.activity_plans(id), reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.advisory_events (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references public.fields(id), actor_id uuid not null references auth.users(id),
 record_id uuid, action text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists advisory_links_advisor on public.advisory_links(advisor_id,status);
create index if not exists advisory_requests_field on public.advisory_requests(field_id,created_at);
create index if not exists advisory_docs_field on public.advisory_documents(field_id,created_at);
alter table public.advisory_links enable row level security;
alter table public.advisory_requests enable row level security;
alter table public.advisory_visits enable row level security;
alter table public.advisory_documents enable row level security;
alter table public.advisory_recommendations enable row level security;
alter table public.advisory_events enable row level security;
grant select on public.advisory_links,public.advisory_requests,public.advisory_visits,public.advisory_documents,public.advisory_recommendations,public.advisory_events to authenticated;
revoke insert,update,delete on public.advisory_links,public.advisory_requests,public.advisory_visits,public.advisory_documents,public.advisory_recommendations,public.advisory_events from authenticated,anon;

create or replace function public.advisory_account_ok() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_agcore_admin(auth.uid()) or exists(select 1 from public.user_roles where user_id=auth.uid() and active) or exists(select 1 from public.organization_members where user_id=auth.uid() and active))
$$;
create or replace function public.advisory_is_advisor(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_roles where user_id=p_user and active and role in ('Agronomist','Chemical Representative'))
$$;
create or replace function public.advisory_manage_field(p_field uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.advisory_account_ok() and exists(select 1 from public.fields f where f.id=p_field and public.can_edit_farmer(f.user_id,'advisory'))
$$;
create or replace function public.advisory_read_field(p_field uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.advisory_account_ok() and (exists(select 1 from public.fields f where f.id=p_field and public.can_access_farmer(f.user_id,'advisory'))
 or (public.advisory_is_advisor() and exists(select 1 from public.advisory_links l where l.field_id=p_field and l.advisor_id=auth.uid() and l.status='Active')))
$$;
create or replace function public.advisory_write_field(p_field uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.advisory_manage_field(p_field) or (public.advisory_account_ok() and public.advisory_is_advisor() and exists(select 1 from public.advisory_links l where l.field_id=p_field and l.advisor_id=auth.uid() and l.status='Active'))
$$;
create or replace function public.advisory_field_snapshot(p_field uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',f.id,'field_name',f.field_name,'farm_name',f.farm_name,'area_ha',f.area_ha,'crop',f.crop,'cultivar',f.cultivar,'season',f.season,'boundary',f.boundary) from public.fields f where f.id=p_field and public.advisory_read_field(f.id)
$$;
drop policy if exists advisory_links_read on public.advisory_links;
create policy advisory_links_read on public.advisory_links for select to authenticated using (public.advisory_manage_field(field_id) or (advisor_id=auth.uid() and public.advisory_is_advisor()));
do $$ declare t text; begin
 foreach t in array array['advisory_requests','advisory_visits','advisory_documents','advisory_recommendations','advisory_events'] loop
 execute format('drop policy if exists advisory_read on public.%I',t);
 execute format('create policy advisory_read on public.%I for select to authenticated using (public.advisory_read_field(field_id))',t);
 end loop;
end $$;

create or replace function public.get_advisory_workspace() returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
begin
 if not public.advisory_account_ok() then raise exception 'Approved CropNex account required'; end if;
 return jsonb_build_object(
 'fields',coalesce((select jsonb_agg(public.advisory_field_snapshot(f.id)||jsonb_build_object('owner_id',f.user_id,'can_manage',public.advisory_manage_field(f.id),'can_write',public.advisory_write_field(f.id),'can_approve',public.can_edit_farmer(f.user_id,'planning') and public.advisory_manage_field(f.id),'client_name',coalesce(a.business_name,'Farm client'))) from public.fields f left join public.role_applications a on a.user_id=f.user_id where public.advisory_read_field(f.id)),'[]'),
 'links',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('advisor_name',coalesce(u.raw_user_meta_data->>'full_name',l.advisor_email),'field_name',f.field_name,'client_name',coalesce(a.business_name,'Farm client'))) from public.advisory_links l join public.fields f on f.id=l.field_id join auth.users u on u.id=l.advisor_id left join public.role_applications a on a.user_id=f.user_id where public.advisory_manage_field(l.field_id) or (l.advisor_id=auth.uid() and public.advisory_is_advisor())),'[]')
 );
end $$;

create or replace function public.advisory_invite(p_field uuid,p_email text,p_plans boolean default false,p_scouting boolean default false,p_yield boolean default false) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid; v_id uuid; v_owner uuid;
begin
 if not public.advisory_manage_field(p_field) then raise exception 'Farmer editing access required for this field'; end if;
 select id into v_user from auth.users where lower(email)=lower(trim(p_email));
 if v_user is null or not public.advisory_is_advisor(v_user) then raise exception 'Use an existing account approved by CropNex as Agronomist or Chemical Representative'; end if;
 if not exists(select 1 from public.fields where id=p_field and boundary is not null and boundary::text not in ('null','[]','{}')) then raise exception 'Save the field boundary before requesting a service'; end if;
 select user_id into v_owner from public.fields where id=p_field;
 if v_user=v_owner then raise exception 'Choose a different adviser account'; end if;
 insert into public.advisory_links(field_id,owner_id,advisor_id,advisor_email,share_plans,share_scouting,share_yield,invited_by)
 values(p_field,v_owner,v_user,lower(trim(p_email)),p_plans,p_scouting,p_yield,auth.uid())
 on conflict(field_id,advisor_id) do update set status=case when advisory_links.status='Active' then 'Active' else 'Pending' end,share_plans=excluded.share_plans,share_scouting=excluded.share_scouting,share_yield=excluded.share_yield,updated_at=now() returning id into v_id;
 insert into public.advisory_events(field_id,actor_id,record_id,action,payload) values(p_field,auth.uid(),v_id,'Field access invited/updated',jsonb_build_object('advisor_id',v_user,'plans',p_plans,'scouting',p_scouting,'yield',p_yield));
 return v_id;
end $$;
create or replace function public.advisory_link_decision(p_link uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
declare l public.advisory_links%rowtype;
begin
 select * into l from public.advisory_links where id=p_link for update; if not found then raise exception 'Connection not found'; end if;
 if p_status='Revoked' then
  if not public.advisory_manage_field(l.field_id) then raise exception 'Farmer editing access required'; end if;
 elsif p_status in ('Active','Declined') then
  if auth.uid()<>l.advisor_id or not public.advisory_is_advisor() or l.status<>'Pending' then raise exception 'Only the invited adviser may respond to a pending invitation'; end if;
 else raise exception 'Invalid decision'; end if;
 update public.advisory_links set status=p_status,updated_at=now() where id=p_link;
 insert into public.advisory_events(field_id,actor_id,record_id,action) values(l.field_id,auth.uid(),p_link,'Field access '||p_status);
end $$;

create or replace function public.advisory_save_request(p_field uuid,p_service text,p_advisor uuid,p_date date,p_notes text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_owner uuid;
begin
 if not public.advisory_manage_field(p_field) then raise exception 'Farmer editing access required'; end if;
 if p_advisor is not null and not exists(select 1 from public.advisory_links where field_id=p_field and advisor_id=p_advisor and status='Active' and public.advisory_is_advisor(advisor_id)) then raise exception 'Choose an active adviser connected to this field'; end if;
 select user_id into v_owner from public.fields where id=p_field;
 insert into public.advisory_requests(field_id,owner_id,advisor_id,service_type,requested_date,notes,field_snapshot,created_by) values(p_field,v_owner,p_advisor,p_service,p_date,p_notes,public.advisory_field_snapshot(p_field),auth.uid()) returning id into v_id;
 insert into public.advisory_events(field_id,actor_id,record_id,action,payload) values(p_field,auth.uid(),v_id,'Service requested',jsonb_build_object('service',p_service,'advisor_id',p_advisor));
 return v_id;
end $$;
create or replace function public.advisory_update_request(p_request uuid,p_status text,p_scheduled date default null,p_advisor uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare r public.advisory_requests%rowtype; v_manager boolean;
begin
 select * into r from public.advisory_requests where id=p_request for update; if not found then raise exception 'Request not found'; end if;
 v_manager:=public.advisory_manage_field(r.field_id);
 if not v_manager and not coalesce(r.advisor_id=auth.uid() and public.advisory_write_field(r.field_id),false) then raise exception 'Only the farmer or assigned adviser may update this request'; end if;
 if r.status in ('Completed','Cancelled') then raise exception 'This request is closed'; end if;
 if p_advisor is not null then
  if not v_manager or not exists(select 1 from public.advisory_links where field_id=r.field_id and advisor_id=p_advisor and status='Active' and public.advisory_is_advisor(advisor_id)) then raise exception 'Only the farmer can assign an active adviser'; end if;
 end if;
 if p_status not in ('Submitted','Accepted','Scheduled','Sampling','Results ready','Completed','Cancelled') then raise exception 'Invalid request status'; end if;
 if p_status='Cancelled' and not v_manager then raise exception 'Only the farmer can cancel a request'; end if;
 if p_status='Scheduled' and p_scheduled is null then raise exception 'Enter the scheduled visit date'; end if;
 update public.advisory_requests set status=p_status,scheduled_date=p_scheduled,advisor_id=coalesce(p_advisor,advisor_id),updated_at=now() where id=p_request;
 insert into public.advisory_events(field_id,actor_id,record_id,action,payload) values(r.field_id,auth.uid(),p_request,'Request status '||p_status,jsonb_build_object('scheduled_date',p_scheduled));
end $$;

create or replace function public.advisory_save_visit(p_field uuid,p_request uuid,p_date date,p_title text,p_notes text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.advisory_write_field(p_field) then raise exception 'Field advisory access required'; end if;
 if p_request is not null and not exists(select 1 from public.advisory_requests where id=p_request and field_id=p_field) then raise exception 'Request does not belong to this field'; end if;
 if nullif(trim(p_title),'') is null or p_date is null then raise exception 'Enter visit date and description'; end if;
 insert into public.advisory_visits(field_id,request_id,author_id,visit_date,title,notes) values(p_field,p_request,auth.uid(),p_date,trim(p_title),p_notes) returning id into v_id;
 insert into public.advisory_events(field_id,actor_id,record_id,action) values(p_field,auth.uid(),v_id,'Visit recorded'); return v_id;
end $$;

create or replace function public.advisory_save_document(p_field uuid,p_request uuid,p_category text,p_name text,p_path text,p_notes text,p_date date,p_depth numeric,p_points jsonb default '[]') returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_point jsonb;
begin
 if not public.advisory_write_field(p_field) then raise exception 'Field advisory access required'; end if;
 if p_request is not null and not exists(select 1 from public.advisory_requests where id=p_request and field_id=p_field) then raise exception 'Request does not belong to this field'; end if;
 if p_name is null or p_name !~* '\.(pdf|csv|png|jpe?g|webp|geojson|json|zip|tiff?)$' then raise exception 'Unsupported attachment format'; end if;
 if split_part(p_path,'/',1)<>p_field::text or split_part(p_path,'/',2)<>auth.uid()::text then raise exception 'Invalid private attachment path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='advisory-files' and name=p_path) then raise exception 'Upload the attachment first'; end if;
 if p_points is null or jsonb_typeof(p_points)<>'array' or jsonb_array_length(p_points)>10000 then raise exception 'Use up to 10000 grid results'; end if;
 if p_depth<0 then raise exception 'Sampling depth cannot be negative'; end if;
 for v_point in select * from jsonb_array_elements(p_points) loop
  if not (v_point ?& array['latitude','longitude','value','sample_id','parameter','unit','depth_cm','sample_date']) or nullif(v_point->>'parameter','') is null or nullif(v_point->>'unit','') is null or nullif(v_point->>'sample_id','') is null or nullif(v_point->>'latitude','') is null or nullif(v_point->>'longitude','') is null or (v_point->>'latitude')::numeric not between -90 and 90 or (v_point->>'longitude')::numeric not between -180 and 180 or nullif(v_point->>'value','') is null or nullif(v_point->>'depth_cm','') is null or nullif(v_point->>'sample_date','') is null or (v_point->>'depth_cm')::numeric<0 or (v_point->>'depth_cm')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Grid results need sample IDs, coordinates, parameters, units, depth, sampling date and values'; end if;
  perform (v_point->>'value')::numeric;
  perform (v_point->>'sample_date')::date;
  if (v_point->>'value')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Use finite grid values'; end if;
 end loop;
 insert into public.advisory_documents(field_id,request_id,author_id,category,file_name,storage_path,notes,sample_date,depth_cm,grid_points) values(p_field,p_request,auth.uid(),p_category,p_name,p_path,p_notes,p_date,p_depth,p_points) returning id into v_id;
 insert into public.advisory_events(field_id,actor_id,record_id,action) values(p_field,auth.uid(),v_id,'Results/attachment uploaded'); return v_id;
end $$;

create or replace function public.advisory_save_recommendation(p_field uuid,p_id uuid,p_request uuid,p_title text,p_activity text,p_date date,p_instructions text,p_lines jsonb,p_submit boolean default false) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.advisory_recommendations%rowtype; v_id uuid; l jsonb;
begin
 if not public.advisory_write_field(p_field) or not public.advisory_is_advisor() then raise exception 'An approved adviser with active access must author recommendations'; end if;
 if nullif(trim(p_title),'') is null or p_date is null or nullif(trim(p_activity),'') is null then raise exception 'Enter a title, activity and proposed date'; end if;
 if p_request is not null and not exists(select 1 from public.advisory_requests where id=p_request and field_id=p_field) then raise exception 'Request does not belong to this field'; end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>100 then raise exception 'Add 1 to 100 input/operation lines'; end if;
 for l in select * from jsonb_array_elements(p_lines) loop
  if (l->>'rate')::numeric::text in ('NaN','Infinity','-Infinity') or (l->>'price')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Use finite rates and prices'; end if;
  if coalesce(l->>'kind','Product') not in ('Product','Seed','Operation') or nullif(trim(l->>'name'),'') is null or nullif(trim(l->>'unit'),'') is null or (l->>'rate') is null or (l->>'price') is null or (l->>'rate')::numeric<0 or (l->>'price')::numeric<0 then raise exception 'Check input names, units, rates and prices'; end if;
 end loop;
 if p_id is not null then
  select * into r from public.advisory_recommendations where id=p_id and field_id=p_field for update;
  if not found or r.author_id<>auth.uid() or r.status not in ('Draft','Returned') then raise exception 'Only the author may edit a draft or returned recommendation'; end if;
  insert into public.advisory_events(field_id,actor_id,record_id,action,payload) values(p_field,auth.uid(),r.id,'Recommendation previous version',to_jsonb(r));
  update public.advisory_recommendations set title=p_title,activity_type=p_activity,planned_date=p_date,instructions=p_instructions,lines=p_lines,version=version+1,status=case when p_submit then 'Submitted' else 'Draft' end,updated_at=now() where id=p_id returning id into v_id;
 else
  insert into public.advisory_recommendations(field_id,author_id,request_id,title,activity_type,planned_date,instructions,lines,status) values(p_field,auth.uid(),p_request,p_title,p_activity,p_date,p_instructions,p_lines,case when p_submit then 'Submitted' else 'Draft' end) returning id into v_id;
 end if;
 insert into public.advisory_events(field_id,actor_id,record_id,action) values(p_field,auth.uid(),v_id,case when p_submit then 'Recommendation submitted' else 'Recommendation draft saved' end); return v_id;
end $$;
create or replace function public.advisory_review_recommendation(p_id uuid,p_decision text,p_message text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.advisory_recommendations%rowtype; f public.fields%rowtype; v_plan uuid; v_total numeric:=0; l jsonb;
begin
 select * into r from public.advisory_recommendations where id=p_id for update; if not found then raise exception 'Recommendation not found'; end if;
 select * into f from public.fields where id=r.field_id;
 if not public.advisory_manage_field(f.id) or not public.can_edit_farmer(f.user_id,'planning') then raise exception 'Farmer planning approval access required'; end if;
 if r.status='Approved' and p_decision='Approved' then return r.plan_id; end if;
 if r.status<>'Submitted' or p_decision not in ('Approved','Returned','Declined') then raise exception 'Only submitted recommendations can be reviewed'; end if;
 if p_decision='Approved' then
  if not exists(select 1 from public.advisory_links where field_id=f.id and advisor_id=r.author_id and status='Active') or not public.advisory_is_advisor(r.author_id) then raise exception 'This adviser no longer has active access'; end if;
  if f.area_ha<=0 or f.season is null then raise exception 'Set field hectares and season before approval'; end if;
  for l in select * from jsonb_array_elements(r.lines) loop v_total:=v_total+(l->>'rate')::numeric*(l->>'price')::numeric*f.area_ha; end loop;
  insert into public.activity_plans(user_id,field_id,farmer_name,farm_name,field_name,activity_type,crop,cultivar,season,planned_date,planned_area_ha,status,notes,planned_total)
  values(f.user_id,f.id,coalesce((select contact_name from public.role_applications where user_id=f.user_id),'Farmer'),coalesce(f.farm_name,'Farm'),f.field_name,r.activity_type,f.crop,f.cultivar,f.season,r.planned_date,f.area_ha,'Planned',concat('Approved advisory recommendation ',r.id,' v',r.version,': ',r.title,E'\n',r.instructions),v_total) returning id into v_plan;
  for l in select * from jsonb_array_elements(r.lines) loop
   if l->>'kind'='Operation' then
    insert into public.activity_plan_operations(user_id,plan_id,operation_name,unit,planned_rate_per_ha,planned_quantity,planned_unit_price,planned_cost) values(f.user_id,v_plan,l->>'name',l->>'unit',(l->>'rate')::numeric,(l->>'rate')::numeric*f.area_ha,(l->>'price')::numeric,(l->>'rate')::numeric*(l->>'price')::numeric*f.area_ha);
   else
    insert into public.activity_plan_products(user_id,plan_id,product_name,unit,planned_rate_per_ha,planned_quantity,planned_unit_price,planned_cost) values(f.user_id,v_plan,l->>'name',l->>'unit',(l->>'rate')::numeric,(l->>'rate')::numeric*f.area_ha,(l->>'price')::numeric,(l->>'rate')::numeric*(l->>'price')::numeric*f.area_ha);
   end if;
  end loop;
 end if;
 update public.advisory_recommendations set status=p_decision,plan_id=v_plan,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_id;
 insert into public.advisory_events(field_id,actor_id,record_id,action,payload) values(f.id,auth.uid(),r.id,'Recommendation '||p_decision,jsonb_build_object('version',r.version,'message',p_message,'plan_id',v_plan,'recommendation',to_jsonb(r)));
 return v_plan;
end $$;

create or replace function public.get_advisory_field_context(p_field uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare l public.advisory_links%rowtype; v_manager boolean; v_result jsonb:='{}';
begin
 if not public.advisory_read_field(p_field) then raise exception 'No access to this field'; end if;
 v_manager:=public.advisory_manage_field(p_field);
 select * into l from public.advisory_links where field_id=p_field and advisor_id=auth.uid() and status='Active';
 if v_manager or coalesce(l.share_plans,false) then v_result:=v_result||jsonb_build_object('plans',coalesce((select jsonb_agg(to_jsonb(p)) from public.activity_plans p where p.field_id=p_field),'[]')); end if;
 if v_manager or coalesce(l.share_scouting,false) then v_result:=v_result||jsonb_build_object('scouting',coalesce((select jsonb_agg(to_jsonb(s)-'photo_url'-'photo_path') from public.scouting_observations s where s.field_id=p_field),'[]')); end if;
 if v_manager or coalesce(l.share_yield,false) then v_result:=v_result||jsonb_build_object('harvest',coalesce((select jsonb_agg(jsonb_build_object('date',h.harvest_date,'tonnes',h.tonnes_harvested,'area_ha',h.area_ha,'crop',h.crop,'season',h.season)) from public.harvest_records h where h.field_id=p_field),'[]')); end if;
 return v_result;
end $$;

create or replace function public.advisory_storage_field(p_path text) returns uuid language sql immutable set search_path=public as $$
 select case when split_part(p_path,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_path,'/',1)::uuid else null end
$$;
insert into storage.buckets(id,name,public,file_size_limit) values('advisory-files','advisory-files',false,20971520) on conflict(id) do update set public=false,file_size_limit=20971520;
drop policy if exists advisory_files_read on storage.objects;
create policy advisory_files_read on storage.objects for select to authenticated using(bucket_id='advisory-files' and public.advisory_read_field(public.advisory_storage_field(name)));
drop policy if exists advisory_files_insert on storage.objects;
create policy advisory_files_insert on storage.objects for insert to authenticated with check(bucket_id='advisory-files' and (storage.foldername(name))[2]=auth.uid()::text and public.advisory_write_field(public.advisory_storage_field(name)));
drop policy if exists advisory_files_delete on storage.objects;
create policy advisory_files_delete on storage.objects for delete to authenticated using(bucket_id='advisory-files' and (storage.foldername(name))[2]=auth.uid()::text and public.advisory_write_field(public.advisory_storage_field(name)));
create or replace function public.review_role_application(p_application_id uuid,p_decision text,p_roles text[] default null,p_message text default null,p_private_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_app public.role_applications%rowtype; v_role text;
begin
  if not public.is_agcore_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_decision not in ('Approved','Rejected','Information Requested','Suspended') then raise exception 'Invalid decision'; end if;
  select * into v_app from public.role_applications where id=p_application_id for update; if not found then raise exception 'Application not found'; end if;
  if p_decision='Approved' and (p_roles is null or cardinality(p_roles)=0) then raise exception 'Select at least one approved role'; end if;
  update public.role_applications set status=p_decision,applicant_message=p_message,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_application_id;
  if p_decision='Approved' then
    update public.user_roles set active=false where user_id=v_app.user_id;
    foreach v_role in array p_roles loop
      if v_role not in ('Farmer','Buyer','Transporter','Agronomist','Chemical Representative') then raise exception 'Invalid role %',v_role; end if;
      insert into public.user_roles(user_id,role,granted_by) values(v_app.user_id,v_role,auth.uid()) on conflict(user_id,role) do update set active=true,granted_by=excluded.granted_by,granted_at=now();
    end loop;
    insert into public.marketplace_profiles(user_id,business_name,registration_number,vat_number,phone,address,roles,verification_status)
    values(v_app.user_id,v_app.business_name,v_app.registration_number,v_app.vat_number,v_app.phone,v_app.address,p_roles,'Verified')
    on conflict(user_id) do update set business_name=excluded.business_name,registration_number=excluded.registration_number,vat_number=excluded.vat_number,phone=excluded.phone,address=excluded.address,roles=p_roles,verification_status='Verified',updated_at=now();
  elsif p_decision in ('Rejected','Suspended') then
    update public.user_roles set active=false where user_id=v_app.user_id;
    update public.marketplace_profiles set verification_status=p_decision,roles=array[]::text[],updated_at=now() where user_id=v_app.user_id;
  end if;
  insert into public.verification_actions(application_id,applicant_id,admin_id,action,approved_roles,message_to_applicant,private_note)
  values(v_app.id,v_app.user_id,auth.uid(),p_decision,p_roles,p_message,p_private_note);
  insert into public.marketplace_notifications(user_id,title,message,href) values(v_app.user_id,'Account verification update',coalesce(p_message,'Your application status is now '||p_decision),'/dashboard');
  return true;
end $$;
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
    if v_module not in ('dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour','financials','harvest','transport','grain-market','reports','trials','advisory','weather','rainfall','scanner','alerts','assistant','whatsapp-inbox','master-data','offline-sync','settings') then raise exception 'Unknown dashboard: %',v_module; end if;
    insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,granted_by,can_edit)
      values(p_organization_id,v_user_id,v_module,true,auth.uid(),v_module=any(coalesce(p_edit_module_keys,'{}'::text[])) and p_role<>'Employee');
  end loop;
  update public.organization_member_dashboard_access set can_edit=(module_key=any(coalesce(p_edit_module_keys,'{}'::text[])) and p_role<>'Employee'),updated_at=now() where organization_id=p_organization_id and user_id=v_user_id;
  return v_user_id;
end $$;
create or replace function public.set_organization_member_dashboards(p_organization_id uuid,p_user_id uuid,p_module_keys text[],p_edit_module_keys text[] default '{}'::text[])
returns void language plpgsql security definer set search_path=public as $$
declare v_module text; v_role text;
begin
  if not public.is_organization_admin(p_organization_id,auth.uid()) then raise exception 'Organisation administrator access required'; end if;
  select role into v_role from public.organization_members where organization_id=p_organization_id and user_id=p_user_id and active;
  if v_role is null then raise exception 'Active organisation team member not found'; end if;
  delete from public.organization_member_dashboard_access where organization_id=p_organization_id and user_id=p_user_id;
  foreach v_module in array coalesce(p_module_keys,'{}'::text[]) loop
    if v_module not in ('dashboard','farm-map','fields','planning','activities','scouting','jobs','inventory','equipment','fuel','labour','financials','harvest','transport','grain-market','reports','trials','advisory','weather','rainfall','scanner','alerts','assistant','whatsapp-inbox','master-data','offline-sync','settings') then raise exception 'Unknown dashboard: %',v_module; end if;
    insert into public.organization_member_dashboard_access(organization_id,user_id,module_key,enabled,granted_by,can_edit)
      values(p_organization_id,p_user_id,v_module,true,auth.uid(),v_module=any(coalesce(p_edit_module_keys,'{}'::text[])) and v_role<>'Employee');
  end loop;
end $$;
drop policy if exists advisory_read on public.advisory_recommendations;
create policy advisory_read on public.advisory_recommendations for select to authenticated using(public.advisory_read_field(field_id) and (status<>'Draft' or author_id=auth.uid()));
drop policy if exists advisory_read on public.advisory_events;
create policy advisory_read on public.advisory_events for select to authenticated using(public.advisory_read_field(field_id) and (public.advisory_manage_field(field_id) or actor_id=auth.uid()));
do $$ declare r record; begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (left(p.proname,9)='advisory_' or left(p.proname,12)='get_advisory_') loop
 execute format('revoke all on function %s from public,anon',r.signature);
 execute format('grant execute on function %s to authenticated',r.signature);
 end loop;
end $$;
commit;
