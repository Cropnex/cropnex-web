-- AGCORE v4.8: richer master-product classification.
-- Additive only; existing category values remain valid and are copied into product_class.

alter table public.master_products
  add column if not exists product_class text,
  add column if not exists crop_type text;

update public.master_products
set product_class = category
where product_class is null;

alter table public.product_requests
  add column if not exists product_class text,
  add column if not exists crop_type text;

update public.product_requests
set product_class = category
where product_class is null;

create index if not exists master_products_class_crop_idx
  on public.master_products(status, product_class, crop_type, name);

-- Keep the legacy category column synchronised because existing planning and reports use it.
create or replace function public.sync_master_product_classification()
returns trigger language plpgsql set search_path=public as $$
begin
  new.product_class := coalesce(nullif(new.product_class, ''), nullif(new.category, ''), 'Unclassified');
  new.category := new.product_class;
  return new;
end $$;

drop trigger if exists sync_master_product_classification_trigger on public.master_products;
create trigger sync_master_product_classification_trigger
before insert or update of category, product_class on public.master_products
for each row execute function public.sync_master_product_classification();

-- Carry the richer classification through when an administrator approves a request.
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
    insert into public.master_products(catalogue_code,name,base_product,formulation,pack_size,pack_unit,category,product_class,crop_type,manufacturer,registration_number,status,created_by,approved_by,approved_at)
    values(v_code,v_request.requested_name,v_request.requested_name,v_request.formulation,v_request.pack_size,v_request.pack_unit,coalesce(v_request.product_class,v_request.category),coalesce(v_request.product_class,v_request.category),v_request.crop_type,v_request.manufacturer,v_request.registration_number,'Approved',v_request.user_id,auth.uid(),now())
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
