-- CropNex v6.42.0: report reconciliation and atomic manual harvest capture.
begin;
alter table public.financial_transactions add column if not exists season text;
alter table public.financial_transactions add column if not exists commitment_source_id uuid;
alter table public.financial_transactions add column if not exists commitment_source_type text;
alter table public.activities add column if not exists field_id uuid references public.fields(id);
alter table public.harvest_records add column if not exists client_request_id uuid;
alter table public.harvest_records add column if not exists client_request_payload jsonb;
create unique index if not exists harvest_client_request_unique on public.harvest_records(user_id,client_request_id) where client_request_id is not null;
-- Only unambiguous field-linked history is assigned automatically.
update public.financial_transactions t set season=f.season from public.fields f where t.field_id=f.id and t.user_id=f.user_id and t.season is null;
create or replace function public.validate_financial_field_season() returns trigger language plpgsql set search_path=public as $$
declare f public.fields%rowtype;
begin
 if new.commitment_source_id is not null then
  if new.transaction_type<>'Expense' then raise exception 'Only expense payments may be linked to a commitment'; end if;
  if new.commitment_source_type='General commitment' then
   if not exists(select 1 from public.business_commitments c where c.id=new.commitment_source_id and c.user_id=new.user_id) then raise exception 'Choose a commitment for the same farming account';end if;
  elsif new.commitment_source_type='Equipment finance' then
   if not exists(select 1 from public.equipment e where e.id=new.commitment_source_id and e.user_id=new.user_id) then raise exception 'Choose equipment finance for the same farming account';end if;
  else raise exception 'Invalid commitment source';end if;
 elsif new.commitment_source_type is not null then raise exception 'Choose a commitment source record';end if;
 if new.field_id is not null then
  select * into f from public.fields where id=new.field_id;
  if not found or f.user_id<>new.user_id then raise exception 'Transaction field must belong to the same farming account'; end if;
  if new.season is not null and new.season is distinct from f.season then raise exception 'Transaction season must match its field'; end if;
  new.season:=f.season;
 end if;
 return new;
end $$;
drop trigger if exists financial_field_season on public.financial_transactions;
create trigger financial_field_season before insert or update of field_id,user_id,season,commitment_source_id,commitment_source_type,transaction_type on public.financial_transactions for each row execute function public.validate_financial_field_season();

