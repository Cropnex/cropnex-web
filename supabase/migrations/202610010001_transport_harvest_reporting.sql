-- AGCORE v6.6: continuously reconcile Transport Log tonnes into Harvest and reporting.
alter table public.harvest_records add column if not exists transport_allocation_id uuid references public.transport_load_allocations(id) on delete cascade;
alter table public.harvest_records add column if not exists source text not null default 'Manual';
create unique index if not exists harvest_records_transport_allocation_uidx on public.harvest_records(transport_allocation_id) where transport_allocation_id is not null;

create or replace function public.sync_transport_load_harvest(p_load_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_load public.transport_loads%rowtype;v_allocation public.transport_load_allocations%rowtype;v_field public.fields%rowtype;v_count integer:=0;
begin
 select * into v_load from public.transport_loads where id=p_load_id for update;
 if not found or not public.can_access_farmer(v_load.user_id,'actualise') then raise exception 'Transport load not found or access denied';end if;
 if v_load.status<>'Reconciled' then return jsonb_build_object('load_id',p_load_id,'synced',0,'status',v_load.status);end if;
 for v_allocation in select * from public.transport_load_allocations where load_id=p_load_id loop
  select * into v_field from public.fields where id=v_allocation.field_id;
  insert into public.harvest_records(user_id,field_id,harvest_date,crop,season,area_ha,tonnes_harvested,moisture_percent,quality_grade,destination_type,destination_name,price_per_tonne,transport_cost,other_cost,notes,transport_allocation_id,source)
  values(v_load.user_id,v_field.id,v_load.load_date,coalesce(v_field.crop,v_allocation.crop_snapshot),coalesce(v_field.season,v_allocation.season_snapshot),v_field.area_ha,v_allocation.allocated_tonnes,v_load.moisture_percent,v_load.grade,'Transport Log',v_load.destination_name,null,null,null,concat('Load ',v_load.load_number,coalesce(' · Ticket '||v_load.ticket_number,'')),v_allocation.id,'Transport Log')
  on conflict(transport_allocation_id) where transport_allocation_id is not null do update set harvest_date=excluded.harvest_date,crop=excluded.crop,season=excluded.season,area_ha=excluded.area_ha,tonnes_harvested=excluded.tonnes_harvested,moisture_percent=excluded.moisture_percent,quality_grade=excluded.quality_grade,destination_name=excluded.destination_name,notes=excluded.notes;
  v_count:=v_count+1;
 end loop;
 return jsonb_build_object('load_id',p_load_id,'synced',v_count,'status','Reconciled');
end $$;
grant execute on function public.sync_transport_load_harvest(uuid) to authenticated;

create or replace view public.field_harvest_live_summary with(security_invoker=true) as
with haul as(
 select a.user_id,a.field_id,sum(a.allocated_tonnes) reconciled_tonnes,count(distinct l.id) loads,max(l.load_date) latest_load,
  sum(a.allocated_tonnes*coalesce(l.accepted_tonnes/nullif(l.net_tonnes,0),1)) accepted_equivalent_tonnes
 from public.transport_load_allocations a join public.transport_loads l on l.id=a.load_id and l.status='Reconciled' group by a.user_id,a.field_id
), finance as(
 select user_id,field_id,sum(amount) filter(where transaction_type='Income') income,sum(amount) filter(where transaction_type='Expense') costs
 from public.financial_transactions where field_id is not null group by user_id,field_id
), deals as(
 select seller_id user_id,lower(commodity) commodity,sum(quantity_tonnes*coalesce(agreed_price_per_tonne,0))/nullif(sum(quantity_tonnes),0) price_per_tonne
 from public.grain_deals where status not in('Cancelled') and agreed_price_per_tonne is not null group by seller_id,lower(commodity)
)
select f.user_id,f.id field_id,f.farm_name,f.field_name,f.crop,f.cultivar,f.season,f.area_ha,f.harvest_status,f.harvest_completed_at,
 coalesce(h.reconciled_tonnes,0)::numeric(14,3) reconciled_tonnes,coalesce(h.loads,0) reconciled_loads,
 (coalesce(h.reconciled_tonnes,0)/nullif(f.area_ha,0))::numeric(14,3) yield_t_ha,
 coalesce(d.price_per_tonne,0)::numeric(14,2) market_price_per_tonne,
 coalesce(nullif(fin.income,0),coalesce(h.reconciled_tonnes,0)*coalesce(d.price_per_tonne,0),0)::numeric(16,2) projected_income,
 coalesce(fin.costs,0)::numeric(16,2) costs,
 (coalesce(nullif(fin.income,0),coalesce(h.reconciled_tonnes,0)*coalesce(d.price_per_tonne,0),0)-coalesce(fin.costs,0))::numeric(16,2) margin,
 h.latest_load,(f.harvest_status='Completed') finished
from public.fields f left join haul h on h.field_id=f.id left join finance fin on fin.field_id=f.id and fin.user_id=f.user_id
left join deals d on d.user_id=f.user_id and (lower(f.crop)=d.commodity or (lower(f.crop) like '%maize%' and d.commodity like '%maize%'));
grant select on public.field_harvest_live_summary to authenticated;
