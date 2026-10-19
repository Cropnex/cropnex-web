-- AGCORE v3.2: field planning, product budgets and transactional actualisation.
-- Additive only. Existing operational tables and data are not changed.

create table if not exists public.activity_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete restrict,
  farmer_name text not null,
  farm_name text not null,
  field_name text not null,
  activity_type text not null,
  crop text,
  cultivar text,
  season text not null,
  planned_date date not null,
  planned_area_ha numeric(12,3) not null check (planned_area_ha > 0),
  status text not null default 'Planned' check (status in ('Planned','Actualised','Cancelled')),
  notes text,
  planned_total numeric(16,2) not null default 0,
  actual_date date,
  actual_total numeric(16,2) not null default 0,
  actual_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_plan_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.activity_plans(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  product_name text not null,
  unit text not null,
  planned_rate_per_ha numeric(14,4) not null check (planned_rate_per_ha >= 0),
  planned_quantity numeric(14,4) not null check (planned_quantity >= 0),
  planned_unit_price numeric(14,4) not null default 0 check (planned_unit_price >= 0),
  planned_cost numeric(16,2) not null default 0,
  actual_rate_per_ha numeric(14,4),
  actual_quantity numeric(14,4),
  actual_unit_price numeric(14,4),
  actual_cost numeric(16,2),
  created_at timestamptz not null default now()
);

create index if not exists activity_plans_field_season_idx on public.activity_plans(field_id, season, planned_date);
create index if not exists activity_plans_user_status_idx on public.activity_plans(user_id, status);
create index if not exists activity_plan_products_plan_idx on public.activity_plan_products(plan_id);

alter table public.activity_plans enable row level security;
alter table public.activity_plan_products enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='activity_plans' and policyname='activity_plans_own_rows') then
    create policy activity_plans_own_rows on public.activity_plans for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='activity_plan_products' and policyname='activity_plan_products_own_rows') then
    create policy activity_plan_products_own_rows on public.activity_plan_products for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
end $$;

create or replace function public.actualise_activity_plan(
  p_plan_id uuid,
  p_actual_date date,
  p_actual_notes text default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  v_plan public.activity_plans%rowtype;
  v_product public.activity_plan_products%rowtype;
  v_stock public.inventory_items%rowtype;
  v_quantity numeric;
  v_price numeric;
  v_cost numeric;
  v_total numeric := 0;
begin
  select * into v_plan from public.activity_plans where id=p_plan_id and user_id=auth.uid() for update;
  if not found then raise exception 'Plan not found or access denied'; end if;
  if v_plan.status <> 'Planned' then raise exception 'Only planned activities can be actualised'; end if;

  for v_product in select * from public.activity_plan_products where plan_id=p_plan_id and user_id=auth.uid() for update loop
    select * into v_stock from public.inventory_items where id=v_product.inventory_item_id and user_id=auth.uid() for update;
    if not found then raise exception 'Inventory product % was not found', v_product.product_name; end if;
    v_quantity := coalesce(v_product.actual_rate_per_ha, v_product.planned_rate_per_ha) * v_plan.planned_area_ha;
    if v_stock.quantity < v_quantity then raise exception 'Not enough % in the Shed. Required %, available %', v_product.product_name, v_quantity, v_stock.quantity; end if;
    v_price := coalesce(v_stock.unit_cost, v_product.planned_unit_price, 0);
    v_cost := round(v_quantity * v_price, 2);
    update public.inventory_items set quantity=quantity-v_quantity where id=v_stock.id;
    insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes)
      values(auth.uid(),v_stock.id,p_actual_date,'Stock Out',v_quantity,v_price,'PLAN-'||left(p_plan_id::text,8),v_plan.field_name||' · '||v_plan.activity_type);
    update public.activity_plan_products set actual_rate_per_ha=coalesce(actual_rate_per_ha,planned_rate_per_ha),actual_quantity=v_quantity,actual_unit_price=v_price,actual_cost=v_cost where id=v_product.id;
    v_total := v_total+v_cost;
  end loop;

  insert into public.activities(user_id,activity_type,field_name,crop,date,area_ha,notes)
    values(auth.uid(),v_plan.activity_type,v_plan.field_name,v_plan.crop,p_actual_date,v_plan.planned_area_ha,'Actual · Plan '||left(p_plan_id::text,8)||coalesce(' · '||p_actual_notes,''));
  update public.activity_plans set status='Actualised',actual_date=p_actual_date,actual_total=v_total,actual_notes=p_actual_notes,updated_at=now() where id=p_plan_id;
  return jsonb_build_object('plan_id',p_plan_id,'actual_total',v_total,'status','Actualised');
end $$;

grant execute on function public.actualise_activity_plan(uuid,date,text) to authenticated;

create or replace view public.activity_plan_report with (security_invoker=true) as
select p.user_id,p.id plan_id,p.farmer_name,p.farm_name,p.field_name,p.activity_type,p.crop,p.cultivar,p.season,p.planned_date,p.actual_date,p.planned_area_ha,p.status,
       coalesce(sum(pp.planned_cost),0)::numeric(16,2) planned_cost,
       coalesce(sum(pp.actual_cost),0)::numeric(16,2) actual_cost,
       coalesce(sum(pp.actual_cost),0)-coalesce(sum(pp.planned_cost),0) variance,
       count(pp.id) product_count
from public.activity_plans p left join public.activity_plan_products pp on pp.plan_id=p.id
group by p.user_id,p.id;

grant select on public.activity_plan_report to authenticated;
