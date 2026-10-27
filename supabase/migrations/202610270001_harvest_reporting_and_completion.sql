-- Combine manually entered harvests and reconciled transport allocations in one
-- field-level total. Transport-synced harvest_records are intentionally omitted
-- here because their allocation is already represented by transport pricing.
create or replace view public.field_grain_value_summary with (security_invoker=true) as
with transport as (
  select a.user_id,a.field_id,
    coalesce(sum(pa.priced_tonnes),0) tonnes,
    coalesce(sum(pa.priced_tonnes*pa.price_per_tonne),0) revenue,
    coalesce(sum(pa.priced_tonnes) filter(where pa.price_source='Contract'),0) contract_tonnes,
    coalesce(sum(pa.priced_tonnes) filter(where pa.price_source='SAFEX estimate'),0) safex_tonnes,
    coalesce(sum(pa.priced_tonnes) filter(where pa.price_source='Unpriced'),0) unpriced_tonnes
  from public.transport_load_allocations a
  join public.transport_loads l on l.id=a.load_id and l.status='Reconciled'
  left join public.transport_pricing_allocations pa on pa.transport_allocation_id=a.id
  group by a.user_id,a.field_id
), manual as (
  select h.user_id,h.field_id,sum(h.tonnes_harvested) tonnes,
    sum(h.tonnes_harvested*coalesce(h.price_per_tonne,0)) revenue,
    sum(h.tonnes_harvested) filter(where h.price_per_tonne is null) unpriced_tonnes
  from public.harvest_records h
  where h.transport_allocation_id is null and coalesce(h.source,'Manual')<>'Transport Log'
  group by h.user_id,h.field_id
)
select f.user_id,f.id field_id,f.farm_name,f.field_name,f.crop,f.cultivar,f.season,f.area_ha,f.harvest_status,
  (coalesce(t.tonnes,0)+coalesce(m.tonnes,0))::numeric(14,3) reconciled_tonnes,
  (coalesce(t.revenue,0)+coalesce(m.revenue,0))::numeric(16,2) estimated_income,
  ((coalesce(t.revenue,0)+coalesce(m.revenue,0))/nullif(coalesce(t.tonnes,0)+coalesce(m.tonnes,0),0))::numeric(14,2) average_price_per_tonne,
  coalesce(t.contract_tonnes,0)::numeric(14,3) contract_tonnes,
  coalesce(t.safex_tonnes,0)::numeric(14,3) safex_tonnes,
  (coalesce(t.unpriced_tonnes,0)+coalesce(m.unpriced_tonnes,0))::numeric(14,3) unpriced_tonnes
from public.fields f
left join transport t on t.user_id=f.user_id and t.field_id=f.id
left join manual m on m.user_id=f.user_id and m.field_id=f.id;
grant select on public.field_grain_value_summary to authenticated;

-- Report plan totals already include both product and operation lines. Using
-- those totals prevents product-free plans from appearing as separate R0 rows.
create or replace view public.activity_plan_report with (security_invoker=true) as
select p.user_id,p.id plan_id,p.farmer_name,p.farm_name,p.field_name,p.activity_type,p.crop,p.cultivar,p.season,
  p.planned_date,p.actual_date,p.planned_area_ha,p.status,
  coalesce(p.planned_total,0)::numeric(16,2) planned_cost,
  coalesce(p.actual_total,0)::numeric(16,2) actual_cost,
  coalesce(p.actual_total,0)-coalesce(p.planned_total,0) variance,
  count(pp.id) product_count
from public.activity_plans p left join public.activity_plan_products pp on pp.plan_id=p.id and pp.user_id=p.user_id
group by p.user_id,p.id;
grant select on public.activity_plan_report to authenticated;

create or replace view public.field_harvest_live_summary with (security_invoker=true) as
with finance as (
  select user_id,field_id,
    sum(amount) filter(where transaction_type='Income') booked_income,
    sum(amount) filter(where transaction_type='Expense') costs
  from public.financial_transactions where field_id is not null group by user_id,field_id
), loads as (
  select a.user_id,a.field_id,count(distinct l.id) reconciled_loads,max(l.load_date) latest_load
  from public.transport_load_allocations a join public.transport_loads l on l.id=a.load_id and l.status='Reconciled'
  group by a.user_id,a.field_id
)
select v.user_id,v.field_id,v.farm_name,v.field_name,v.crop,v.cultivar,v.season,v.area_ha,
  f.harvest_status,f.harvest_completed_at,v.reconciled_tonnes,coalesce(l.reconciled_loads,0) reconciled_loads,
  (v.reconciled_tonnes/nullif(v.area_ha,0))::numeric(14,3) yield_t_ha,
  coalesce(v.average_price_per_tonne,0)::numeric(14,2) market_price_per_tonne,
  coalesce(nullif(fin.booked_income,0),v.estimated_income,0)::numeric(16,2) projected_income,
  coalesce(fin.costs,0)::numeric(16,2) costs,
  (coalesce(nullif(fin.booked_income,0),v.estimated_income,0)-coalesce(fin.costs,0))::numeric(16,2) margin,
  l.latest_load,(f.harvest_status='Completed') finished,
  v.contract_tonnes,v.safex_tonnes,v.unpriced_tonnes,
  coalesce(r.remaining_planned_cost,0)::numeric(16,2) remaining_planned_cost,
  coalesce(r.actualised_cost,0)::numeric(16,2) actualised_cost
