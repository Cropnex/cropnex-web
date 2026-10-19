-- Use CropNex labels for future first-admin setup and clean up exact legacy defaults.
create or replace function public.claim_first_super_admin() returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
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

update public.role_applications set business_name='CropNex'
where business_name='AGCORE' and user_id in (select user_id from public.admin_users where admin_level='Super Admin');
update public.role_applications set contact_name='CropNex Administrator'
where contact_name='AGCORE Administrator' and user_id in (select user_id from public.admin_users where admin_level='Super Admin');
update public.marketplace_profiles set business_name='CropNex'
where business_name='AGCORE' and user_id in (select user_id from public.admin_users where admin_level='Super Admin');
