-- CropNex master catalogue improvements: stable CropNex IDs, descriptions, and operation IDs.
-- Product/operation UUIDs remain unchanged so existing planning and inventory references stay valid.

alter table public.master_products add column if not exists description text;
alter table public.standard_operations add column if not exists catalogue_code text;
alter table public.standard_operations add column if not exists description text;

-- Rename legacy human-readable catalogue codes without changing their linked UUIDs.
with numbered as (
  select id, row_number() over (partition by case when lower(coalesce(product_class, category, '')) like '%seed%' then 'CNS' else 'CNP' end order by created_at, id) as n,
         case when lower(coalesce(product_class, category, '')) like '%seed%' then 'CNS' else 'CNP' end as prefix
  from public.master_products
)
update public.master_products p set catalogue_code = n.prefix || lpad(n.n::text, 5, '0')
from numbered n where n.id = p.id and p.catalogue_code !~ '^(CNP|CNS)[0-9]+$';

with numbered as (
  select id, row_number() over (order by created_at, id) as n
  from public.standard_operations
)
update public.standard_operations o set catalogue_code = 'CNO' || lpad(n.n::text, 5, '0')
from numbered n where n.id = o.id and coalesce(o.catalogue_code, '') !~ '^CNO[0-9]+$';

create unique index if not exists standard_operations_catalogue_code_uidx
  on public.standard_operations(catalogue_code) where catalogue_code is not null;

create or replace function public.cropnex_next_catalogue_code(p_prefix text)
returns text language plpgsql security definer set search_path=public as $$
declare v_number integer;
begin
  if p_prefix not in ('CNO','CNP','CNS') then raise exception 'Invalid CropNex catalogue prefix'; end if;
  perform pg_advisory_xact_lock(hashtext('cropnex_catalogue_' || p_prefix));
  if p_prefix = 'CNO' then
    select coalesce(max(substring(catalogue_code from 4)::integer),0)+1 into v_number from public.standard_operations where catalogue_code ~ '^CNO[0-9]+$';
  else
    select coalesce(max(substring(catalogue_code from 4)::integer),0)+1 into v_number from public.master_products where catalogue_code ~ ('^' || p_prefix || '[0-9]+$');
  end if;
  return p_prefix || lpad(v_number::text,5,'0');
end $$;

create or replace function public.cropnex_assign_catalogue_code()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name = 'standard_operations' then
    if new.catalogue_code is null or new.catalogue_code !~ '^CNO[0-9]+$' then new.catalogue_code := public.cropnex_next_catalogue_code('CNO'); end if;
  else
    if new.catalogue_code is null or new.catalogue_code !~ '^(CNP|CNS)[0-9]+$' then
      new.catalogue_code := public.cropnex_next_catalogue_code(case when lower(coalesce(new.product_class,new.category,'')) like '%seed%' then 'CNS' else 'CNP' end);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cropnex_product_code_trigger on public.master_products;
create trigger cropnex_product_code_trigger before insert on public.master_products
for each row execute function public.cropnex_assign_catalogue_code();
drop trigger if exists cropnex_operation_code_trigger on public.standard_operations;
create trigger cropnex_operation_code_trigger before insert on public.standard_operations
for each row execute function public.cropnex_assign_catalogue_code();

-- New product approvals receive the correct CropNex prefix, including CNS for seeds.
create or replace function public.review_product_request(
  p_request_id uuid, p_decision text, p_existing_product_id uuid default null, p_admin_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_request public.product_requests%rowtype; v_product_id uuid; v_code text; v_prefix text;
begin
  if not public.is_agcore_admin(auth.uid()) then raise exception 'CropNex administrator access required'; end if;
  if p_decision not in ('Approved','Merged','Rejected') then raise exception 'Invalid decision'; end if;
  select * into v_request from public.product_requests where id=p_request_id and status='Pending' for update;
  if not found then raise exception 'Pending request not found'; end if;
  if p_decision='Approved' then
    v_prefix := case when lower(coalesce(v_request.product_class,v_request.category,'')) like '%seed%' then 'CNS' else 'CNP' end;
    v_code := public.cropnex_next_catalogue_code(v_prefix);
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

