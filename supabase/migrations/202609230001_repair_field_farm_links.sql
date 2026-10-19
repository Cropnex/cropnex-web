-- Repair legacy field imports that have a farm name but no normalized farm links.
-- This is additive and does not delete or overwrite field geometry or agronomic data.

insert into public.farms (user_id, farmer_id, name)
select distinct
  f.user_id,
  coalesce(
    f.farmer_id,
    (select fr.id from public.farmers fr
      where fr.user_id=f.user_id and fr.active=true
      order by fr.created_at limit 1)
  ),
  trim(f.farm_name)
from public.fields f
where nullif(trim(f.farm_name),'') is not null
  and coalesce(
    f.farmer_id,
    (select fr.id from public.farmers fr
      where fr.user_id=f.user_id and fr.active=true
      order by fr.created_at limit 1)
  ) is not null
on conflict (user_id,farmer_id,name) do nothing;

update public.fields field
set farm_id=farm.id,
    farmer_id=coalesce(field.farmer_id,farm.farmer_id)
from public.farms farm
where farm.user_id=field.user_id
  and lower(trim(farm.name))=lower(trim(field.farm_name))
  and (field.farm_id is null or field.farmer_id is null);

create index if not exists fields_user_farmer_idx on public.fields(user_id,farmer_id);
create index if not exists fields_user_farm_idx on public.fields(user_id,farm_id);
