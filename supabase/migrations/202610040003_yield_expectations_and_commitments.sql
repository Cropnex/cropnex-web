-- AGCORE v6.10.0: seasonal yield expectations, forecast income and business commitments.

create table if not exists public.crop_yield_expectations(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 season text not null,crop text not null,expected_yield_t_ha numeric(12,3) not null check(expected_yield_t_ha>=0),
 notes text,updated_at timestamptz not null default now(),unique(user_id,season,crop)
);
alter table public.crop_yield_expectations enable row level security;
do $$ begin if not exists(select 1 from pg_policies where tablename='crop_yield_expectations' and policyname='crop_yield_expectations_access') then create policy crop_yield_expectations_access on public.crop_yield_expectations for all to authenticated using(public.can_access_farmer(user_id,'financial')) with check(public.can_access_farmer(user_id,'financial'));end if;end $$;

insert into public.crop_yield_expectations(user_id,season,crop,expected_yield_t_ha,notes)
select user_id,season,crop,max(target_yield_t_ha),'Carried forward from Crop Plans' from public.crop_plans where target_yield_t_ha>0 group by user_id,season,crop
on conflict(user_id,season,crop) do nothing;

alter table public.equipment add column if not exists installment_amount numeric(14,2);
alter table public.equipment add column if not exists installment_frequency text default 'Monthly';
alter table public.equipment add column if not exists finance_start_date date;
alter table public.equipment add column if not exists finance_term_seasons integer;
alter table public.equipment add column if not exists finance_notes text;

