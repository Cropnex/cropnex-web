-- Allow a farmer-requested product to be used immediately while AGCORE reviews it.
alter table public.crop_template_lines
  add column if not exists product_request_id uuid references public.product_requests(id) on delete set null;
alter table public.activity_plan_products
  add column if not exists product_request_id uuid references public.product_requests(id) on delete set null;

alter table public.crop_template_lines drop constraint if exists crop_template_lines_source_check;
alter table public.crop_template_lines add constraint crop_template_lines_source_check check(
  (line_type='Product' and operation_id is null and
    (master_product_id is not null or inventory_item_id is not null or product_request_id is not null))
  or
  (line_type='Operation' and operation_id is not null and master_product_id is null
    and inventory_item_id is null and product_request_id is null)
);

create index if not exists crop_template_lines_request_idx on public.crop_template_lines(product_request_id);
create index if not exists activity_plan_products_request_idx on public.activity_plan_products(product_request_id);

-- When a request is approved or merged, move every plan reference to the approved catalogue item.
create or replace function public.resolve_requested_product_in_plans()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.resolved_product_id is not null and new.status in ('Approved','Merged') then
    update public.crop_template_lines
      set master_product_id=new.resolved_product_id, product_request_id=null
      where product_request_id=new.id;
    update public.activity_plan_products
      set master_product_id=new.resolved_product_id, product_request_id=null
      where product_request_id=new.id;
  end if;
  return new;
end $$;

drop trigger if exists product_request_resolve_plans on public.product_requests;
create trigger product_request_resolve_plans
after update of status,resolved_product_id on public.product_requests
for each row execute function public.resolve_requested_product_in_plans();
