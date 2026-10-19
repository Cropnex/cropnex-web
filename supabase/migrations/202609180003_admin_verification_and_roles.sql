-- AGCORE v3.6 secure verification, administrator control and approved roles.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  admin_level text not null default 'Admin' check(admin_level in ('Admin','Super Admin')),
  appointed_by uuid references auth.users(id), active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.role_applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  requested_roles text[] not null, contact_name text not null, business_name text not null,
  registration_number text, vat_number text, phone text, address text, motivation text,
  status text not null default 'Pending' check(status in ('Draft','Pending','Information Requested','Approved','Rejected','Suspended')),
  applicant_message text, submitted_at timestamptz, reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('Farmer','Buyer','Transporter')), active boolean not null default true,
  granted_by uuid not null references auth.users(id), granted_at timestamptz not null default now(),
  unique(user_id,role)
);
create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.role_applications(id) on delete cascade,
  document_type text not null, file_name text not null, storage_path text not null,
  review_status text not null default 'Pending' check(review_status in ('Pending','Accepted','Rejected')),
  created_at timestamptz not null default now()
);
create table if not exists public.verification_actions (
  id bigint generated always as identity primary key, application_id uuid not null references public.role_applications(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade, admin_id uuid not null references auth.users(id),
  action text not null, approved_roles text[], message_to_applicant text, private_note text,
  created_at timestamptz not null default now()
);

create or replace function public.is_agcore_admin(p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admin_users where user_id=p_user_id and active=true)
$$;
grant execute on function public.is_agcore_admin(uuid) to authenticated;

create or replace function public.admin_bootstrap_available() returns boolean
language sql stable security definer set search_path=public as $$ select not exists(select 1 from public.admin_users) $$;
grant execute on function public.admin_bootstrap_available() to authenticated;

create or replace function public.claim_first_super_admin() returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(6142026);
  if exists(select 1 from public.admin_users) then raise exception 'The first administrator has already been established'; end if;
  insert into public.admin_users(user_id,admin_level,appointed_by) values(auth.uid(),'Super Admin',auth.uid());
  insert into public.user_roles(user_id,role,granted_by) values(auth.uid(),'Farmer',auth.uid()) on conflict(user_id,role) do update set active=true,granted_by=excluded.granted_by,granted_at=now();
  insert into public.role_applications(user_id,requested_roles,contact_name,business_name,status,submitted_at,reviewed_at,reviewed_by)
  values(auth.uid(),array['Farmer'],coalesce((select raw_user_meta_data->>'full_name' from auth.users where id=auth.uid()),'AGCORE Administrator'),coalesce((select raw_user_meta_data->>'business_name' from auth.users where id=auth.uid()),'AGCORE'),'Approved',now(),now(),auth.uid())
  on conflict(user_id) do update set status='Approved',reviewed_at=now(),reviewed_by=auth.uid();
  insert into public.marketplace_profiles(user_id,business_name,roles,verification_status)
  values(auth.uid(),'AGCORE',array['Farmer'],'Verified') on conflict(user_id) do update set roles=array['Farmer'],verification_status='Verified',updated_at=now();
  return true;
end $$;
grant execute on function public.claim_first_super_admin() to authenticated;

create or replace function public.protect_marketplace_verification() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.is_agcore_admin(auth.uid()) then
    if tg_op='INSERT' then new.verification_status:='Pending'; new.roles:=array[]::text[];
    elsif new.verification_status is distinct from old.verification_status or new.roles is distinct from old.roles then
      raise exception 'Approved roles and verification status can only be changed by an AGCORE administrator';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_marketplace_verification_trigger on public.marketplace_profiles;
create trigger protect_marketplace_verification_trigger before insert or update on public.marketplace_profiles for each row execute function public.protect_marketplace_verification();

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
      if v_role not in ('Farmer','Buyer','Transporter') then raise exception 'Invalid role %',v_role; end if;
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
grant execute on function public.review_role_application(uuid,text,text[],text,text) to authenticated;

create or replace function public.appoint_agcore_admin(p_user_id uuid,p_admin_level text default 'Admin') returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid() and active and admin_level='Super Admin') then raise exception 'Super Admin access required'; end if;
  if p_admin_level not in ('Admin','Super Admin') then raise exception 'Invalid admin level'; end if;
  insert into public.admin_users(user_id,admin_level,appointed_by) values(p_user_id,p_admin_level,auth.uid()) on conflict(user_id) do update set admin_level=excluded.admin_level,active=true,appointed_by=auth.uid();
  return true;
end $$;
grant execute on function public.appoint_agcore_admin(uuid,text) to authenticated;

alter table public.admin_users enable row level security; alter table public.role_applications enable row level security;
alter table public.user_roles enable row level security; alter table public.verification_documents enable row level security;
alter table public.verification_actions enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where tablename='admin_users' and policyname='admins_read') then create policy admins_read on public.admin_users for select to authenticated using(public.is_agcore_admin(auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='role_applications' and policyname='applications_own_read') then create policy applications_own_read on public.role_applications for select to authenticated using(user_id=auth.uid() or public.is_agcore_admin(auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='role_applications' and policyname='applications_own_insert') then create policy applications_own_insert on public.role_applications for insert to authenticated with check(user_id=auth.uid() and status in ('Draft','Pending')); end if;
  if not exists(select 1 from pg_policies where tablename='role_applications' and policyname='applications_own_update') then create policy applications_own_update on public.role_applications for update to authenticated using((user_id=auth.uid() and status in ('Draft','Pending','Information Requested')) or public.is_agcore_admin(auth.uid())) with check(user_id=auth.uid() or public.is_agcore_admin(auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='user_roles' and policyname='roles_read') then create policy roles_read on public.user_roles for select to authenticated using(user_id=auth.uid() or public.is_agcore_admin(auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='verification_documents' and policyname='verification_docs_read') then create policy verification_docs_read on public.verification_documents for select to authenticated using(user_id=auth.uid() or public.is_agcore_admin(auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='verification_documents' and policyname='verification_docs_own_insert') then create policy verification_docs_own_insert on public.verification_documents for insert to authenticated with check(user_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='verification_actions' and policyname='verification_actions_read') then create policy verification_actions_read on public.verification_actions for select to authenticated using(applicant_id=auth.uid() or public.is_agcore_admin(auth.uid())); end if;
end $$;

drop policy if exists marketplace_profiles_own on public.marketplace_profiles;
do $$ begin
  if not exists(select 1 from pg_policies where tablename='marketplace_profiles' and policyname='marketplace_profiles_self_insert') then create policy marketplace_profiles_self_insert on public.marketplace_profiles for insert to authenticated with check(user_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='marketplace_profiles' and policyname='marketplace_profiles_self_update') then create policy marketplace_profiles_self_update on public.marketplace_profiles for update to authenticated using(user_id=auth.uid() or public.is_agcore_admin(auth.uid())) with check(user_id=auth.uid() or public.is_agcore_admin(auth.uid())); end if;
end $$;

insert into storage.buckets(id,name,public) values('verification-documents','verification-documents',false) on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='verification_docs_select') then create policy verification_docs_select on storage.objects for select to authenticated using(bucket_id='verification-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_agcore_admin(auth.uid()))); end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='verification_docs_insert') then create policy verification_docs_insert on storage.objects for insert to authenticated with check(bucket_id='verification-documents' and (storage.foldername(name))[1]=auth.uid()::text); end if;
end $$;

create index if not exists role_applications_status_idx on public.role_applications(status,submitted_at desc);
create index if not exists user_roles_user_idx on public.user_roles(user_id,active);
create index if not exists verification_documents_application_idx on public.verification_documents(application_id);
