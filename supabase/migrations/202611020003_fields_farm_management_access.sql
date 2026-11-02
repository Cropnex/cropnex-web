-- CropNex v6.40.0: field managers can read/create the farm hierarchy from Fields.
-- Existing Farm Map permissions remain intact. No records are moved or deleted.
begin;
alter table public.farmers enable row level security;
alter table public.farms enable row level security;
drop policy if exists fields_farming_business_read on public.farmers;
create policy fields_farming_business_read on public.farmers for select to authenticated
 using(public.can_access_farmer(user_id,'fields'));
drop policy if exists fields_farming_business_create on public.farmers;
create policy fields_farming_business_create on public.farmers for insert to authenticated
 with check(public.can_edit_farmer(user_id,'fields') and length(trim(name))>0);
drop policy if exists fields_farms_read on public.farms;
create policy fields_farms_read on public.farms for select to authenticated
 using(public.can_access_farmer(user_id,'fields'));
drop policy if exists fields_farms_create on public.farms;
create policy fields_farms_create on public.farms for insert to authenticated
 with check(public.can_edit_farmer(user_id,'fields') and length(trim(name))>0
 and exists(select 1 from public.farmers parent where parent.id=farmer_id and parent.user_id=farms.user_id and parent.active));
commit;
