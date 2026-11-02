-- CropNex v6.39.0. Personal farming-account palette shared with authorised team members.
begin;
create table if not exists public.farm_crop_colours (
 user_id uuid not null references auth.users(id) on delete cascade,
 crop_key text not null check(length(crop_key) between 1 and 160 and crop_key=lower(regexp_replace(trim(crop_key),'\s+',' ','g'))),
 colour text not null check(colour ~ '^#[0-9a-fA-F]{6}$'),
 primary key(user_id,crop_key)
);
alter table public.farm_crop_colours enable row level security;
grant select,insert,update,delete on public.farm_crop_colours to authenticated;
revoke all on public.farm_crop_colours from anon;
drop policy if exists farm_crop_colours_read on public.farm_crop_colours;
create policy farm_crop_colours_read on public.farm_crop_colours for select to authenticated using(public.can_access_farmer(user_id,'farm-map'));
drop policy if exists farm_crop_colours_insert on public.farm_crop_colours;
create policy farm_crop_colours_insert on public.farm_crop_colours for insert to authenticated with check(public.can_edit_farmer(user_id,'farm-map'));
drop policy if exists farm_crop_colours_update on public.farm_crop_colours;
create policy farm_crop_colours_update on public.farm_crop_colours for update to authenticated using(public.can_edit_farmer(user_id,'farm-map')) with check(public.can_edit_farmer(user_id,'farm-map'));
drop policy if exists farm_crop_colours_delete on public.farm_crop_colours;
create policy farm_crop_colours_delete on public.farm_crop_colours for delete to authenticated using(public.can_edit_farmer(user_id,'farm-map'));
commit;
