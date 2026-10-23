create table if not exists public.pre_subscribers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  farm_name text,
  status text not null default 'New'
    check (status in ('New', 'Contacted', 'Invited to apply', 'Converted', 'Unsubscribed')),
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pre_subscribers enable row level security;
grant select, update on public.pre_subscribers to authenticated;

drop policy if exists pre_subscribers_admin_read on public.pre_subscribers;
create policy pre_subscribers_admin_read on public.pre_subscribers
  for select to authenticated using (public.is_agcore_admin(auth.uid()));

drop policy if exists pre_subscribers_admin_update on public.pre_subscribers;
create policy pre_subscribers_admin_update on public.pre_subscribers
  for update to authenticated
  using (public.is_agcore_admin(auth.uid()))
  with check (public.is_agcore_admin(auth.uid()));

create or replace function public.capture_cropnex_pre_subscriber()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'pre_subscribe', 'false') = 'true' then
    insert into public.pre_subscribers (
      user_id, email, full_name, farm_name, email_confirmed_at, created_at, updated_at
    ) values (
      new.id,
      new.email,
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'farm_name'), ''),
      new.email_confirmed_at,
      coalesce(new.created_at, now()),
      now()
    )
    on conflict (user_id) do update set
      email = excluded.email,
      full_name = coalesce(excluded.full_name, public.pre_subscribers.full_name),
      farm_name = coalesce(excluded.farm_name, public.pre_subscribers.farm_name),
      email_confirmed_at = excluded.email_confirmed_at,
      updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.capture_cropnex_pre_subscriber() from public, anon, authenticated;
drop trigger if exists capture_cropnex_pre_subscriber on auth.users;
create trigger capture_cropnex_pre_subscriber
  after insert or update of email, raw_user_meta_data, email_confirmed_at on auth.users
  for each row execute function public.capture_cropnex_pre_subscriber();

-- Include pre-subscribers who registered before this migration was installed.
insert into public.pre_subscribers (
  user_id, email, full_name, farm_name, email_confirmed_at, created_at, updated_at
)
select
  id,
  email,
  nullif(btrim(raw_user_meta_data->>'full_name'), ''),
  nullif(btrim(raw_user_meta_data->>'farm_name'), ''),
  email_confirmed_at,
  coalesce(created_at, now()),
  now()
from auth.users
where coalesce(raw_user_meta_data->>'pre_subscribe', 'false') = 'true'
on conflict (user_id) do update set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, public.pre_subscribers.full_name),
  farm_name = coalesce(excluded.farm_name, public.pre_subscribers.farm_name),
  email_confirmed_at = excluded.email_confirmed_at,
  updated_at = now();
