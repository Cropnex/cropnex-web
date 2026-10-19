-- AGCORE v6.9.1: one field-level source of truth for projected income, costs and margin.

create or replace view public.field_performance_report with (security_invoker=true) as
with plan_costs as (
  select p.user_id,p.field_id,
    count(*) filter(where p.status<>'Cancelled') activity_count,
    coalesce(sum(case when p.status='Actualised' then coalesce(p.actual_total,0) else coalesce(p.planned_total,0) end) filter(where p.status<>'Cancelled'),0) operating_cost,
    coalesce(sum(p.planned_total) filter(where p.status='Planned'),0) remaining_planned_cost,
    coalesce(sum(p.actual_total) filter(where p.status='Actualised'),0) actualised_cost
  from public.activity_plans p group by p.user_id,p.field_id
), finance as (
  select t.user_id,t.field_id,
    coalesce(sum(t.amount) filter(where t.transaction_type='Income'),0) booked_income,
    coalesce(sum(t.amount) filter(where t.transaction_type='Expense'),0) additional_expenses
  from public.financial_transactions t where t.field_id is not null group by t.user_id,t.field_id
)
select f.user_id,f.id field_id,f.farm_name,f.field_name,f.crop,f.cultivar,f.season,f.area_ha,
  coalesce(p.activity_count,0) activity_count,
  coalesce(p.operating_cost,0)::numeric(16,2) planning_cost,
  coalesce(p.remaining_planned_cost,0)::numeric(16,2) remaining_planned_cost,
  coalesce(p.actualised_cost,0)::numeric(16,2) actualised_cost,
  coalesce(fin.additional_expenses,0)::numeric(16,2) additional_expenses,
  (coalesce(p.operating_cost,0)+coalesce(fin.additional_expenses,0))::numeric(16,2) total_cost,
  coalesce(g.reconciled_tonnes,0)::numeric(14,3) harvested_tonnes,
  coalesce(g.average_price_per_tonne,0)::numeric(14,2) average_price_per_tonne,
  coalesce(g.contract_tonnes,0)::numeric(14,3) contract_tonnes,
  coalesce(g.safex_tonnes,0)::numeric(14,3) safex_tonnes,
  coalesce(g.unpriced_tonnes,0)::numeric(14,3) unpriced_tonnes,
  (case when coalesce(g.reconciled_tonnes,0)>0 then coalesce(g.estimated_income,0) else coalesce(fin.booked_income,0) end)::numeric(16,2) projected_income,
  ((case when coalesce(g.reconciled_tonnes,0)>0 then coalesce(g.estimated_income,0) else coalesce(fin.booked_income,0) end)-coalesce(p.operating_cost,0)-coalesce(fin.additional_expenses,0))::numeric(16,2) projected_margin
from public.fields f
left join plan_costs p on p.user_id=f.user_id and p.field_id=f.id
left join finance fin on fin.user_id=f.user_id and fin.field_id=f.id
left join public.field_grain_value_summary g on g.user_id=f.user_id and g.field_id=f.id;
grant select on public.field_performance_report to authenticated;

create or replace view public.field_harvest_live_summary with(security_invoker=true) as
with loads as(select a.field_id,count(distinct l.id) reconciled_loads,max(l.load_date) latest_load from public.transport_load_allocations a join public.transport_loads l on l.id=a.load_id and l.status='Reconciled' group by a.field_id)
select r.user_id,r.field_id,r.farm_name,r.field_name,r.crop,r.cultivar,r.season,r.area_ha,f.harvest_status,f.harvest_completed_at,
 r.harvested_tonnes reconciled_tonnes,coalesce(l.reconciled_loads,0) reconciled_loads,(r.harvested_tonnes/nullif(r.area_ha,0))::numeric(14,3) yield_t_ha,
 r.average_price_per_tonne market_price_per_tonne,r.projected_income,r.total_cost costs,r.projected_margin margin,l.latest_load,(f.harvest_status='Completed') finished,
 r.contract_tonnes,r.safex_tonnes,r.unpriced_tonnes,r.remaining_planned_cost,r.actualised_cost
from public.field_performance_report r join public.fields f on f.id=r.field_id left join loads l on l.field_id=r.field_id;
grant select on public.field_harvest_live_summary to authenticated;
