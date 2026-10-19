-- Publish the current CropNex name for the admin RPC while preserving the
-- authorization check in the already-deployed admin function.
create or replace function public.appoint_cropnex_admin(
  p_user_id uuid,
  p_admin_level text default 'Admin'
) returns boolean
language sql security invoker set search_path=public as $$
  select public.appoint_agcore_admin(p_user_id, p_admin_level)
$$;

grant execute on function public.appoint_cropnex_admin(uuid, text) to authenticated;