create table if not exists public.business_commitments(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,category text not null default 'Other',amount numeric(14,2) not null check(amount>=0),
 frequency text not null default 'Monthly' check(frequency in('Monthly','Quarterly','Annual','Per season','Once-off')),
 season text,start_date date,end_date date,active boolean not null default true,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.business_commitments enable row level security;
do $$ begin if not exists(select 1 from pg_policies where tablename='business_commitments' and policyname='business_commitments_access') then create policy business_commitments_access on public.business_commitments for all to authenticated using(public.can_access_farmer(user_id,'financial')) with check(public.can_access_farmer(user_id,'financial'));end if;end $$;

create or replace view public.crop_revenue_forecast with(security_invoker=true) as
with production as(
 select f.user_id,f.season,f.crop,sum(coalesce(f.area_ha,0)) area_ha,max(y.expected_yield_t_ha) expected_yield_t_ha,
 sum(coalesce(f.area_ha,0))*coalesce(max(y.expected_yield_t_ha),max(f.expected_yield),0) expected_tonnes
 from public.fields f
 left join lateral(select e.expected_yield_t_ha from public.crop_yield_expectations e where e.user_id=f.user_id and e.season=f.season and (lower(e.crop)=lower(f.crop) or (lower(f.crop) like '%maize%' and lower(e.crop) like '%maize%')) order by e.updated_at desc limit 1) y on true
 where f.crop is not null group by f.user_id,f.season,f.crop
)
select p.user_id,p.season,p.crop,p.expected_tonnes,
 least(p.expected_tonnes,coalesce(c.contract_tonnes,0))::numeric(14,3) contract_tonnes,
 greatest(p.expected_tonnes-coalesce(c.contract_tonnes,0),0)::numeric(14,3) estimated_tonnes,s.manual_price_per_tonne,
 (least(p.expected_tonnes,coalesce(c.contract_tonnes,0))*coalesce(c.contract_value/nullif(c.contract_tonnes,0),0)+greatest(p.expected_tonnes-coalesce(c.contract_tonnes,0),0)*coalesce(s.manual_price_per_tonne,0))::numeric(16,2) forecast_income,
 ((least(p.expected_tonnes,coalesce(c.contract_tonnes,0))*coalesce(c.contract_value/nullif(c.contract_tonnes,0),0)+greatest(p.expected_tonnes-coalesce(c.contract_tonnes,0),0)*coalesce(s.manual_price_per_tonne,0))/nullif(p.expected_tonnes,0))::numeric(14,2) weighted_price_per_tonne,
 p.area_ha,p.expected_yield_t_ha
from production p
left join lateral(select sum(gp.tonnes) contract_tonnes,sum(gp.tonnes*gp.price_per_tonne) contract_value from public.grain_positions gp where gp.user_id=p.user_id and gp.season=p.season and gp.status<>'Cancelled' and gp.price_per_tonne is not null and (lower(gp.commodity)=lower(p.crop) or (lower(p.crop) like '%maize%' and lower(gp.commodity) like '%maize%'))) c on true
left join lateral(select cps.manual_price_per_tonne from public.crop_price_scenarios cps where cps.user_id=p.user_id and cps.season=p.season and (lower(cps.crop)=lower(p.crop) or (lower(p.crop) like '%maize%' and lower(cps.crop) like '%maize%')) order by cps.updated_at desc limit 1) s on true;
grant select on public.crop_revenue_forecast to authenticated;

create or replace view public.field_performance_report with (security_invoker=true) as
with plan_costs as (
 select p.user_id,p.field_id,count(*) filter(where p.status<>'Cancelled') activity_count,
 coalesce(sum(case when p.status='Actualised' then coalesce(p.actual_total,0) else coalesce(p.planned_total,0) end) filter(where p.status<>'Cancelled'),0) operating_cost,
 coalesce(sum(p.planned_total) filter(where p.status='Planned'),0) remaining_planned_cost,
 coalesce(sum(p.actual_total) filter(where p.status='Actualised'),0) actualised_cost
 from public.activity_plans p group by p.user_id,p.field_id
),finance as(
 select user_id,field_id,coalesce(sum(amount) filter(where transaction_type='Income'),0) booked_income,coalesce(sum(amount) filter(where transaction_type='Expense'),0) additional_expenses
 from public.financial_transactions where field_id is not null group by user_id,field_id
)
select f.user_id,f.id field_id,f.farm_name,f.field_name,f.crop,f.cultivar,f.season,f.area_ha,coalesce(p.activity_count,0) activity_count,
 coalesce(p.operating_cost,0)::numeric(16,2) planning_cost,coalesce(p.remaining_planned_cost,0)::numeric(16,2) remaining_planned_cost,coalesce(p.actualised_cost,0)::numeric(16,2) actualised_cost,
 coalesce(fin.additional_expenses,0)::numeric(16,2) additional_expenses,(coalesce(p.operating_cost,0)+coalesce(fin.additional_expenses,0))::numeric(16,2) total_cost,
 coalesce(g.reconciled_tonnes,0)::numeric(14,3) harvested_tonnes,
 coalesce(case when f.harvest_status='Completed' then g.average_price_per_tonne else cf.weighted_price_per_tonne end,0)::numeric(14,2) average_price_per_tonne,
 coalesce(g.contract_tonnes,0)::numeric(14,3) contract_tonnes,coalesce(g.safex_tonnes,0)::numeric(14,3) safex_tonnes,coalesce(g.unpriced_tonnes,0)::numeric(14,3) unpriced_tonnes,
 (case when f.harvest_status='Completed' then coalesce(g.estimated_income,fin.booked_income,0) else greatest(coalesce(g.reconciled_tonnes,0),coalesce(f.area_ha,0)*coalesce(y.expected_yield_t_ha,f.expected_yield,0))*coalesce(cf.weighted_price_per_tonne,0) end)::numeric(16,2) projected_income,
 ((case when f.harvest_status='Completed' then coalesce(g.estimated_income,fin.booked_income,0) else greatest(coalesce(g.reconciled_tonnes,0),coalesce(f.area_ha,0)*coalesce(y.expected_yield_t_ha,f.expected_yield,0))*coalesce(cf.weighted_price_per_tonne,0) end)-coalesce(p.operating_cost,0)-coalesce(fin.additional_expenses,0))::numeric(16,2) projected_margin,
 (case when f.harvest_status='Completed' then coalesce(g.reconciled_tonnes,0) else greatest(coalesce(g.reconciled_tonnes,0),coalesce(f.area_ha,0)*coalesce(y.expected_yield_t_ha,f.expected_yield,0)) end)::numeric(14,3) projected_tonnes
from public.fields f left join plan_costs p on p.user_id=f.user_id and p.field_id=f.id left join finance fin on fin.user_id=f.user_id and fin.field_id=f.id
left join public.field_grain_value_summary g on g.user_id=f.user_id and g.field_id=f.id
left join lateral(select e.expected_yield_t_ha from public.crop_yield_expectations e where e.user_id=f.user_id and e.season=f.season and (lower(e.crop)=lower(f.crop) or (lower(f.crop) like '%maize%' and lower(e.crop) like '%maize%')) order by e.updated_at desc limit 1) y on true
left join public.crop_revenue_forecast cf on cf.user_id=f.user_id and cf.season=f.season and lower(cf.crop)=lower(f.crop);
grant select on public.field_performance_report to authenticated;

create or replace view public.business_commitment_summary with(security_invoker=true) as
select user_id,source,category,name,season,seasonal_amount from(
 select e.user_id,'Equipment finance'::text source,'Equipment finance'::text category,e.name,e.finance_start_date::text season,
  (coalesce(e.installment_amount,0)*case e.installment_frequency when 'Monthly' then 12 when 'Quarterly' then 4 when 'Annual' then 1 when 'Per season' then 1 else 1 end)::numeric(16,2) seasonal_amount
 from public.equipment e where coalesce(e.installment_amount,0)>0 and coalesce(e.finance_term_seasons,0)>0 and e.status not in('Sold','Inactive')
 union all
 select c.user_id,'General commitment',c.category,c.name,c.season,
  (c.amount*case c.frequency when 'Monthly' then 12 when 'Quarterly' then 4 when 'Annual' then 1 when 'Per season' then 1 when 'Once-off' then 1 end)::numeric(16,2)
 from public.business_commitments c where c.active
) rows;
grant select on public.business_commitment_summary to authenticated;
