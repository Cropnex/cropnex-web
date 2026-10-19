-- AGCORE v6.11.0: clean season rollover and season-scoped operating data.

alter table public.inventory_items add column if not exists season text;
alter table public.inventory_transfers add column if not exists season text;
alter table public.inventory_stocktakes add column if not exists season text;
alter table public.transport_loads add column if not exists season text;
alter table public.safex_reference_prices add column if not exists season text;
alter table public.activities add column if not exists season text;
create index if not exists inventory_items_user_season_idx on public.inventory_items(user_id,season);
create index if not exists safex_reference_prices_user_season_idx on public.safex_reference_prices(user_id,season);

update public.inventory_items i set season=coalesce(
 (select fs.source_season from public.user_season_preferences p join public.farm_seasons fs on fs.user_id=p.user_id and fs.name=p.current_season where p.user_id=i.user_id and fs.source_season is not null),
 (select p.current_season from public.user_season_preferences p where p.user_id=i.user_id),
 (select f.season from public.fields f where f.user_id=i.user_id and f.season is not null order by f.created_at desc limit 1)
) where i.season is null;
update public.inventory_transfers t set season=coalesce((select fs.source_season from public.user_season_preferences p join public.farm_seasons fs on fs.user_id=p.user_id and fs.name=p.current_season where p.user_id=t.user_id and fs.source_season is not null),(select p.current_season from public.user_season_preferences p where p.user_id=t.user_id)) where t.season is null;
update public.inventory_stocktakes t set season=coalesce((select fs.source_season from public.user_season_preferences p join public.farm_seasons fs on fs.user_id=p.user_id and fs.name=p.current_season where p.user_id=t.user_id and fs.source_season is not null),(select p.current_season from public.user_season_preferences p where p.user_id=t.user_id)) where t.season is null;
update public.transport_loads l set season=coalesce((select a.season_snapshot from public.transport_load_allocations a where a.load_id=l.id order by a.created_at limit 1),(select fs.source_season from public.user_season_preferences p join public.farm_seasons fs on fs.user_id=p.user_id and fs.name=p.current_season where p.user_id=l.user_id and fs.source_season is not null),(select p.current_season from public.user_season_preferences p where p.user_id=l.user_id)) where l.season is null;
update public.safex_reference_prices s set season=coalesce(
 (select fs.source_season from public.user_season_preferences p join public.farm_seasons fs on fs.user_id=p.user_id and fs.name=p.current_season where p.user_id=s.user_id and fs.source_season is not null),
 (select p.current_season from public.user_season_preferences p where p.user_id=s.user_id),
 (select f.season from public.fields f where f.user_id=s.user_id and f.season is not null order by f.created_at desc limit 1)
) where s.season is null and s.user_id is not null;
update public.activities a set season=coalesce(
 (select f.season from public.fields f where f.user_id=a.user_id and f.field_name=a.field_name and f.season is not null order by f.created_at asc limit 1),
 (select fs.source_season from public.user_season_preferences p join public.farm_seasons fs on fs.user_id=p.user_id and fs.name=p.current_season where p.user_id=a.user_id and fs.source_season is not null),
 (select p.current_season from public.user_season_preferences p where p.user_id=a.user_id)
) where a.season is null;

create or replace function public.apply_current_season()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.season is null then select current_season into new.season from public.user_season_preferences where user_id=coalesce(new.user_id,auth.uid());end if;
 return new;
end $$;
drop trigger if exists inventory_items_current_season on public.inventory_items;
create trigger inventory_items_current_season before insert on public.inventory_items for each row execute function public.apply_current_season();
drop trigger if exists inventory_transfers_current_season on public.inventory_transfers;
create trigger inventory_transfers_current_season before insert on public.inventory_transfers for each row execute function public.apply_current_season();
drop trigger if exists inventory_stocktakes_current_season on public.inventory_stocktakes;
create trigger inventory_stocktakes_current_season before insert on public.inventory_stocktakes for each row execute function public.apply_current_season();
drop trigger if exists transport_loads_current_season on public.transport_loads;
create trigger transport_loads_current_season before insert on public.transport_loads for each row execute function public.apply_current_season();
drop trigger if exists safex_reference_prices_current_season on public.safex_reference_prices;
create trigger safex_reference_prices_current_season before insert on public.safex_reference_prices for each row execute function public.apply_current_season();
drop trigger if exists activities_current_season on public.activities;
create trigger activities_current_season before insert on public.activities for each row execute function public.apply_current_season();

