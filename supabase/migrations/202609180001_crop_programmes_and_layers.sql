-- AGCORE v3.4 crop programmes, costed operations and spatial layer imports.
-- Additive only: no existing tables or records are removed or rewritten.

create table if not exists public.standard_operations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, category text not null default 'Contractor', unit text not null default 'ha',
  unit_cost numeric(14,2) not null default 0 check(unit_cost >= 0), supplier text,
  active boolean not null default true, created_at timestamptz not null default now(), unique(user_id,name)
);
create table if not exists public.crop_templates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, crop text not null, season text, description text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,name)
);
create table if not exists public.crop_template_activities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  crop_template_id uuid not null references public.crop_templates(id) on delete cascade,
  activity_template_id uuid references public.activity_templates(id) on delete set null,
  name text not null, category text not null, sequence_no integer not null default 1,
  days_after_planting integer not null default 0, notes text, created_at timestamptz not null default now()
);
create table if not exists public.crop_template_lines (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  template_activity_id uuid not null references public.crop_template_activities(id) on delete cascade,
  line_type text not null check(line_type in ('Product','Operation')),
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  operation_id uuid references public.standard_operations(id) on delete restrict,
  item_name text not null, unit text not null, rate_per_ha numeric(14,4) not null default 0 check(rate_per_ha >= 0),
  created_at timestamptz not null default now(),
  check((line_type='Product' and inventory_item_id is not null and operation_id is null) or
        (line_type='Operation' and operation_id is not null and inventory_item_id is null))
);
create table if not exists public.activity_plan_operations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.activity_plans(id) on delete cascade,
  operation_id uuid references public.standard_operations(id) on delete set null,
  operation_name text not null, unit text not null, planned_rate_per_ha numeric(14,4) not null,
  planned_quantity numeric(14,4) not null, planned_unit_price numeric(14,2) not null,
  planned_cost numeric(14,2) not null, actual_rate_per_ha numeric(14,4), actual_quantity numeric(14,4),
  actual_unit_price numeric(14,2), actual_cost numeric(14,2), created_at timestamptz not null default now()
);
create table if not exists public.map_layers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  field_id uuid references public.fields(id) on delete set null, farmer_name text, farm_name text, field_name text,
  season text, layer_type text not null, source text not null default 'File upload', captured_date date,
  file_name text not null, storage_path text not null, file_format text, status text not null default 'Uploaded',
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.activity_plans add column if not exists crop_template_id uuid references public.crop_templates(id) on delete set null;
alter table public.activity_plans add column if not exists template_activity_id uuid references public.crop_template_activities(id) on delete set null;

alter table public.standard_operations enable row level security;
alter table public.crop_templates enable row level security;
alter table public.crop_template_activities enable row level security;
alter table public.crop_template_lines enable row level security;
alter table public.activity_plan_operations enable row level security;
alter table public.map_layers enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where tablename='standard_operations' and policyname='standard_operations_own') then create policy standard_operations_own on public.standard_operations for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='crop_templates' and policyname='crop_templates_own') then create policy crop_templates_own on public.crop_templates for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='crop_template_activities' and policyname='crop_template_activities_own') then create policy crop_template_activities_own on public.crop_template_activities for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='crop_template_lines' and policyname='crop_template_lines_own') then create policy crop_template_lines_own on public.crop_template_lines for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='activity_plan_operations' and policyname='activity_plan_operations_own') then create policy activity_plan_operations_own on public.activity_plan_operations for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
  if not exists(select 1 from pg_policies where tablename='map_layers' and policyname='map_layers_own') then create policy map_layers_own on public.map_layers for all using(auth.uid()=user_id) with check(auth.uid()=user_id); end if;
end $$;

insert into storage.buckets(id,name,public) values('agcore-layers','agcore-layers',false) on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agcore_layers_select') then create policy agcore_layers_select on storage.objects for select to authenticated using(bucket_id='agcore-layers' and (storage.foldername(name))[1]=auth.uid()::text); end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agcore_layers_insert') then create policy agcore_layers_insert on storage.objects for insert to authenticated with check(bucket_id='agcore-layers' and (storage.foldername(name))[1]=auth.uid()::text); end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agcore_layers_delete') then create policy agcore_layers_delete on storage.objects for delete to authenticated using(bucket_id='agcore-layers' and (storage.foldername(name))[1]=auth.uid()::text); end if;
end $$;

