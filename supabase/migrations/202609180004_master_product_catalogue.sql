-- AGCORE v3.9 shared product catalogue, farmer requests and inventory linkage.
-- Additive only. Existing inventory records remain usable and can be linked later.

create table if not exists public.master_products (
  id uuid primary key default gen_random_uuid(),
  catalogue_code text not null unique,
  name text not null,
  base_product text,
  formulation text,
  pack_size numeric(14,3),
  pack_unit text,
  category text not null default 'Unclassified',
  manufacturer text,
  registration_number text,
  status text not null default 'Approved' check(status in ('Pending','Approved','Inactive')),
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_name text not null,
  manufacturer text,
  category text not null default 'Unclassified',
  formulation text,
  pack_size numeric(14,3),
  pack_unit text,
  registration_number text,
  supplier text,
  private_unit_cost numeric(14,4),
  label_photo_path text,
  status text not null default 'Pending' check(status in ('Pending','Approved','Merged','Rejected')),
  resolved_product_id uuid references public.master_products(id) on delete set null,
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items add column if not exists master_product_id uuid references public.master_products(id) on delete restrict;
create index if not exists master_products_search_idx on public.master_products(status,category,name);
create index if not exists product_requests_status_idx on public.product_requests(status,created_at desc);
create index if not exists inventory_items_master_product_idx on public.inventory_items(master_product_id);

alter table public.master_products enable row level security;
alter table public.product_requests enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where tablename='master_products' and policyname='master_products_read') then
    create policy master_products_read on public.master_products for select to authenticated
      using(status='Approved' or public.is_agcore_admin(auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where tablename='master_products' and policyname='master_products_admin_insert') then
    create policy master_products_admin_insert on public.master_products for insert to authenticated
      with check(public.is_agcore_admin(auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where tablename='master_products' and policyname='master_products_admin_update') then
    create policy master_products_admin_update on public.master_products for update to authenticated
      using(public.is_agcore_admin(auth.uid())) with check(public.is_agcore_admin(auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where tablename='product_requests' and policyname='product_requests_read') then
    create policy product_requests_read on public.product_requests for select to authenticated
      using(user_id=auth.uid() or public.is_agcore_admin(auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where tablename='product_requests' and policyname='product_requests_insert') then
    create policy product_requests_insert on public.product_requests for insert to authenticated
      with check(user_id=auth.uid() and status='Pending');
  end if;
  if not exists(select 1 from pg_policies where tablename='product_requests' and policyname='product_requests_admin_update') then
    create policy product_requests_admin_update on public.product_requests for update to authenticated
      using(public.is_agcore_admin(auth.uid())) with check(public.is_agcore_admin(auth.uid()));
  end if;
end $$;

create or replace function public.review_product_request(
  p_request_id uuid, p_decision text, p_existing_product_id uuid default null, p_admin_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_request public.product_requests%rowtype; v_product_id uuid; v_code text;
begin
  if not public.is_agcore_admin(auth.uid()) then raise exception 'AGCORE administrator access required'; end if;
  if p_decision not in ('Approved','Merged','Rejected') then raise exception 'Invalid decision'; end if;
  select * into v_request from public.product_requests where id=p_request_id and status='Pending' for update;
  if not found then raise exception 'Pending request not found'; end if;
  if p_decision='Approved' then
    select 'AGP'||lpad((coalesce(max(substring(catalogue_code from '[0-9]+')::integer),0)+1)::text,4,'0') into v_code from public.master_products;
    insert into public.master_products(catalogue_code,name,base_product,formulation,pack_size,pack_unit,category,manufacturer,registration_number,status,created_by,approved_by,approved_at)
    values(v_code,v_request.requested_name,v_request.requested_name,v_request.formulation,v_request.pack_size,v_request.pack_unit,v_request.category,v_request.manufacturer,v_request.registration_number,'Approved',v_request.user_id,auth.uid(),now())
    returning id into v_product_id;
  elsif p_decision='Merged' then
    if p_existing_product_id is null then raise exception 'Select the matching catalogue product'; end if;
    select id into v_product_id from public.master_products where id=p_existing_product_id and status='Approved';
    if not found then raise exception 'Approved catalogue product not found'; end if;
  end if;
  update public.product_requests set status=p_decision,resolved_product_id=v_product_id,admin_note=p_admin_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_request_id;
  return v_product_id;
end $$;
grant execute on function public.review_product_request(uuid,text,uuid,text) to authenticated;

insert into storage.buckets(id,name,public) values('product-request-labels','product-request-labels',false) on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='product_labels_select') then
    create policy product_labels_select on storage.objects for select to authenticated
      using(bucket_id='product-request-labels' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_agcore_admin(auth.uid())));
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='product_labels_insert') then
    create policy product_labels_insert on storage.objects for insert to authenticated
      with check(bucket_id='product-request-labels' and (storage.foldername(name))[1]=auth.uid()::text);
  end if;
end $$;
