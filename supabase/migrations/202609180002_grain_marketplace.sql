-- AGCORE v3.5 grain marketplace and transport exchange.
-- Additive only. This is a cash-market workflow, not a JSE execution venue.

create table if not exists public.marketplace_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null, registration_number text, vat_number text, phone text,
  roles text[] not null default array['Farmer']::text[], verification_status text not null default 'Pending',
  province text, address text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.safex_reference_prices (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  commodity text not null, contract_code text not null, expiry_month text not null,
  price_per_tonne numeric(14,2) not null, change_per_tonne numeric(14,2), day_high numeric(14,2), day_low numeric(14,2),
  source text not null default 'Manual reference', delayed_minutes integer, observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(), unique(user_id,contract_code,expiry_month,observed_at)
);
create table if not exists public.grain_listings (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references auth.users(id) on delete cascade,
  commodity text not null, grade text not null, season text, quantity_tonnes numeric(14,3) not null check(quantity_tonnes>0),
  available_quantity_tonnes numeric(14,3) not null check(available_quantity_tonnes>=0), storage_type text not null,
  location_name text not null, address text, latitude numeric(10,7), longitude numeric(10,7),
  available_from date, delivery_by date, moisture numeric(6,3), quality_notes text,
  price_type text not null default 'Open bids', asking_price numeric(14,2), safex_contract text, basis_per_tonne numeric(14,2),
  partial_bids_allowed boolean not null default false, transport_terms text not null default 'Negotiable',
  listing_expires_at timestamptz, status text not null default 'Open', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.grain_bids (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.grain_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade, buyer_name text not null,
  quantity_tonnes numeric(14,3) not null check(quantity_tonnes>0), price_type text not null default 'Fixed',
  price_per_tonne numeric(14,2), basis_per_tonne numeric(14,2), safex_contract text,
  estimated_deductions_per_tonne numeric(14,2) not null default 0,
  transport_required boolean not null default false, destination_name text, destination_address text,
  destination_latitude numeric(10,7), destination_longitude numeric(10,7), delivery_window text,
  payment_terms text, quality_conditions text, bid_expires_at timestamptz, status text not null default 'Submitted',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.grain_deals (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.grain_listings(id),
  accepted_bid_id uuid not null unique references public.grain_bids(id), seller_id uuid not null references auth.users(id),
  buyer_id uuid not null references auth.users(id), commodity text not null, grade text not null,
  quantity_tonnes numeric(14,3) not null, agreed_price_per_tonne numeric(14,2), price_type text not null,
  basis_per_tonne numeric(14,2), safex_contract text, transport_required boolean not null default false,
  status text not null default 'Pending confirmation', seller_confirmed boolean not null default true,
  buyer_confirmed boolean not null default false, contract_reference text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.transport_requests (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null unique references public.grain_deals(id) on delete cascade,
  requested_by uuid not null references auth.users(id), commodity text not null, quantity_tonnes numeric(14,3) not null,
  pickup_name text not null, pickup_address text, pickup_latitude numeric(10,7), pickup_longitude numeric(10,7),
  destination_name text, destination_address text, destination_latitude numeric(10,7), destination_longitude numeric(10,7),
  loading_from date, deliver_by date, estimated_loads integer, requirements text,
  status text not null default 'Open', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.transport_bids (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.transport_requests(id) on delete cascade,
  transporter_id uuid not null references auth.users(id) on delete cascade, transporter_name text not null,
  price_basis text not null default 'Per tonne', amount numeric(14,2) not null check(amount>=0),
  available_date date, estimated_delivery_date date, vehicle_details text, insurance_details text,
  tracking_included boolean not null default false, notes text, status text not null default 'Submitted',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.marketplace_documents (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.grain_listings(id) on delete cascade, deal_id uuid references public.grain_deals(id) on delete cascade,
  transport_request_id uuid references public.transport_requests(id) on delete cascade,
  document_type text not null, file_name text not null, storage_path text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.marketplace_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, message text not null, href text not null default '/grain-marketing', read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.marketplace_events (
  id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null, entity_id uuid not null, event_type text not null, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['marketplace_profiles','safex_reference_prices','grain_listings','grain_bids','grain_deals','transport_requests','transport_bids','marketplace_documents','marketplace_notifications','marketplace_events'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;
do $$ begin
  if not exists(select 1 from pg_policies where tablename='marketplace_profiles' and policyname='marketplace_profiles_read') then create policy marketplace_profiles_read on public.marketplace_profiles for select to authenticated using(true); end if;
  if not exists(select 1 from pg_policies where tablename='marketplace_profiles' and policyname='marketplace_profiles_own') then create policy marketplace_profiles_own on public.marketplace_profiles for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='safex_reference_prices' and policyname='safex_prices_read') then create policy safex_prices_read on public.safex_reference_prices for select to authenticated using(user_id is null or user_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='safex_reference_prices' and policyname='safex_prices_own') then create policy safex_prices_own on public.safex_reference_prices for all using(user_id=auth.uid()) with check(user_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='grain_listings' and policyname='grain_listings_read') then create policy grain_listings_read on public.grain_listings for select to authenticated using(true); end if;
  if not exists(select 1 from pg_policies where tablename='grain_listings' and policyname='grain_listings_own') then create policy grain_listings_own on public.grain_listings for all using(seller_id=auth.uid()) with check(seller_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='grain_bids' and policyname='grain_bids_read') then create policy grain_bids_read on public.grain_bids for select to authenticated using(buyer_id=auth.uid() or exists(select 1 from public.grain_listings l where l.id=listing_id and l.seller_id=auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='grain_bids' and policyname='grain_bids_insert') then create policy grain_bids_insert on public.grain_bids for insert to authenticated with check(buyer_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='grain_bids' and policyname='grain_bids_update') then create policy grain_bids_update on public.grain_bids for update to authenticated using(buyer_id=auth.uid() or exists(select 1 from public.grain_listings l where l.id=listing_id and l.seller_id=auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='grain_deals' and policyname='grain_deals_parties') then create policy grain_deals_parties on public.grain_deals for select to authenticated using(seller_id=auth.uid() or buyer_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='grain_deals' and policyname='grain_deals_update') then create policy grain_deals_update on public.grain_deals for update to authenticated using(seller_id=auth.uid() or buyer_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='transport_requests' and policyname='transport_requests_read') then create policy transport_requests_read on public.transport_requests for select to authenticated using(true); end if;
  if not exists(select 1 from pg_policies where tablename='transport_requests' and policyname='transport_requests_parties') then create policy transport_requests_parties on public.transport_requests for update to authenticated using(requested_by=auth.uid() or exists(select 1 from public.grain_deals d where d.id=deal_id and (d.seller_id=auth.uid() or d.buyer_id=auth.uid()))); end if;
  if not exists(select 1 from pg_policies where tablename='transport_bids' and policyname='transport_bids_read') then create policy transport_bids_read on public.transport_bids for select to authenticated using(transporter_id=auth.uid() or exists(select 1 from public.transport_requests r where r.id=request_id and r.requested_by=auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='transport_bids' and policyname='transport_bids_insert') then create policy transport_bids_insert on public.transport_bids for insert to authenticated with check(transporter_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='transport_bids' and policyname='transport_bids_update') then create policy transport_bids_update on public.transport_bids for update to authenticated using(transporter_id=auth.uid() or exists(select 1 from public.transport_requests r where r.id=request_id and r.requested_by=auth.uid())); end if;
  if not exists(select 1 from pg_policies where tablename='marketplace_documents' and policyname='marketplace_documents_own') then create policy marketplace_documents_own on public.marketplace_documents for all using(owner_id=auth.uid()) with check(owner_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='marketplace_notifications' and policyname='marketplace_notifications_own') then create policy marketplace_notifications_own on public.marketplace_notifications for all using(user_id=auth.uid()) with check(user_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='marketplace_events' and policyname='marketplace_events_insert') then create policy marketplace_events_insert on public.marketplace_events for insert to authenticated with check(actor_id=auth.uid()); end if;
  if not exists(select 1 from pg_policies where tablename='marketplace_events' and policyname='marketplace_events_read') then create policy marketplace_events_read on public.marketplace_events for select to authenticated using(actor_id=auth.uid()); end if;
end $$;

insert into storage.buckets(id,name,public) values('marketplace-documents','marketplace-documents',false) on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='marketplace_docs_select') then create policy marketplace_docs_select on storage.objects for select to authenticated using(bucket_id='marketplace-documents' and (storage.foldername(name))[1]=auth.uid()::text); end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='marketplace_docs_insert') then create policy marketplace_docs_insert on storage.objects for insert to authenticated with check(bucket_id='marketplace-documents' and (storage.foldername(name))[1]=auth.uid()::text); end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='marketplace_docs_delete') then create policy marketplace_docs_delete on storage.objects for delete to authenticated using(bucket_id='marketplace-documents' and (storage.foldername(name))[1]=auth.uid()::text); end if;
end $$;

create or replace function public.accept_grain_bid(p_bid_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_bid public.grain_bids%rowtype; v_listing public.grain_listings%rowtype; v_deal_id uuid; v_reference text;
begin
 select * into v_bid from public.grain_bids where id=p_bid_id for update; if not found then raise exception 'Bid not found'; end if;
 select * into v_listing from public.grain_listings where id=v_bid.listing_id for update;
 if v_listing.seller_id<>auth.uid() then raise exception 'Only the seller can accept this bid'; end if;
 if v_listing.status<>'Open' or v_bid.status<>'Submitted' then raise exception 'Listing or bid is no longer open'; end if;
 if v_bid.quantity_tonnes>v_listing.available_quantity_tonnes then raise exception 'Bid exceeds available quantity'; end if;
 v_reference:='AGC-'||upper(left(replace(gen_random_uuid()::text,'-',''),10));
 insert into public.grain_deals(listing_id,accepted_bid_id,seller_id,buyer_id,commodity,grade,quantity_tonnes,agreed_price_per_tonne,price_type,basis_per_tonne,safex_contract,transport_required,contract_reference)
 values(v_listing.id,v_bid.id,v_listing.seller_id,v_bid.buyer_id,v_listing.commodity,v_listing.grade,v_bid.quantity_tonnes,v_bid.price_per_tonne,v_bid.price_type,v_bid.basis_per_tonne,v_bid.safex_contract,v_bid.transport_required,v_reference) returning id into v_deal_id;
 update public.grain_bids set status=case when id=v_bid.id then 'Accepted' else 'Unsuccessful' end,updated_at=now() where listing_id=v_listing.id and status='Submitted';
 update public.grain_listings set available_quantity_tonnes=available_quantity_tonnes-v_bid.quantity_tonnes,status=case when available_quantity_tonnes-v_bid.quantity_tonnes<=0 then 'Sold' else 'Open' end,updated_at=now() where id=v_listing.id;
 if v_bid.transport_required then insert into public.transport_requests(deal_id,requested_by,commodity,quantity_tonnes,pickup_name,pickup_address,pickup_latitude,pickup_longitude,destination_name,destination_address,destination_latitude,destination_longitude,loading_from,deliver_by)
 values(v_deal_id,v_bid.buyer_id,v_listing.commodity,v_bid.quantity_tonnes,v_listing.location_name,v_listing.address,v_listing.latitude,v_listing.longitude,v_bid.destination_name,v_bid.destination_address,v_bid.destination_latitude,v_bid.destination_longitude,v_listing.available_from,v_listing.delivery_by); end if;
 insert into public.marketplace_notifications(user_id,title,message) values(v_bid.buyer_id,'Grain bid accepted',v_reference||' · '||v_listing.commodity||' · '||v_bid.quantity_tonnes||' t');
 insert into public.marketplace_events(actor_id,entity_type,entity_id,event_type,details) values(auth.uid(),'grain_deal',v_deal_id,'Bid accepted',jsonb_build_object('reference',v_reference));
 return v_deal_id;
end $$;
grant execute on function public.accept_grain_bid(uuid) to authenticated;

create or replace function public.accept_transport_bid(p_bid_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_bid public.transport_bids%rowtype; v_request public.transport_requests%rowtype;
begin
 select * into v_bid from public.transport_bids where id=p_bid_id for update; if not found then raise exception 'Transport bid not found'; end if;
 select * into v_request from public.transport_requests where id=v_bid.request_id for update;
 if v_request.requested_by<>auth.uid() then raise exception 'Only the transport requester can accept this bid'; end if;
 if v_request.status<>'Open' then raise exception 'Transport request is no longer open'; end if;
 update public.transport_bids set status=case when id=v_bid.id then 'Accepted' else 'Unsuccessful' end,updated_at=now() where request_id=v_request.id and status='Submitted';
 update public.transport_requests set status='Awarded',updated_at=now() where id=v_request.id;
 insert into public.marketplace_notifications(user_id,title,message) values(v_bid.transporter_id,'Transport bid accepted',v_request.commodity||' · '||v_request.quantity_tonnes||' t');
 insert into public.marketplace_events(actor_id,entity_type,entity_id,event_type,details) values(auth.uid(),'transport_request',v_request.id,'Transport awarded',jsonb_build_object('bid_id',v_bid.id));
 return v_request.id;
end $$;
grant execute on function public.accept_transport_bid(uuid) to authenticated;

create index if not exists grain_listings_market_idx on public.grain_listings(status,commodity,created_at desc);
create index if not exists grain_bids_listing_idx on public.grain_bids(listing_id,status);
create index if not exists grain_deals_parties_idx on public.grain_deals(seller_id,buyer_id,status);
create index if not exists transport_requests_market_idx on public.transport_requests(status,created_at desc);
create index if not exists transport_bids_request_idx on public.transport_bids(request_id,status);
