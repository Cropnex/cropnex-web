-- WhatsApp Farm Inbox: explicitly authorised phone numbers and inbound message queue.
-- The webhook uses the server-only service role after validating Meta's signature.
create table if not exists public.whatsapp_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  display_name text not null,
  default_shed_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, phone_e164)
);

create table if not exists public.whatsapp_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid references public.whatsapp_senders(id) on delete set null,
  sender_phone_e164 text not null,
  sender_name text,
  whatsapp_message_id text not null unique,
  whatsapp_phone_number_id text,
  message_type text not null,
  message_text text,
  media_id text,
  media_mime_type text,
  media_filename text,
  media_sha256 text,
  default_shed_name text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'ignored')),
  received_at timestamptz not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_inbox_user_received_idx
  on public.whatsapp_inbox (user_id, received_at desc);
create unique index if not exists whatsapp_senders_phone_active_idx
  on public.whatsapp_senders (phone_e164) where active;

alter table public.whatsapp_senders enable row level security;
alter table public.whatsapp_inbox enable row level security;

drop policy if exists whatsapp_senders_select_own_or_admin on public.whatsapp_senders;
create policy whatsapp_senders_select_own_or_admin on public.whatsapp_senders
  for select to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active = true
    )
  );
drop policy if exists whatsapp_senders_insert_own on public.whatsapp_senders;
create policy whatsapp_senders_insert_own on public.whatsapp_senders
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists whatsapp_senders_update_own_or_admin on public.whatsapp_senders;
create policy whatsapp_senders_update_own_or_admin on public.whatsapp_senders
  for update to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active = true
    )
  ) with check (
    user_id = (select auth.uid()) or exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active = true
    )
  );
drop policy if exists whatsapp_senders_delete_own_or_admin on public.whatsapp_senders;
create policy whatsapp_senders_delete_own_or_admin on public.whatsapp_senders
  for delete to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active = true
    )
  );

drop policy if exists whatsapp_inbox_select_own_or_admin on public.whatsapp_inbox;
create policy whatsapp_inbox_select_own_or_admin on public.whatsapp_inbox
  for select to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active = true
    )
  );
drop policy if exists whatsapp_inbox_update_own_or_admin on public.whatsapp_inbox;
create policy whatsapp_inbox_update_own_or_admin on public.whatsapp_inbox
  for update to authenticated using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active = true
    )
  ) with check (
    user_id = (select auth.uid()) or exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.active = true
    )
  );

grant select, insert, update, delete on public.whatsapp_senders to authenticated;
grant select, update on public.whatsapp_inbox to authenticated;
grant all on public.whatsapp_senders, public.whatsapp_inbox to service_role;