-- Completion marks the field, not an unconfirmed activity or unposted stock usage.
create or replace function public.complete_transport_field_harvest(p_field_id uuid,p_completion_date date,p_notes text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare f public.fields%rowtype; v_tonnes numeric;
begin
 select * into f from public.fields where id=p_field_id for update;
 if not found or not public.can_edit_farmer(f.user_id,'harvest') then raise exception 'Harvest editing access required'; end if;
 if p_completion_date is null then raise exception 'Choose a completion date'; end if;
 select reconciled_tonnes into v_tonnes from public.field_grain_value_summary where field_id=p_field_id and user_id=f.user_id;
 if coalesce(v_tonnes,0)<=0 then raise exception 'Record or reconcile harvest tonnes before marking this field complete'; end if;
 update public.fields set harvest_status='Completed',harvest_completed_at=p_completion_date where id=p_field_id;
 update public.transport_load_allocations set field_harvest_complete=true,completion_date=p_completion_date,updated_at=now() where field_id=p_field_id and user_id=f.user_id;
 return jsonb_build_object('field_id',p_field_id,'tonnes',v_tonnes,'yield_per_ha',v_tonnes/nullif(f.area_ha,0),'actualised_plan_id',null,'message','Field complete. Confirm harvesting activity and stock usage separately in Actuals.');
end $$;

create or replace function public.save_manual_harvest(p_request uuid,p_field uuid,p_date date,p_details jsonb,p_complete boolean default false)
returns uuid language plpgsql security invoker set search_path=public as $$
declare f public.fields%rowtype; v_id uuid; v_existing public.harvest_records%rowtype; v_payload jsonb;
 v_tonnes numeric; v_price numeric; v_transport numeric; v_other numeric; v_moisture numeric;
begin
 select * into f from public.fields where id=p_field for share;
 if not found or not public.can_edit_farmer(f.user_id,'harvest') then raise exception 'Harvest editing access required'; end if;
 if p_request is null or p_date is null then raise exception 'Choose a harvest date and a valid request'; end if;
 v_payload:=jsonb_build_object('field',p_field,'date',p_date,'details',p_details,'complete',p_complete);
 perform pg_advisory_xact_lock(hashtextextended(f.user_id::text||p_request::text,0));
 select * into v_existing from public.harvest_records where user_id=f.user_id and client_request_id=p_request;
 if found then
  if v_existing.client_request_payload is distinct from v_payload then raise exception 'This save key belongs to different harvest details. Start a new capture.'; end if;
  return v_existing.id;
 end if;
 v_tonnes:=(p_details->>'tonnes')::numeric;v_price:=nullif(p_details->>'price','')::numeric;
 v_transport:=coalesce((p_details->>'transport_cost')::numeric,0);v_other:=coalesce((p_details->>'other_cost')::numeric,0);v_moisture:=nullif(p_details->>'moisture','')::numeric;
 if v_tonnes is null or v_tonnes<=0 or v_tonnes::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter valid positive tonnes'; end if;
 if (v_price is not null and (v_price<0 or v_price::text in ('NaN','Infinity','-Infinity'))) or v_transport<0 or v_other<0 or v_transport::text in ('NaN','Infinity','-Infinity') or v_other::text in ('NaN','Infinity','-Infinity') then raise exception 'Prices and costs must be finite and nonnegative'; end if;
 if v_moisture is not null and (v_moisture<0 or v_moisture>100 or v_moisture::text in ('NaN','Infinity','-Infinity')) then raise exception 'Moisture must be between 0 and 100'; end if;
 insert into public.harvest_records(user_id,field_id,harvest_date,crop,season,area_ha,tonnes_harvested,moisture_percent,quality_grade,destination_type,destination_name,price_per_tonne,transport_cost,other_cost,notes,source,client_request_id,client_request_payload)
 values(f.user_id,f.id,p_date,f.crop,f.season,f.area_ha,v_tonnes,v_moisture,nullif(p_details->>'grade',''),coalesce(nullif(p_details->>'destination_type',''),'Buyer'),nullif(p_details->>'destination',''),v_price,v_transport,v_other,nullif(p_details->>'notes',''),'Manual',p_request,v_payload) returning id into v_id;
 insert into public.activities(user_id,field_id,field_name,crop,season,activity_type,date,area_ha,notes)
 values(f.user_id,f.id,f.field_name,f.crop,f.season,'Harvesting',p_date,f.area_ha,concat(v_tonnes,' t harvested. Record ',v_id));
 if v_price is not null then
  insert into public.financial_transactions(user_id,field_id,season,transaction_date,transaction_type,category,description,quantity,unit,unit_price,amount,supplier_or_customer,reference,notes)
  values(f.user_id,f.id,f.season,p_date,'Income','Crop Sale',concat(f.crop,' harvest - ',f.field_name),v_tonnes,'t',v_price,round(v_tonnes*v_price,2),nullif(p_details->>'destination',''),'HARVEST-'||v_id,p_details->>'notes');
 end if;
 if v_transport+v_other>0 then
  insert into public.financial_transactions(user_id,field_id,season,transaction_date,transaction_type,category,description,quantity,unit,unit_price,amount,reference,notes)
  values(f.user_id,f.id,f.season,p_date,'Expense','Harvest',concat('Harvest and transport costs - ',f.field_name),v_tonnes,'t',(v_transport+v_other)/v_tonnes,round(v_transport+v_other,2),'HARVEST-'||v_id,p_details->>'notes');
 end if;
 if p_complete then perform public.complete_transport_field_harvest(f.id,p_date,p_details->>'notes');end if;
 return v_id;
end $$;
revoke all on function public.save_manual_harvest(uuid,uuid,date,jsonb,boolean) from public,anon;
grant execute on function public.save_manual_harvest(uuid,uuid,date,jsonb,boolean) to authenticated;
revoke all on function public.validate_financial_field_season() from public,anon;

-- Updated view definitions follow, retaining existing column types and order.

create or replace view public.field_grain_value_summary with (security_invoker=true) as
with transport as (
  select a.user_id,a.field_id,
    coalesce(sum(a.allocated_tonnes),0) tonnes,
    coalesce(sum(pa.revenue),0) revenue,
    coalesce(sum(pa.contract_tonnes),0) contract_tonnes,
    coalesce(sum(pa.safex_tonnes),0) safex_tonnes,
    coalesce(sum(greatest(a.allocated_tonnes-coalesce(pa.priced_tonnes,0),0)+coalesce(pa.unpriced_tonnes,0)),0) unpriced_tonnes
  from public.transport_load_allocations a
  join public.transport_loads l on l.id=a.load_id and l.status='Reconciled'
  left join lateral (
 select sum(x.priced_tonnes) priced_tonnes,
 sum(x.priced_tonnes*x.price_per_tonne) revenue,
 sum(x.priced_tonnes) filter(where x.price_source='Contract') contract_tonnes,
 sum(x.priced_tonnes) filter(where x.price_source='SAFEX estimate') safex_tonnes,
 sum(x.priced_tonnes) filter(where x.price_source='Unpriced') unpriced_tonnes
 from public.transport_pricing_allocations x where x.transport_allocation_id=a.id and x.user_id=a.user_id
 ) pa on true
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


create or replace view public.activity_plan_report with (security_invoker=true) as
select p.user_id,p.id plan_id,p.farmer_name,p.farm_name,p.field_name,p.activity_type,p.crop,p.cultivar,p.season,
  p.planned_date,p.actual_date,p.planned_area_ha,p.status,
  coalesce(p.planned_total,0)::numeric(16,2) planned_cost,
  coalesce(p.actual_total,0)::numeric(16,2) actual_cost,
  coalesce(p.actual_total,0)-coalesce(p.planned_total,0) variance,
  count(pp.id) product_count, p.field_id
from public.activity_plans p left join public.activity_plan_products pp on pp.plan_id=p.id and pp.user_id=p.user_id
group by p.user_id,p.id;
grant select on public.activity_plan_report to authenticated;


create or replace view public.field_performance_report with (security_invoker=true) as
with plan_costs as (
 select p.user_id,p.field_id,count(*) filter(where p.status<>'Cancelled') activity_count,
 coalesce(sum(case when p.status='Actualised' then coalesce(p.actual_total,0) else coalesce(p.planned_total,0) end) filter(where p.status<>'Cancelled'),0) operating_cost,
 coalesce(sum(p.planned_total) filter(where p.status='Planned'),0) remaining_planned_cost,
 coalesce(sum(p.actual_total) filter(where p.status='Actualised'),0) actualised_cost
 from public.activity_plans p group by p.user_id,p.field_id
),finance as(
 select user_id,field_id,coalesce(sum(amount) filter(where transaction_type='Income' and category='Crop Sale'),0) booked_income,coalesce(sum(amount) filter(where transaction_type='Income' and category<>'Crop Sale'),0) other_income,coalesce(sum(amount) filter(where transaction_type='Expense'),0) additional_expenses
 from public.financial_transactions where field_id is not null group by user_id,field_id
)
select f.user_id,f.id field_id,f.farm_name,f.field_name,f.crop,f.cultivar,f.season,f.area_ha,coalesce(p.activity_count,0) activity_count,
 coalesce(p.operating_cost,0)::numeric(16,2) planning_cost,coalesce(p.remaining_planned_cost,0)::numeric(16,2) remaining_planned_cost,coalesce(p.actualised_cost,0)::numeric(16,2) actualised_cost,
 coalesce(fin.additional_expenses,0)::numeric(16,2) additional_expenses,(coalesce(p.operating_cost,0)+coalesce(fin.additional_expenses,0))::numeric(16,2) total_cost,
 coalesce(g.reconciled_tonnes,0)::numeric(14,3) harvested_tonnes,
 coalesce(case when f.harvest_status='Completed' then g.average_price_per_tonne else cf.weighted_price_per_tonne end,0)::numeric(14,2) average_price_per_tonne,
 coalesce(g.contract_tonnes,0)::numeric(14,3) contract_tonnes,coalesce(g.safex_tonnes,0)::numeric(14,3) safex_tonnes,coalesce(g.unpriced_tonnes,0)::numeric(14,3) unpriced_tonnes,
 (case when f.harvest_status='Completed' then greatest(coalesce(g.estimated_income,0),coalesce(fin.booked_income,0)) else greatest(coalesce(g.estimated_income,0),coalesce(fin.booked_income,0),greatest(coalesce(g.reconciled_tonnes,0),coalesce(f.area_ha,0)*coalesce(y.expected_yield_t_ha,f.expected_yield,0))*coalesce(cf.weighted_price_per_tonne,0)) end+coalesce(fin.other_income,0))::numeric(16,2) projected_income,
 ((case when f.harvest_status='Completed' then greatest(coalesce(g.estimated_income,0),coalesce(fin.booked_income,0)) else greatest(coalesce(g.estimated_income,0),coalesce(fin.booked_income,0),greatest(coalesce(g.reconciled_tonnes,0),coalesce(f.area_ha,0)*coalesce(y.expected_yield_t_ha,f.expected_yield,0))*coalesce(cf.weighted_price_per_tonne,0)) end)+coalesce(fin.other_income,0)-coalesce(p.operating_cost,0)-coalesce(fin.additional_expenses,0))::numeric(16,2) projected_margin,
 (case when f.harvest_status='Completed' then coalesce(g.reconciled_tonnes,0) else greatest(coalesce(g.reconciled_tonnes,0),coalesce(f.area_ha,0)*coalesce(y.expected_yield_t_ha,f.expected_yield,0)) end)::numeric(14,3) projected_tonnes
from public.fields f left join plan_costs p on p.user_id=f.user_id and p.field_id=f.id left join finance fin on fin.user_id=f.user_id and fin.field_id=f.id
left join public.field_grain_value_summary g on g.user_id=f.user_id and g.field_id=f.id
left join lateral(select e.expected_yield_t_ha from public.crop_yield_expectations e where e.user_id=f.user_id and e.season=f.season and (lower(e.crop)=lower(f.crop) or (lower(f.crop) like '%maize%' and lower(e.crop) like '%maize%')) order by e.updated_at desc limit 1) y on true
left join public.crop_revenue_forecast cf on cf.user_id=f.user_id and cf.season=f.season and lower(cf.crop)=lower(f.crop);
grant select on public.field_performance_report to authenticated;


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
  coalesce(r.projected_income,0)::numeric(16,2) projected_income,
  coalesce(r.total_cost,0)::numeric(16,2) costs,
  (coalesce(r.projected_income,0)-coalesce(r.total_cost,0))::numeric(16,2) margin,
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


create or replace view public.business_commitment_summary with(security_invoker=true) as
select e.user_id,'Equipment finance'::text source,'Equipment finance'::text category,e.name,e.finance_start_date::text season,
(coalesce(e.installment_amount,0)*case e.installment_frequency when 'Monthly' then 12 when 'Quarterly' then 4 else 1 end)::numeric(16,2) seasonal_amount,
e.finance_start_date,e.finance_term_seasons,null::date start_date,null::date end_date,e.id source_id
from public.equipment e where coalesce(e.installment_amount,0)>0 and coalesce(e.finance_term_seasons,0)>0 and e.status not in ('Sold','Inactive')
union all
select c.user_id,'General commitment',c.category,c.name,c.season,
(c.amount*case c.frequency when 'Monthly' then 12 when 'Quarterly' then 4 else 1 end)::numeric(16,2),
null::date,null::integer,c.start_date,c.end_date,c.id from public.business_commitments c where c.active;
grant select on public.business_commitment_summary to authenticated;

-- CropNex: actualise planned work even when shed stock is missing or insufficient.
-- The product usage remains auditable; the resulting negative balance raises an Inventory alert.
create or replace function public.actualise_activity_plan_v2(
  p_plan_id uuid, p_actual_date date, p_lines jsonb, p_actual_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.activity_plans%rowtype;
  v_line jsonb;
  v_product public.activity_plan_products%rowtype;
  v_item public.inventory_items%rowtype;
  v_location public.inventory_locations%rowtype;
  v_operation public.activity_plan_operations%rowtype;
  v_rate numeric;
  v_qty numeric;
  v_cost numeric;
  v_total numeric := 0;
  v_category text;
begin
  select * into v_plan from public.activity_plans
  where id=p_plan_id for update;
  if not found or not public.can_edit_farmer(v_plan.user_id,'activities') then raise exception 'Activity editing access required'; end if;
  if p_actual_date is null then raise exception 'Choose an actual date';end if;
  if v_plan.planned_area_ha<=0 or v_plan.planned_area_ha::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid activity area'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Product lines must be an array'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'id' having count(*)>1) then raise exception 'A product line was selected twice'; end if;
  if jsonb_array_length(p_lines)>0 and not public.can_edit_farmer(v_plan.user_id,'inventory') then raise exception 'Inventory editing access is required to record stock usage'; end if;
  if v_plan.status <> 'Planned' then raise exception 'This activity has already been actualised'; end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    select * into v_product from public.activity_plan_products
    where id=(v_line->>'id')::uuid and plan_id=p_plan_id and user_id=v_plan.user_id for update;
    if not found then raise exception 'Invalid product line'; end if;
    v_rate := coalesce(nullif(v_line->>'rate','')::numeric,0);
    if v_rate < 0 or v_rate::text in ('NaN','Infinity','-Infinity') then raise exception 'Product rate cannot be negative'; end if;
    v_qty := v_rate * v_plan.planned_area_ha;

    if nullif(v_line->>'inventory_item_id','') is not null then
      select * into v_item from public.inventory_items
      where id=(v_line->>'inventory_item_id')::uuid and user_id=v_plan.user_id for update;
      if not found then raise exception 'Choose a valid source shed for %',v_product.product_name; end if;
      if v_item.location_id is null then raise exception '% must be assigned to a shed before use',v_item.name; end if;
      if v_product.master_product_id is not null and v_item.master_product_id is distinct from v_product.master_product_id then
        raise exception 'The selected shed item does not match planned product %',v_product.product_name;
      end if;
    else
      if nullif(v_line->>'location_id','') is null then raise exception 'Choose a shed for %',v_product.product_name; end if;
      select * into v_location from public.inventory_locations
      where id=(v_line->>'location_id')::uuid and user_id=v_plan.user_id and active for share;
      if not found then raise exception 'Choose a valid active source shed for %',v_product.product_name; end if;
      if v_product.master_product_id is not null then
        select * into v_item from public.inventory_items
        where user_id=v_plan.user_id and location_id=v_location.id and status<>'Inactive'
          and master_product_id=v_product.master_product_id
        order by created_at limit 1 for update;
      else
        select * into v_item from public.inventory_items
        where user_id=v_plan.user_id and location_id=v_location.id and status<>'Inactive'
          and lower(name)=lower(v_product.product_name) and unit=v_product.unit
        order by created_at limit 1 for update;
      end if;
      if not found then
        v_category := 'Other';
        if v_product.master_product_id is not null then
          select coalesce(product_class,category,'Other') into v_category
          from public.master_products where id=v_product.master_product_id;
        end if;
        insert into public.inventory_items(
          user_id,season,master_product_id,name,category,unit,quantity,unit_cost,
          location,location_id,status,notes,owner_type,stock_status
        ) values (
          v_plan.user_id,v_plan.season,v_product.master_product_id,v_product.product_name,
          coalesce(v_category,'Other'),coalesce(nullif(v_product.unit,''),'unit'),0,
          v_product.planned_unit_price,v_location.name,v_location.id,'Active',
          'Created when activity was actualised; verify physical stock.', 'Farmer','Available'
        ) returning * into v_item;
      end if;
    end if;

    if coalesce(v_item.unit_cost,v_product.planned_unit_price,0)<0 or coalesce(v_item.unit_cost,v_product.planned_unit_price,0)::text in ('NaN','Infinity','-Infinity') then raise exception 'Correct the product unit cost before recording usage';end if;
    v_cost := round(coalesce(v_item.unit_cost,v_product.planned_unit_price,0)*v_qty,2);
    v_total := v_total + v_cost;
    update public.inventory_items set quantity=quantity-v_qty where id=v_item.id returning * into v_item;
    insert into public.inventory_transactions(
      user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,
      reference,notes,season,location_id,field_id,movement_reason
    ) values (
      v_plan.user_id,v_item.id,p_actual_date,'Stock Out',v_qty,coalesce(v_item.unit_cost,v_product.planned_unit_price,0),
      'PLAN-'||left(p_plan_id::text,8),v_plan.activity_type||' · '||v_plan.field_name,
      v_plan.season,v_item.location_id,v_plan.field_id,'Activity actualised'
    );
    update public.activity_plan_products set inventory_item_id=v_item.id,
      product_name=v_item.name,unit=v_item.unit,actual_rate_per_ha=v_rate,
      actual_quantity=v_qty,actual_unit_price=coalesce(v_item.unit_cost,v_product.planned_unit_price,0),actual_cost=v_cost
    where id=v_product.id;
  end loop;

  for v_operation in select * from public.activity_plan_operations
    where plan_id=p_plan_id and user_id=v_plan.user_id for update loop
    v_qty := v_operation.planned_rate_per_ha*v_plan.planned_area_ha;
    v_cost := round(v_qty*v_operation.planned_unit_price,2);
    v_total := v_total+v_cost;
    update public.activity_plan_operations set actual_rate_per_ha=v_operation.planned_rate_per_ha,
      actual_quantity=v_qty,actual_unit_price=v_operation.planned_unit_price,actual_cost=v_cost
    where id=v_operation.id;
  end loop;

  update public.activity_plans set status='Actualised',actual_date=p_actual_date,
    actual_notes=p_actual_notes,actual_total=v_total,updated_at=now() where id=p_plan_id;
  insert into public.activities(user_id,field_id,activity_type,field_name,crop,season,date,area_ha,notes)
  values(v_plan.user_id,v_plan.field_id,v_plan.activity_type,v_plan.field_name,v_plan.crop,v_plan.season,
    p_actual_date,v_plan.planned_area_ha,'Actual · '||coalesce(p_actual_notes,'Confirmed from plan'));
  return jsonb_build_object('plan_id',p_plan_id,'actual_total',v_total,'status','Actualised');
end;
$$;
grant execute on function public.actualise_activity_plan_v2(uuid,date,jsonb,text) to authenticated;

-- Farm Map actuals may add or replace catalogue products/seeds and operations.
-- The legacy actualisation RPC continues to post shed movements and costing.
create or replace function public.actualise_activity_group_v1(
  p_actual_start_date date,
  p_actual_end_date date,
  p_plans jsonb,
  p_actual_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry jsonb;
  v_product_line jsonb;
  v_operation_line jsonb;
  v_products jsonb;
  v_operations jsonb;
  v_plan public.activity_plans%rowtype;
  v_source public.activity_plans%rowtype;
  v_op public.activity_plan_operations%rowtype;
  v_catalog_product public.master_products%rowtype;
  v_catalog_operation public.standard_operations%rowtype;
  v_product_id uuid;
  v_operation_id uuid;
  v_actual_total numeric;
  v_count integer := 0;
  v_note text;
begin
  if p_actual_start_date is null or p_actual_end_date is null or p_actual_end_date < p_actual_start_date then
    raise exception 'Enter a valid actual date range';
  end if;
  if jsonb_typeof(p_plans) is distinct from 'array' or jsonb_array_length(p_plans) = 0 then
    raise exception 'Select at least one field';
  end if;

  for v_entry in select value from jsonb_array_elements(p_plans) loop
    select * into v_plan from public.activity_plans
    where id=(v_entry->>'plan_id')::uuid for update;
    if not found or not public.can_edit_farmer(v_plan.user_id,'activities') then raise exception 'Activity editing access required'; end if;
    if v_plan.status <> 'Planned' then raise exception 'One of the selected activities has already been actualised'; end if;
    if v_count=0 then v_source:=v_plan;
    elsif v_plan.user_id is distinct from v_source.user_id or v_plan.season is distinct from v_source.season or v_plan.activity_type is distinct from v_source.activity_type then
      raise exception 'Selected activities must have the same activity and season';
    end if;

    v_products:='[]'::jsonb;
    for v_product_line in select value from jsonb_array_elements(coalesce(v_entry->'products','[]'::jsonb)) loop
      if (v_product_line->>'unit_price')::numeric<0 or (v_product_line->>'unit_price')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid product price';end if;
      select * into v_catalog_product from public.master_products
      where id=(v_product_line->>'master_product_id')::uuid and status='Approved';
      if not found then raise exception 'Choose an approved product or seed from the catalogue'; end if;
      if nullif(v_product_line->>'id','') is null then
        insert into public.activity_plan_products(user_id,plan_id,inventory_item_id,master_product_id,product_name,unit,
          planned_rate_per_ha,planned_quantity,planned_unit_price,planned_cost)
        values(v_plan.user_id,v_plan.id,null,v_catalog_product.id,v_catalog_product.name,
          coalesce(nullif(v_product_line->>'unit',''),v_catalog_product.pack_unit,'unit'),0,0,
          greatest(coalesce((v_product_line->>'unit_price')::numeric,0),0),0)
        returning id into v_product_id;
      else
        v_product_id:=(v_product_line->>'id')::uuid;
        update public.activity_plan_products set master_product_id=v_catalog_product.id,
          product_name=v_catalog_product.name,unit=coalesce(nullif(v_product_line->>'unit',''),v_catalog_product.pack_unit,'unit')
        where id=v_product_id and plan_id=v_plan.id and user_id=v_plan.user_id;
        if not found then raise exception 'Product line not found for %',v_plan.field_name; end if;
      end if;
      v_products:=v_products||jsonb_build_array(jsonb_set(v_product_line,'{id}',to_jsonb(v_product_id::text),true));
    end loop;

    v_operations:='[]'::jsonb;
    for v_operation_line in select value from jsonb_array_elements(coalesce(v_entry->'operations','[]'::jsonb)) loop
      if (v_operation_line->>'unit_price')::numeric<0 or (v_operation_line->>'unit_price')::numeric::text in ('NaN','Infinity','-Infinity') or (v_operation_line->>'rate')::numeric<0 or (v_operation_line->>'rate')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid operation price and rate';end if;
      select * into v_catalog_operation from public.standard_operations
      where id=(v_operation_line->>'operation_id')::uuid and active;
      if not found then raise exception 'Choose an active operation from the operations list'; end if;
      if nullif(v_operation_line->>'id','') is null then
        insert into public.activity_plan_operations(user_id,plan_id,operation_id,operation_name,unit,
          planned_rate_per_ha,planned_quantity,planned_unit_price,planned_cost)
        values(v_plan.user_id,v_plan.id,v_catalog_operation.id,v_catalog_operation.name,v_catalog_operation.unit,
          0,0,greatest(coalesce((v_operation_line->>'unit_price')::numeric,v_catalog_operation.unit_cost),0),0)
        returning id into v_operation_id;
      else
        v_operation_id:=(v_operation_line->>'id')::uuid;
        update public.activity_plan_operations set operation_id=v_catalog_operation.id,
          operation_name=v_catalog_operation.name,unit=v_catalog_operation.unit,
          planned_unit_price=greatest(coalesce((v_operation_line->>'unit_price')::numeric,v_catalog_operation.unit_cost),0)
        where id=v_operation_id and plan_id=v_plan.id and user_id=v_plan.user_id;
        if not found then raise exception 'Operation line not found for %',v_plan.field_name; end if;
      end if;
      v_operations:=v_operations||jsonb_build_array(jsonb_set(v_operation_line,'{id}',to_jsonb(v_operation_id::text),true));
    end loop;

    v_note:=concat(coalesce(p_actual_notes,'Actual confirmed from Farm Map'),' · actual period ',p_actual_start_date,' to ',p_actual_end_date);
    perform public.actualise_activity_plan_v2(v_plan.id,p_actual_end_date,v_products,v_note);

    for v_op in select * from public.activity_plan_operations where plan_id=v_plan.id and user_id=v_plan.user_id for update loop
      select ops.value into v_operation_line from jsonb_array_elements(v_operations) as ops(value)
      where ops.value->>'id'=v_op.id::text limit 1;
      if found then
        if coalesce((v_operation_line->>'rate')::numeric,0)<0 then raise exception 'Operation rate cannot be negative'; end if;
        update public.activity_plan_operations set
          actual_rate_per_ha=coalesce((v_operation_line->>'rate')::numeric,0),
          actual_quantity=coalesce((v_operation_line->>'rate')::numeric,0)*v_plan.planned_area_ha,
          actual_unit_price=planned_unit_price,
          actual_cost=round(coalesce((v_operation_line->>'rate')::numeric,0)*v_plan.planned_area_ha*planned_unit_price,2)
        where id=v_op.id;
      else
        update public.activity_plan_operations set actual_rate_per_ha=null,actual_quantity=null,actual_unit_price=null,actual_cost=null where id=v_op.id;
      end if;
    end loop;

    select coalesce(sum(actual_cost),0) into v_actual_total from public.activity_plan_products where plan_id=v_plan.id and user_id=v_plan.user_id;
    select v_actual_total+coalesce(sum(actual_cost),0) into v_actual_total from public.activity_plan_operations where plan_id=v_plan.id and user_id=v_plan.user_id;
    update public.activity_plans set actual_start_date=p_actual_start_date,actual_end_date=p_actual_end_date,
      actual_notes=v_note,actual_total=v_actual_total,updated_at=now() where id=v_plan.id and user_id=v_plan.user_id;
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('actualised_count',v_count,'actual_start_date',p_actual_start_date,'actual_end_date',p_actual_end_date);
end;
$$;
grant execute on function public.actualise_activity_group_v1(date,date,jsonb,text) to authenticated;


-- Reconcile derived Harvest rows when the source changes, rather than on page viewing.
create or replace function public.sync_transport_load_harvest(p_load_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_load public.transport_loads%rowtype;v_allocation public.transport_load_allocations%rowtype;v_field public.fields%rowtype;v_count integer:=0;
begin
 select * into v_load from public.transport_loads where id=p_load_id for update;
 if not found or not public.can_edit_farmer(v_load.user_id,'transport') then raise exception 'Transport load not found or access denied';end if;
 if v_load.status<>'Reconciled' then delete from public.harvest_records where transport_allocation_id in (select id from public.transport_load_allocations where load_id=p_load_id); return jsonb_build_object('load_id',p_load_id,'synced',0,'status',v_load.status);end if;
 for v_allocation in select * from public.transport_load_allocations where load_id=p_load_id loop
  select * into v_field from public.fields where id=v_allocation.field_id;
  insert into public.harvest_records(user_id,field_id,harvest_date,crop,season,area_ha,tonnes_harvested,moisture_percent,quality_grade,destination_type,destination_name,price_per_tonne,transport_cost,other_cost,notes,transport_allocation_id,source)
  values(v_load.user_id,v_field.id,v_load.load_date,coalesce(v_field.crop,v_allocation.crop_snapshot),coalesce(v_field.season,v_allocation.season_snapshot),v_field.area_ha,v_allocation.allocated_tonnes,v_load.moisture_percent,v_load.grade,'Transport Log',v_load.destination_name,null,null,null,concat('Load ',v_load.load_number,coalesce(' · Ticket '||v_load.ticket_number,'')),v_allocation.id,'Transport Log')
  on conflict(transport_allocation_id) where transport_allocation_id is not null do update set field_id=excluded.field_id,harvest_date=excluded.harvest_date,crop=excluded.crop,season=excluded.season,area_ha=excluded.area_ha,tonnes_harvested=excluded.tonnes_harvested,moisture_percent=excluded.moisture_percent,quality_grade=excluded.quality_grade,destination_name=excluded.destination_name,notes=excluded.notes;
  v_count:=v_count+1;
 end loop;
 return jsonb_build_object('load_id',p_load_id,'synced',v_count,'status','Reconciled');
end $$;
grant execute on function public.sync_transport_load_harvest(uuid) to authenticated;


create or replace function public.transport_harvest_after_change() returns trigger
language plpgsql security invoker set search_path=public as $$
declare load_id uuid;
begin
 if tg_table_name='transport_loads' then load_id:=new.id;
 elsif tg_op='DELETE' then load_id:=old.load_id;
 else load_id:=new.load_id;end if;
 if exists(select 1 from public.transport_loads where id=load_id) then perform public.sync_transport_load_harvest(load_id);end if;
 if tg_table_name='transport_load_allocations' then
 if tg_op='UPDATE' then
  if old.load_id is distinct from new.load_id and exists(select 1 from public.transport_loads where id=old.load_id) then perform public.sync_transport_load_harvest(old.load_id);end if;
 end if;
 end if;
 return null;
end $$;
drop trigger if exists transport_harvest_load_change on public.transport_loads;
create trigger transport_harvest_load_change after insert or update of status,load_date,moisture_percent,grade,destination_name,ticket_number,load_number on public.transport_loads for each row execute function public.transport_harvest_after_change();
drop trigger if exists transport_harvest_allocation_change on public.transport_load_allocations;
create trigger transport_harvest_allocation_change after insert or update of load_id,field_id,allocated_tonnes,crop_snapshot,cultivar_snapshot,season_snapshot or delete on public.transport_load_allocations for each row execute function public.transport_harvest_after_change();

-- One row saves its load, allocation, pricing and optional completion together.
create or replace function public.save_transport_entry(p_load jsonb,p_field uuid,p_tonnes numeric,p_allocation uuid default null,p_complete boolean default false)
returns uuid language plpgsql security invoker set search_path=public as $$
declare f public.fields%rowtype;v_load uuid;v_allocation uuid;v_existing public.transport_loads%rowtype;
begin
 select * into f from public.fields where id=p_field;
 if not found or not public.can_edit_farmer(f.user_id,'transport') then raise exception 'Transport editing access required';end if;
 if (p_load->>'net_tonnes')::numeric is null or (p_load->>'net_tonnes')::numeric<=0 or (p_load->>'net_tonnes')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter valid positive net tonnes';end if;
 if p_tonnes is null or p_tonnes<=0 or p_tonnes::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter valid allocated tonnes';end if;
 if coalesce(trim(p_load->>'load_number'),'')='' or nullif(p_load->>'load_date','') is null then raise exception 'Enter a load number and date';end if;
 if p_complete and p_load->>'status' is distinct from 'Reconciled' then raise exception 'Reconcile the load before completing a harvest';end if;
 perform pg_advisory_xact_lock(hashtextextended(f.user_id::text||trim(p_load->>'load_number'),0));
 select * into v_existing from public.transport_loads where user_id=f.user_id and load_number=trim(p_load->>'load_number') for update;
 if found and v_existing.season is distinct from f.season then raise exception 'This load number belongs to another season. Use its original record or a unique load number';end if;
 if p_allocation is not null and not exists(select 1 from public.transport_load_allocations a where a.id=p_allocation and a.user_id=f.user_id and a.load_id=v_existing.id) then raise exception 'Allocation does not belong to this load and farming account';end if;
 insert into public.transport_loads(user_id,season,load_number,load_date,destination_name,truck_registration,trailer_registration,driver_name,transporter,ticket_number,gross_tonnes,tare_tonnes,net_tonnes,accepted_tonnes,rejected_tonnes,moisture_percent,grade,status,notes,source,created_by)
 values(f.user_id,f.season,trim(p_load->>'load_number'),(p_load->>'load_date')::date,p_load->>'destination_name',p_load->>'truck_registration',p_load->>'trailer_registration',p_load->>'driver_name',p_load->>'transporter',p_load->>'ticket_number',(p_load->>'gross_tonnes')::numeric,(p_load->>'tare_tonnes')::numeric,(p_load->>'net_tonnes')::numeric,(p_load->>'accepted_tonnes')::numeric,(p_load->>'rejected_tonnes')::numeric,(p_load->>'moisture_percent')::numeric,p_load->>'grade',coalesce(p_load->>'status','Planned'),p_load->>'notes',coalesce(p_load->>'source','Web'),auth.uid())
 on conflict(user_id,load_number) do update set load_date=excluded.load_date,destination_name=excluded.destination_name,truck_registration=excluded.truck_registration,trailer_registration=excluded.trailer_registration,driver_name=excluded.driver_name,transporter=excluded.transporter,ticket_number=excluded.ticket_number,gross_tonnes=excluded.gross_tonnes,tare_tonnes=excluded.tare_tonnes,net_tonnes=excluded.net_tonnes,accepted_tonnes=excluded.accepted_tonnes,rejected_tonnes=excluded.rejected_tonnes,moisture_percent=excluded.moisture_percent,grade=excluded.grade,status=excluded.status,notes=excluded.notes,updated_at=now() returning id into v_load;
 v_allocation:=p_allocation;
 if v_allocation is null then
  if (select count(*) from public.transport_load_allocations where load_id=v_load and field_id=f.id)>1 then raise exception 'Multiple allocations exist for this field. Export the current logsheet and edit the allocation IDs';end if;
  select id into v_allocation from public.transport_load_allocations where load_id=v_load and field_id=f.id;
 end if;
 if v_allocation is null then
  insert into public.transport_load_allocations(user_id,load_id,field_id,allocated_tonnes,crop_snapshot,cultivar_snapshot,season_snapshot,notes)
  values(f.user_id,v_load,f.id,p_tonnes,f.crop,f.cultivar,f.season,p_load->>'notes') returning id into v_allocation;
 else
  update public.transport_load_allocations set field_id=f.id,allocated_tonnes=p_tonnes,crop_snapshot=f.crop,cultivar_snapshot=f.cultivar,season_snapshot=f.season,notes=p_load->>'notes',updated_at=now() where id=v_allocation;
 end if;
 if (select coalesce(sum(allocated_tonnes),0) from public.transport_load_allocations where load_id=v_load)>(p_load->>'net_tonnes')::numeric+0.001 then raise exception 'Allocated field tonnes exceed the load net tonnes. Check the allocations';end if;
 if f.crop is not null then perform public.reprice_grain_harvest(f.user_id,f.season,f.crop);end if;
 if p_complete then perform public.complete_transport_field_harvest(f.id,(p_load->>'load_date')::date,p_load->>'notes');end if;
 return v_allocation;
end $$;
revoke all on function public.save_transport_entry(jsonb,uuid,numeric,uuid,boolean) from public,anon;
grant execute on function public.save_transport_entry(jsonb,uuid,numeric,uuid,boolean) to authenticated;
revoke all on function public.transport_harvest_after_change() from public,anon;

-- Refresh legacy derived Harvest rows once; the source allocations remain authoritative.
delete from public.harvest_records h using public.transport_load_allocations a,public.transport_loads l where h.transport_allocation_id=a.id and a.load_id=l.id and l.status<>'Reconciled';
do $$ declare v_load public.transport_loads%rowtype;v_allocation public.transport_load_allocations%rowtype;v_field public.fields%rowtype;begin
 for v_load in select * from public.transport_loads where status='Reconciled' loop
  for v_allocation in select * from public.transport_load_allocations where load_id=v_load.id loop
   select * into v_field from public.fields where id=v_allocation.field_id;
   insert into public.harvest_records(user_id,field_id,harvest_date,crop,season,area_ha,tonnes_harvested,moisture_percent,quality_grade,destination_type,destination_name,price_per_tonne,transport_cost,other_cost,notes,transport_allocation_id,source)
  values(v_load.user_id,v_field.id,v_load.load_date,coalesce(v_field.crop,v_allocation.crop_snapshot),coalesce(v_field.season,v_allocation.season_snapshot),v_field.area_ha,v_allocation.allocated_tonnes,v_load.moisture_percent,v_load.grade,'Transport Log',v_load.destination_name,null,null,null,concat('Load ',v_load.load_number,coalesce(' · Ticket '||v_load.ticket_number,'')),v_allocation.id,'Transport Log')
  on conflict(transport_allocation_id) where transport_allocation_id is not null do update set field_id=excluded.field_id,harvest_date=excluded.harvest_date,crop=excluded.crop,season=excluded.season,area_ha=excluded.area_ha,tonnes_harvested=excluded.tonnes_harvested,moisture_percent=excluded.moisture_percent,quality_grade=excluded.quality_grade,destination_name=excluded.destination_name,notes=excluded.notes;
  end loop;
 end loop;
end $$;

-- Labour capture and its field/farm-wide cost must succeed together.
alter table public.labour_entries add column if not exists season text;
alter table public.labour_entries add column if not exists client_request_id uuid;
alter table public.labour_entries add column if not exists client_request_payload jsonb;
create unique index if not exists labour_client_request_unique on public.labour_entries(user_id,client_request_id) where client_request_id is not null;
update public.labour_entries l set season=f.season from public.fields f where l.field_id=f.id and l.user_id=f.user_id and l.season is null;
create or replace function public.save_labour_entry(p_request uuid,p_employee uuid,p_field uuid,p_season text,p_details jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare e public.employees%rowtype;f public.fields%rowtype;v_existing public.labour_entries%rowtype;v_id uuid;v_payload jsonb;v_hours numeric;v_cost numeric;v_season text;v_job uuid;
begin
 select * into e from public.employees where id=p_employee;
 if not found or not public.can_edit_farmer(e.user_id,'labour') then raise exception 'Labour editing access required';end if;
 if p_request is null or nullif(p_details->>'date','') is null then raise exception 'Choose a work date';end if;
 v_payload:=jsonb_build_object('employee',p_employee,'field',p_field,'season',p_season,'details',p_details);
 perform pg_advisory_xact_lock(hashtextextended(e.user_id::text||p_request::text,0));
 select * into v_existing from public.labour_entries where user_id=e.user_id and client_request_id=p_request;
 if found then if v_existing.client_request_payload is distinct from v_payload then raise exception 'This save key belongs to different labour details';end if;return v_existing.id;end if;
 v_season:=nullif(trim(p_season),'');
 if p_field is not null then select * into f from public.fields where id=p_field and user_id=e.user_id;if not found then raise exception 'Choose a field for the employee farming account';end if;v_season:=f.season;end if;
 if v_season is null then raise exception 'Choose the season for this labour cost';end if;
 v_job:=nullif(p_details->>'job','')::uuid;
 if v_job is not null and not exists(select 1 from public.work_orders where id=v_job and user_id=e.user_id) then raise exception 'Choose a job for the same farming account';end if;
 v_hours:=(p_details->>'hours')::numeric;
 if v_hours is null or v_hours<=0 or v_hours::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter valid positive work hours';end if;
 if e.hourly_rate<0 or e.hourly_rate::text in ('NaN','Infinity','-Infinity') then raise exception 'Correct the employee hourly rate';end if;
 v_cost:=round(v_hours*e.hourly_rate,2);
 insert into public.labour_entries(user_id,employee_id,field_id,work_order_id,work_date,start_time,end_time,hours_worked,activity_type,description,hourly_rate,total_cost,notes,season,client_request_id,client_request_payload)
 values(e.user_id,e.id,p_field,v_job,(p_details->>'date')::date,nullif(p_details->>'start','')::time,nullif(p_details->>'end','')::time,v_hours,coalesce(p_details->>'activity','General'),nullif(p_details->>'description',''),e.hourly_rate,v_cost,p_details->>'notes',v_season,p_request,v_payload) returning id into v_id;
 if v_cost is not null then
  insert into public.financial_transactions(user_id,field_id,season,transaction_date,transaction_type,category,description,quantity,unit,unit_price,amount,supplier_or_customer,reference,notes)
  values(e.user_id,p_field,v_season,(p_details->>'date')::date,'Expense','Labour',coalesce(nullif(p_details->>'description',''),'Labour - '||e.full_name),v_hours,'hours',e.hourly_rate,v_cost,e.full_name,'LABOUR-'||v_id,p_details->>'notes');
 end if;
 return v_id;
end $$;
revoke all on function public.save_labour_entry(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.save_labour_entry(uuid,uuid,uuid,text,jsonb) to authenticated;

create or replace function public.reprice_grain_harvest(p_user_id uuid,p_season text,p_crop text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_row record;v_contract record;v_remaining numeric;v_contract_remaining numeric;v_use numeric;v_safex numeric:=0;v_allocated numeric:=0;
begin
 if not public.can_edit_farmer(p_user_id,'harvest') then raise exception 'Access denied';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_season||lower(p_crop),0));
 delete from public.transport_pricing_allocations where user_id=p_user_id and season=p_season and lower(crop)=lower(p_crop);
 select price_per_tonne into v_safex from public.safex_reference_prices where (user_id=p_user_id or user_id is null) and (lower(commodity)=lower(p_crop) or (lower(p_crop) like '%maize%' and lower(commodity) like '%maize%')) order by observed_at desc limit 1;
 for v_row in select a.id allocation_id,a.allocated_tonnes,l.grade,l.load_date from public.transport_load_allocations a join public.transport_loads l on l.id=a.load_id join public.fields f on f.id=a.field_id where a.user_id=p_user_id and l.status='Reconciled' and f.season=p_season and lower(coalesce(f.crop,a.crop_snapshot,''))=lower(p_crop) order by l.load_date,l.created_at,a.created_at loop
  v_remaining:=v_row.allocated_tonnes;
  for v_contract in select gp.*,gp.tonnes-coalesce((select sum(pa.priced_tonnes) from public.transport_pricing_allocations pa where pa.grain_position_id=gp.id),0) available from public.grain_positions gp where gp.user_id=p_user_id and gp.season=p_season and gp.status<>'Cancelled' and gp.price_per_tonne is not null and (lower(gp.commodity)=lower(p_crop) or (lower(p_crop) like '%maize%' and lower(gp.commodity) like '%maize%')) order by gp.contract_date nulls last,gp.created_at loop
   exit when v_remaining<=0;v_contract_remaining:=greatest(v_contract.available,0);if v_contract_remaining<=0 then continue;end if;v_use:=least(v_remaining,v_contract_remaining);
   insert into public.transport_pricing_allocations(user_id,transport_allocation_id,grain_position_id,season,crop,grade,priced_tonnes,price_per_tonne,price_source,contract_reference) values(p_user_id,v_row.allocation_id,v_contract.id,p_season,p_crop,v_row.grade,v_use,v_contract.price_per_tonne,'Contract',coalesce(v_contract.reference,v_contract.buyer_or_broker));v_remaining:=v_remaining-v_use;v_allocated:=v_allocated+v_use;
  end loop;
  if v_remaining>0 then insert into public.transport_pricing_allocations(user_id,transport_allocation_id,season,crop,grade,priced_tonnes,price_per_tonne,price_source,contract_reference) values(p_user_id,v_row.allocation_id,p_season,p_crop,v_row.grade,v_remaining,coalesce(v_safex,0),case when v_safex is null then 'Unpriced' else 'SAFEX estimate' end,null);end if;
 end loop;
 return jsonb_build_object('season',p_season,'crop',p_crop,'contract_tonnes',v_allocated,'safex_price',v_safex);
end $$;
grant execute on function public.reprice_grain_harvest(uuid,text,text) to authenticated;
-- Price changes update saved harvested allocations immediately, not when Reports opens.
create or replace function public.reprice_after_contract_change() returns trigger language plpgsql security invoker set search_path=public as $$
declare r record;
begin
 if tg_op in ('UPDATE','DELETE') then
  for r in select distinct f.user_id,f.season,f.crop from public.fields f where f.user_id=old.user_id and f.season=old.season and (lower(f.crop)=lower(old.commodity) or (lower(f.crop) like '%maize%' and lower(old.commodity) like '%maize%')) loop
   perform public.reprice_grain_harvest(r.user_id,r.season,r.crop);
  end loop;
 end if;
 if tg_op in ('INSERT','UPDATE') then
  for r in select distinct f.user_id,f.season,f.crop from public.fields f where f.user_id=new.user_id and f.season=new.season and (lower(f.crop)=lower(new.commodity) or (lower(f.crop) like '%maize%' and lower(new.commodity) like '%maize%')) loop
   perform public.reprice_grain_harvest(r.user_id,r.season,r.crop);
  end loop;
 end if;
 return null;
end $$;
drop trigger if exists contracts_update_harvest_pricing on public.grain_positions;
create trigger contracts_update_harvest_pricing after insert or update or delete on public.grain_positions for each row execute function public.reprice_after_contract_change();
revoke all on function public.reprice_after_contract_change() from public,anon;

alter table public.document_scans add column if not exists client_request_id uuid;
alter table public.document_scans add column if not exists client_request_payload jsonb;
create unique index if not exists document_scan_client_request_unique on public.document_scans(user_id,client_request_id) where client_request_id is not null;
create or replace function public.confirm_document_scan(p_request uuid,p_filename text,p_document jsonb,p_field uuid,p_location uuid,p_season text,p_lines jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_actor uuid:=auth.uid();v_payload jsonb;v_existing public.document_scans%rowtype;v_line jsonb;v_item public.inventory_items%rowtype;v_master public.master_products%rowtype;v_location public.inventory_locations%rowtype;v_ids uuid[]:='{}';v_id uuid;v_quantity numeric;v_cost numeric;
begin
 if v_actor is null or p_request is null then raise exception 'Sign in before confirming a document';end if;
 v_payload:=jsonb_build_object('file',p_filename,'document',p_document,'field',p_field,'location',p_location,'season',p_season,'lines',p_lines);
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||p_request::text,0));
 select * into v_existing from public.document_scans where user_id=v_actor and client_request_id=p_request;
 if found then if v_existing.client_request_payload is distinct from v_payload then raise exception 'This confirmation key belongs to different details';end if;return v_existing.extracted_data->'posted_record_ids';end if;
 if p_document->>'document_type'='Transport delivery note' then
  v_id:=public.save_transport_entry(p_document||jsonb_build_object('load_number',coalesce(nullif(p_document->>'load_number',''),nullif(p_document->>'ticket_number',''),'SCAN-'||p_request),'load_date',coalesce(nullif(p_document->>'document_date',''),current_date::text),'status','Reconciled','source','AI Scanner'),p_field,(p_document->>'net_tonnes')::numeric,null,false);
  v_ids:=array_append(v_ids,v_id);
 elsif p_document->>'document_type'='Inventory receipt' then
  select * into v_location from public.inventory_locations where id=p_location and active;
  if not found or v_location.user_id<>v_actor then raise exception 'Choose an active receiving shed for this account';end if;
  if coalesce(trim(p_season),'')='' then raise exception 'Choose a season for this receipt';end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Select at least one receipt line';end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
   v_quantity:=(v_line->>'quantity')::numeric;v_cost:=nullif(v_line->>'unit_price','')::numeric;
   if v_quantity is null or v_quantity<=0 or v_quantity::text in ('NaN','Infinity','-Infinity') or v_cost<0 or v_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'Confirm valid positive quantities and nonnegative prices for every line';end if;
   if nullif(v_line->>'item_id','') is not null then
    select * into v_item from public.inventory_items where id=(v_line->>'item_id')::uuid and user_id=v_actor and location_id=v_location.id and status<>'Inactive' for update;
    if not found then raise exception 'Match the product to an item in the receiving shed';end if;
    if nullif(v_line->>'unit','') is not null and lower(trim(v_line->>'unit')) is distinct from lower(trim(v_item.unit)) then raise exception 'Receipt unit must match the stock item unit. Convert and confirm the quantity first';end if;
   else
    select * into v_master from public.master_products where id=(v_line->>'master_id')::uuid and status='Approved';
    if not found then raise exception 'Choose an approved catalogue product';end if;
    insert into public.inventory_items(user_id,season,master_product_id,name,category,unit,quantity,unit_cost,location,location_id,status,batch_number,supplier,owner_type,stock_status,notes)
    values(v_actor,p_season,v_master.id,v_master.name,coalesce(v_master.product_class,v_master.category,'Other'),coalesce(nullif(v_line->>'unit',''),v_master.pack_unit,'unit'),0,v_cost,v_location.name,v_location.id,'Active',v_line->>'batch_number',p_document->>'supplier','Farmer','Available','Created from reviewed scanner receipt') returning * into v_item;
   end if;
   perform public.post_inventory_movement(v_item.id,coalesce(nullif(p_document->>'document_date','')::date,current_date),'Receipt',v_quantity,coalesce(v_cost,v_item.unit_cost),coalesce(p_document->>'reference',p_document->>'ticket_number'),'Reviewed scanner receipt',null);
   v_ids:=array_append(v_ids,v_item.id);
  end loop;
 else raise exception 'Unsupported document type';end if;
 insert into public.document_scans(user_id,document_type,file_name,scan_status,extracted_data,confidence,target_record_id,confirmed_at,client_request_id,client_request_payload)
 values(v_actor,p_document->>'document_type',p_filename,'Confirmed',p_document||jsonb_build_object('posted_record_ids',to_jsonb(v_ids)),(p_document->>'confidence')::numeric,v_ids[1],now(),p_request,v_payload);
 return to_jsonb(v_ids);
end $$;
revoke all on function public.confirm_document_scan(uuid,text,jsonb,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.confirm_document_scan(uuid,text,jsonb,uuid,uuid,text,jsonb) to authenticated;

commit;
