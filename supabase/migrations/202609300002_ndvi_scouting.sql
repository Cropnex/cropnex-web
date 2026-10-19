-- AGCORE v5.9: NDVI-linked scouting observations and imagery registration.

create table if not exists public.scouting_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  source_layer_id uuid references public.map_layers(id) on delete set null,
  observation_date date not null,
  observation_time time,
  category text not null default 'General',
  issue_name text not null,
  severity text not null default 'Low',
  latitude numeric,
  longitude numeric,
  crop_stage text,
  affected_area_ha numeric,
  recommendation text,
  follow_up_date date,
  status text not null default 'Open',
  photo_url text,
  photo_path text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.scouting_observations add column if not exists source_layer_id uuid references public.map_layers(id) on delete set null;
alter table public.scouting_observations enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='scouting_observations' and policyname='scouting_observations_own') then
    create policy scouting_observations_own on public.scouting_observations for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
  end if;
end $$;

insert into storage.buckets(id,name,public) values('scouting-photos','scouting-photos',false) on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='scouting_photos_select') then create policy scouting_photos_select on storage.objects for select to authenticated using(bucket_id='scouting-photos' and (storage.foldername(name))[1]=auth.uid()::text); end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='scouting_photos_insert') then create policy scouting_photos_insert on storage.objects for insert to authenticated with check(bucket_id='scouting-photos' and (storage.foldername(name))[1]=auth.uid()::text); end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='scouting_photos_delete') then create policy scouting_photos_delete on storage.objects for delete to authenticated using(bucket_id='scouting-photos' and (storage.foldername(name))[1]=auth.uid()::text); end if;
end $$;

create index if not exists scouting_observations_field_date_idx on public.scouting_observations(field_id,observation_date desc);
create index if not exists scouting_observations_layer_idx on public.scouting_observations(source_layer_id);