create or replace function public.ensure_field_harvest_plan()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.season,'')<>'' and coalesce(new.crop,'')<>'' and not exists(
    select 1 from public.activity_plans p where p.field_id=new.id and p.season=new.season and lower(p.activity_type) in ('harvest','harvesting')
  ) then
    insert into public.activity_plans(user_id,field_id,farmer_name,farm_name,field_name,activity_type,crop,cultivar,season,planned_date,planned_area_ha,status,notes)
    values(new.user_id,new.id,coalesce(new.farm_name,'Farmer'),coalesce(new.farm_name,'Farm'),new.field_name,'Harvest',new.crop,new.cultivar,new.season,coalesce(new.planting_date,current_date)+interval '180 days',greatest(coalesce(new.area_ha,0),0.001),'Planned','Standard Harvest activity · actualised from reconciled Transport Log loads');
  end if;
  return new;
end $$;

delete from public.activity_plans p using public.fields f
where p.field_id=f.id and coalesce(f.crop,'')='' and p.status='Planned' and lower(p.activity_type) in('harvest','harvesting') and p.notes like 'Standard Harvest activity%';

create or replace function public.create_farm_season(p_name text,p_source_season text default null,p_copy_fields boolean default true)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_user uuid:=auth.uid();v_count integer:=0;v_field public.fields%rowtype;
begin
 if nullif(trim(p_name),'') is null then raise exception 'Season name is required';end if;
 insert into public.farm_seasons(user_id,name,source_season) values(v_user,trim(p_name),nullif(trim(p_source_season),'')) on conflict(user_id,name) do nothing;
 if p_copy_fields and nullif(trim(p_source_season),'') is not null then
  for v_field in select * from public.fields where user_id=v_user and season=p_source_season loop
   insert into public.fields(user_id,field_name,farm_name,crop,season,planting_date,cultivar,soil_type,expected_yield,status,area_ha,notes,boundary,farmer_id,farm_id,cultivar_id,harvest_status,harvest_completed_at)
   values(v_user,v_field.field_name,v_field.farm_name,null,trim(p_name),null,null,v_field.soil_type,null,'Unplanned',v_field.area_ha,null,v_field.boundary,v_field.farmer_id,v_field.farm_id,null,'Not started',null);
   v_count:=v_count+1;
  end loop;
 end if;
 insert into public.user_season_preferences(user_id,current_season) values(v_user,trim(p_name)) on conflict(user_id) do update set current_season=excluded.current_season,updated_at=now();
 return jsonb_build_object('season',trim(p_name),'fields_copied',v_count,'plans_copied',0,'inventory_copied',0,'prices_copied',0,'harvest_copied',0);
end $$;
grant execute on function public.create_farm_season(text,text,boolean) to authenticated;

create or replace function public.reprice_grain_harvest(p_user_id uuid,p_season text,p_crop text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_row record;v_contract record;v_remaining numeric;v_contract_remaining numeric;v_use numeric;v_safex numeric:=0;v_allocated numeric:=0;
begin
 if not public.can_access_farmer(p_user_id,'yield') then raise exception 'Access denied';end if;
 delete from public.transport_pricing_allocations where user_id=p_user_id and season=p_season and lower(crop)=lower(p_crop);
 select price_per_tonne into v_safex from public.safex_reference_prices where (user_id=p_user_id or user_id is null) and (season=p_season or user_id is null) and (lower(commodity)=lower(p_crop) or (lower(p_crop) like '%maize%' and lower(commodity) like '%maize%')) order by observed_at desc limit 1;
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