from public.field_grain_value_summary v
join public.fields f on f.id=v.field_id
left join finance fin on fin.user_id=v.user_id and fin.field_id=v.field_id
left join loads l on l.user_id=v.user_id and l.field_id=v.field_id
left join public.field_performance_report r on r.user_id=v.user_id and r.field_id=v.field_id;
grant select on public.field_harvest_live_summary to authenticated;

-- Harvest completion now works for manual records as well as reconciled loads.
create or replace function public.complete_transport_field_harvest(
  p_field_id uuid,p_completion_date date,p_notes text default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_field public.fields%rowtype;v_tonnes numeric:=0;v_plan_id uuid;v_activity_type text;
begin
  select * into v_field from public.fields where id=p_field_id for update;
  if not found or not public.can_access_farmer(v_field.user_id,'actualise') then raise exception 'Field not found or access denied'; end if;
  select coalesce(sum(h.tonnes_harvested),0) into v_tonnes
  from public.harvest_records h where h.field_id=p_field_id and h.user_id=v_field.user_id
    and coalesce(h.season,v_field.season)=v_field.season;
  if v_tonnes<=0 then raise exception 'Record harvest tonnes for this field before marking it complete'; end if;
  update public.fields set harvest_status='Completed',harvest_completed_at=p_completion_date where id=p_field_id;
  update public.transport_load_allocations set field_harvest_complete=true,completion_date=p_completion_date,updated_at=now()
    where field_id=p_field_id and user_id=v_field.user_id;
  select id,activity_type into v_plan_id,v_activity_type from public.activity_plans
    where field_id=p_field_id and user_id=v_field.user_id and status='Planned' and activity_type ilike '%harvest%'
    order by planned_date desc limit 1 for update;
  if v_plan_id is not null then
    update public.activity_plan_products set actual_rate_per_ha=coalesce(actual_rate_per_ha,planned_rate_per_ha),actual_quantity=coalesce(actual_quantity,planned_quantity),actual_unit_price=coalesce(actual_unit_price,planned_unit_price),actual_cost=coalesce(actual_cost,planned_cost) where plan_id=v_plan_id;
    update public.activity_plan_operations set actual_rate_per_ha=coalesce(actual_rate_per_ha,planned_rate_per_ha),actual_quantity=coalesce(actual_quantity,planned_quantity),actual_unit_price=coalesce(actual_unit_price,planned_unit_price),actual_cost=coalesce(actual_cost,planned_cost) where plan_id=v_plan_id;
    update public.activity_plans set status='Actualised',actual_date=p_completion_date,actual_total=planned_total,
      actual_notes=concat('Harvest completed · ',round(v_tonnes,3),' t',case when p_notes is not null then ' · '||p_notes else '' end),updated_at=now()
      where id=v_plan_id;
  end if;
  if not exists(select 1 from public.activities a where a.user_id=v_field.user_id and a.field_name=v_field.field_name
      and a.date=p_completion_date and a.activity_type ilike '%harvest%') then
    insert into public.activities(user_id,activity_type,field_name,crop,date,area_ha,notes)
      values(v_field.user_id,coalesce(v_activity_type,'Harvesting'),v_field.field_name,v_field.crop,p_completion_date,v_field.area_ha,
        concat(round(v_tonnes,3),' t harvested · ',round(v_tonnes/nullif(v_field.area_ha,0),3),' t/ha',case when p_notes is not null then ' · '||p_notes else '' end));
  end if;
  return jsonb_build_object('field_id',p_field_id,'tonnes',v_tonnes,'yield_per_ha',v_tonnes/nullif(v_field.area_ha,0),'actualised_plan_id',v_plan_id);
end $$;
grant execute on function public.complete_transport_field_harvest(uuid,date,text) to authenticated;
