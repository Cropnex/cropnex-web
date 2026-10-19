-- AGCORE v6.9.0: every field gets a Harvest plan and administrators can see registered hectares.

create or replace function public.ensure_field_harvest_plan()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.season,'')<>'' and not exists(
    select 1 from public.activity_plans p
    where p.field_id=new.id and p.season=new.season and lower(p.activity_type) in ('harvest','harvesting')
  ) then
    insert into public.activity_plans(user_id,field_id,farmer_name,farm_name,field_name,activity_type,crop,cultivar,season,planned_date,planned_area_ha,status,notes)
    values(new.user_id,new.id,coalesce(new.farm_name,'Farmer'),coalesce(new.farm_name,'Farm'),new.field_name,'Harvest',new.crop,new.cultivar,new.season,coalesce(new.planting_date,current_date)+interval '180 days',greatest(coalesce(new.area_ha,0),0.001),'Planned','Standard Harvest activity · actualised from reconciled Transport Log loads');
  end if;
  return new;
end $$;

drop trigger if exists ensure_field_harvest_plan_trigger on public.fields;
create trigger ensure_field_harvest_plan_trigger after insert or update of season,crop,cultivar on public.fields for each row execute function public.ensure_field_harvest_plan();

insert into public.activity_plans(user_id,field_id,farmer_name,farm_name,field_name,activity_type,crop,cultivar,season,planned_date,planned_area_ha,status,notes)
select f.user_id,f.id,coalesce(f.farm_name,'Farmer'),coalesce(f.farm_name,'Farm'),f.field_name,'Harvest',f.crop,f.cultivar,f.season,coalesce(f.planting_date,current_date)+interval '180 days',greatest(coalesce(f.area_ha,0),0.001),'Planned','Standard Harvest activity · actualised from reconciled Transport Log loads'
from public.fields f where coalesce(f.season,'')<>'' and not exists(select 1 from public.activity_plans p where p.field_id=f.id and p.season=f.season and lower(p.activity_type) in ('harvest','harvesting'));

create or replace function public.admin_registered_hectares()
returns table(user_id uuid,business_name text,contact_name text,status text,total_hectares numeric,field_count bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admin_users a where a.user_id=auth.uid() and a.active) then raise exception 'Administrator access required'; end if;
  return query
  select r.user_id,r.business_name,r.contact_name,r.status,coalesce(sum(f.area_ha),0)::numeric,count(f.id)
  from public.role_applications r left join public.fields f on f.user_id=r.user_id and coalesce(f.status,'Active')<>'Inactive'
  group by r.user_id,r.business_name,r.contact_name,r.status order by r.business_name;
end $$;
grant execute on function public.admin_registered_hectares() to authenticated;