create index if not exists crop_template_activities_template_idx on public.crop_template_activities(crop_template_id,sequence_no);
create index if not exists crop_template_lines_activity_idx on public.crop_template_lines(template_activity_id);
create index if not exists activity_plan_operations_plan_idx on public.activity_plan_operations(plan_id);
create index if not exists map_layers_field_idx on public.map_layers(field_id,season,layer_type);

-- v3.4 actualisation also carries non-stock operations into actual cost.
create or replace function public.actualise_activity_plan_v2(
  p_plan_id uuid, p_actual_date date, p_lines jsonb, p_actual_notes text default null
) returns jsonb language plpgsql security invoker as $$
declare
  v_plan public.activity_plans%rowtype; v_line jsonb; v_product public.activity_plan_products%rowtype;
  v_item public.inventory_items%rowtype; v_operation public.activity_plan_operations%rowtype;
  v_rate numeric; v_qty numeric; v_cost numeric; v_total numeric := 0;
begin
  select * into v_plan from public.activity_plans where id=p_plan_id and user_id=auth.uid() for update;
  if not found then raise exception 'Plan not found'; end if;
  if v_plan.status <> 'Planned' then raise exception 'This activity has already been actualised'; end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    select * into v_product from public.activity_plan_products where id=(v_line->>'id')::uuid and plan_id=p_plan_id and user_id=auth.uid() for update;
    if not found then raise exception 'Invalid product line'; end if;
    select * into v_item from public.inventory_items where id=(v_line->>'inventory_item_id')::uuid and user_id=auth.uid() for update;
    if not found then raise exception 'Inventory product not found'; end if;
    v_rate := (v_line->>'rate')::numeric; v_qty := v_rate*v_plan.planned_area_ha;
    if v_rate<0 then raise exception 'Product rate cannot be negative'; end if;
    if v_item.quantity<v_qty then raise exception 'Not enough % in the Shed (need %, available %)',v_item.name,v_qty,v_item.quantity; end if;
    v_cost := round(v_item.unit_cost*v_qty,2); v_total := v_total+v_cost;
    update public.inventory_items set quantity=quantity-v_qty where id=v_item.id;
    insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes)
      values(auth.uid(),v_item.id,p_actual_date,'Stock Out',v_qty,v_item.unit_cost,'PLAN-'||left(p_plan_id::text,8),v_plan.activity_type||' · '||v_plan.field_name);
    update public.activity_plan_products set inventory_item_id=v_item.id,product_name=v_item.name,unit=v_item.unit,
      actual_rate_per_ha=v_rate,actual_quantity=v_qty,actual_unit_price=v_item.unit_cost,actual_cost=v_cost where id=v_product.id;
  end loop;
  for v_operation in select * from public.activity_plan_operations where plan_id=p_plan_id and user_id=auth.uid() for update loop
    v_qty := v_operation.planned_rate_per_ha*v_plan.planned_area_ha;
    v_cost := round(v_qty*v_operation.planned_unit_price,2); v_total := v_total+v_cost;
    update public.activity_plan_operations set actual_rate_per_ha=planned_rate_per_ha,actual_quantity=v_qty,
      actual_unit_price=planned_unit_price,actual_cost=v_cost where id=v_operation.id;
  end loop;
  update public.activity_plans set status='Actualised',actual_date=p_actual_date,actual_notes=p_actual_notes,actual_total=v_total,updated_at=now() where id=p_plan_id;
  insert into public.activities(user_id,activity_type,field_name,crop,date,area_ha,notes)
    values(auth.uid(),v_plan.activity_type,v_plan.field_name,v_plan.crop,p_actual_date,v_plan.planned_area_ha,'Actual · '||coalesce(p_actual_notes,'Confirmed from plan'));
  return jsonb_build_object('plan_id',p_plan_id,'actual_total',v_total,'status','Actualised');
end $$;
grant execute on function public.actualise_activity_plan_v2(uuid,date,jsonb,text) to authenticated;
