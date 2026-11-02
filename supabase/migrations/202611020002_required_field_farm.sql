-- Require real named farm membership for newly created or reassigned fields.
-- Existing incomplete records are preserved until their identity is edited.
begin;
create or replace function public.enforce_named_field_farm() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_farm public.farms%rowtype; v_count integer;
begin
 new.field_name:=trim(new.field_name);
 if coalesce(new.field_name,'')='' then raise exception 'Enter a field name'; end if;
 if new.farm_id is not null then
  select * into v_farm from public.farms where id=new.farm_id and user_id=new.user_id and active;
  if not found then raise exception 'Choose an active saved farm belonging to this farming account'; end if;
 else
  if coalesce(trim(new.farm_name),'')='' then raise exception 'Choose a saved farm; every field needs a farm name'; end if;
  -- Resolve older callers (season copying and legacy boundaries) only when unambiguous.
  select count(*) into v_count from public.farms where user_id=new.user_id and active and lower(trim(name))=lower(trim(new.farm_name)) and (new.farmer_id is null or farmer_id=new.farmer_id);
  if v_count<>1 then raise exception 'Choose a saved farm from the dropdown. Create the farm in Farm Setup first if needed'; end if;
  select * into v_farm from public.farms where user_id=new.user_id and active and lower(trim(name))=lower(trim(new.farm_name)) and (new.farmer_id is null or farmer_id=new.farmer_id);
 end if;
 if coalesce(trim(v_farm.name),'')='' then raise exception 'Give the saved farm a name before adding fields'; end if;
 new.farm_id:=v_farm.id;new.farm_name:=trim(v_farm.name);new.farmer_id:=v_farm.farmer_id;
 return new;
end $$;
revoke all on function public.enforce_named_field_farm() from public,anon,authenticated;
drop trigger if exists fields_require_named_farm on public.fields;
create trigger fields_require_named_farm before insert or update of field_name,farm_name,farm_id,farmer_id,user_id on public.fields for each row execute function public.enforce_named_field_farm();
commit;
