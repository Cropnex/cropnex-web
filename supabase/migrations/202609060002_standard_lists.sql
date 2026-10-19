-- AGCORE v3.3 standardized master lists and reusable activity recipes.
create table if not exists public.farmers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, registration_number text, active boolean not null default true, created_at timestamptz not null default now(),
  unique(user_id,name)
);
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  farmer_id uuid not null references public.farmers(id) on delete restrict, name text not null,
  active boolean not null default true, created_at timestamptz not null default now(), unique(user_id,farmer_id,name)
);
create table if not exists public.cultivars (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  crop text not null, name text not null, active boolean not null default true, created_at timestamptz not null default now(), unique(user_id,crop,name)
);
create table if not exists public.activity_templates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, category text not null, description text, active boolean not null default true,
  created_at timestamptz not null default now(), unique(user_id,name)
);
create table if not exists public.activity_template_products (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.activity_templates(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  product_name text not null, unit text not null, default_rate_per_ha numeric(14,4) not null check(default_rate_per_ha>=0),
  created_at timestamptz not null default now(), unique(template_id,inventory_item_id)
);
alter table public.fields add column if not exists farmer_id uuid references public.farmers(id) on delete set null;
alter table public.fields add column if not exists farm_id uuid references public.farms(id) on delete set null;
alter table public.fields add column if not exists cultivar_id uuid references public.cultivars(id) on delete set null;
alter table public.activity_plans add column if not exists activity_template_id uuid references public.activity_templates(id) on delete set null;
alter table public.activity_plans add column if not exists farmer_id uuid references public.farmers(id) on delete set null;
alter table public.activity_plans add column if not exists farm_id uuid references public.farms(id) on delete set null;
alter table public.activity_plans add column if not exists cultivar_id uuid references public.cultivars(id) on delete set null;

alter table public.farmers enable row level security; alter table public.farms enable row level security;
alter table public.cultivars enable row level security; alter table public.activity_templates enable row level security;
alter table public.activity_template_products enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where tablename='farmers' and policyname='farmers_own') then create policy farmers_own on public.farmers for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='farms' and policyname='farms_own') then create policy farms_own on public.farms for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='cultivars' and policyname='cultivars_own') then create policy cultivars_own on public.cultivars for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='activity_templates' and policyname='activity_templates_own') then create policy activity_templates_own on public.activity_templates for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='activity_template_products' and policyname='activity_template_products_own') then create policy activity_template_products_own on public.activity_template_products for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
end $$;

-- Confirming an actual is one database transaction: product changes, costs,
-- stock movements and the field activity either all succeed or all roll back.
create or replace function public.actualise_activity_plan_v2(
  p_plan_id uuid, p_actual_date date, p_lines jsonb, p_actual_notes text default null
) returns jsonb language plpgsql security invoker as $$
declare
  v_plan public.activity_plans%rowtype; v_line jsonb; v_product public.activity_plan_products%rowtype;
  v_item public.inventory_items%rowtype; v_rate numeric; v_qty numeric; v_cost numeric; v_total numeric := 0;
begin
  select * into v_plan from public.activity_plans where id=p_plan_id and user_id=auth.uid() for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_plan.status <> 'Planned' then raise exception 'This activity has already been actualised'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'At least one product is required'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_product from public.activity_plan_products
      where id=(v_line->>'id')::uuid and plan_id=p_plan_id and user_id=auth.uid() for update;
    if not found then raise exception 'Invalid product line'; end if;
    select * into v_item from public.inventory_items
      where id=(v_line->>'inventory_item_id')::uuid and user_id=auth.uid() for update;
    if not found then raise exception 'Inventory product not found'; end if;
    v_rate := (v_line->>'rate')::numeric; v_qty := v_rate * v_plan.planned_area_ha;
    if v_rate < 0 then raise exception 'Product rate cannot be negative'; end if;
    if v_item.quantity < v_qty then raise exception 'Not enough % in the Shed (need %, available %)',v_item.name,v_qty,v_item.quantity; end if;
    v_cost := v_item.unit_cost * v_qty; v_total := v_total + v_cost;
    update public.inventory_items set quantity=quantity-v_qty where id=v_item.id;
    insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes)
      values(auth.uid(),v_item.id,p_actual_date,'Stock Out',v_qty,v_item.unit_cost,'PLAN-'||left(p_plan_id::text,8),v_plan.activity_type||' · '||v_plan.field_name);
    update public.activity_plan_products set inventory_item_id=v_item.id,product_name=v_item.name,unit=v_item.unit,
      actual_rate_per_ha=v_rate,actual_quantity=v_qty,actual_unit_price=v_item.unit_cost,actual_cost=v_cost where id=v_product.id;
  end loop;
  update public.activity_plans set status='Actualised',actual_date=p_actual_date,actual_notes=p_actual_notes,
    actual_total=v_total,updated_at=now() where id=p_plan_id;
  insert into public.activities(user_id,activity_type,field_name,crop,date,area_ha,notes)
    values(auth.uid(),v_plan.activity_type,v_plan.field_name,v_plan.crop,p_actual_date,v_plan.planned_area_ha,
      'Actual · '||coalesce(p_actual_notes,'Confirmed from plan'));
  return jsonb_build_object('plan_id',p_plan_id,'actual_total',v_total);
end $$;
grant execute on function public.actualise_activity_plan_v2(uuid,date,jsonb,text) to authenticated;
