-- CropNex v6.37.0: Trial -> Strips -> Products and harvested results.
-- Apply after 202610290001. Existing trials, strips, photos and inputs are retained.
begin;

alter table public.trial_strips alter column treatment_id drop not null;
alter table public.trial_inputs alter column treatment_id drop not null;
alter table public.trial_strips add column if not exists description text;
alter table public.trial_strips add column if not exists operation_cost_per_ha numeric(14,2) not null default 0 check(operation_cost_per_ha>=0);
alter table public.trial_strips add column if not exists harvested boolean not null default false;
alter table public.trial_inputs add column if not exists strip_id uuid;
alter table public.trial_inputs add column if not exists legacy_template boolean not null default false;
alter table public.trial_inputs add column if not exists legacy_source_input_id uuid;

create unique index if not exists trial_strips_trial_and_id on public.trial_strips(trial_id,id);
create unique index if not exists trial_inputs_legacy_source_strip on public.trial_inputs(legacy_source_input_id,strip_id) where legacy_source_input_id is not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='trial_inputs_strip_in_trial_fk' and conrelid='public.trial_inputs'::regclass) then
    alter table public.trial_inputs add constraint trial_inputs_strip_in_trial_fk foreign key(trial_id,strip_id) references public.trial_strips(trial_id,id) on delete cascade;
  end if;
end $$;

-- Carry group-based records into independent strips. The original input templates
-- remain archived; each strip receives its own editable copy and original cost.
update public.trial_strips s set
  description=coalesce(s.description,t.notes),
  operation_cost_per_ha=case when s.operation_cost_per_ha=0 then greatest(coalesce(t.operation_cost_per_ha,0),0) else s.operation_cost_per_ha end
from public.trial_treatments t where s.treatment_id=t.id and s.trial_id=t.trial_id;
update public.trial_strips set harvested=true where treatment_id is not null and yield_source='Manual' and (tonnes>0 or record_date is not null);
insert into public.trial_inputs(trial_id,treatment_id,user_id,input_type,product_name,rate,rate_unit,unit_price,notes,strip_id,legacy_source_input_id)
select i.trial_id,null,i.user_id,i.input_type,i.product_name,i.rate,i.rate_unit,i.unit_price,i.notes,s.id,i.id
from public.trial_inputs i join public.trial_strips s on s.trial_id=i.trial_id and s.treatment_id=i.treatment_id
where i.strip_id is null and not i.legacy_template and i.legacy_source_input_id is null
on conflict do nothing;
update public.trial_inputs i set legacy_template=true
where i.strip_id is null and exists(select 1 from public.trial_inputs copied where copied.legacy_source_input_id=i.id and copied.strip_id is not null);

create table if not exists public.trial_visits (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.trials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_date date not null,
  title text not null,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.trial_visits enable row level security;
grant select,insert,update,delete on public.trial_visits to authenticated;
create index if not exists trial_visits_trial_date_idx on public.trial_visits(trial_id,visit_date);
create index if not exists trial_inputs_strip_idx on public.trial_inputs(strip_id);
create index if not exists trial_strips_trial_idx on public.trial_strips(trial_id);

drop policy if exists trial_visits_read on public.trial_visits;
create policy trial_visits_read on public.trial_visits for select to authenticated using (
  exists(select 1 from public.trials p where p.id=trial_id and p.user_id=trial_visits.user_id and public.can_access_farmer(p.user_id,'trials'))
);
drop policy if exists trial_visits_insert on public.trial_visits;
create policy trial_visits_insert on public.trial_visits for insert to authenticated with check (
  exists(select 1 from public.trials p where p.id=trial_id and p.user_id=trial_visits.user_id and public.can_edit_farmer(p.user_id,'trials'))
);
drop policy if exists trial_visits_update on public.trial_visits;
create policy trial_visits_update on public.trial_visits for update to authenticated using (
  exists(select 1 from public.trials p where p.id=trial_id and p.user_id=trial_visits.user_id and public.can_edit_farmer(p.user_id,'trials'))
) with check (
  exists(select 1 from public.trials p where p.id=trial_id and p.user_id=trial_visits.user_id and public.can_edit_farmer(p.user_id,'trials'))
);
drop policy if exists trial_visits_delete on public.trial_visits;
create policy trial_visits_delete on public.trial_visits for delete to authenticated using (
  exists(select 1 from public.trials p where p.id=trial_id and p.user_id=trial_visits.user_id and public.can_edit_farmer(p.user_id,'trials'))
);

alter table public.trial_photos add column if not exists visit_id uuid references public.trial_visits(id) on delete set null;
alter table public.trial_photos add column if not exists strip_id uuid references public.trial_strips(id) on delete set null;
alter table public.trial_photos add column if not exists taken_date date;

create or replace function public.validate_trial_photo_links() returns trigger
language plpgsql set search_path=public as $$ begin
  if new.visit_id is not null and not exists(select 1 from public.trial_visits v where v.id=new.visit_id and v.trial_id=new.trial_id) then
    raise exception 'The visit must belong to this trial';
  end if;
  if new.strip_id is not null and not exists(select 1 from public.trial_strips s where s.id=new.strip_id and s.trial_id=new.trial_id) then
    raise exception 'The strip must belong to this trial';
  end if;
  return new;
end $$;
drop trigger if exists validate_trial_photo_links on public.trial_photos;
create trigger validate_trial_photo_links before insert or update on public.trial_photos for each row execute function public.validate_trial_photo_links();

commit;
