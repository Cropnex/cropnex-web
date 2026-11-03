-- CropNex v6.41.0: explicit multi-field invitations and adviser scouting.
begin;
alter table public.scouting_observations add column if not exists advisory_recorded_by uuid references auth.users(id);

create or replace function public.advisory_invite_fields(p_owner uuid,p_email text,p_fields uuid[],p_all boolean default false,p_plans boolean default false,p_scouting boolean default false,p_yield boolean default false)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_advisor uuid; v_fields uuid[]; v_field uuid; v_id uuid;
begin
 if not public.advisory_account_ok() or not public.can_edit_farmer(p_owner,'advisory') then raise exception 'Farmer advisory editing access required'; end if;
 select id into v_advisor from auth.users where lower(email)=lower(trim(p_email));
 if v_advisor is null or not public.advisory_is_advisor(v_advisor) then raise exception 'Use an existing account approved as Agronomist or Chemical Representative'; end if;
 if v_advisor=p_owner then raise exception 'Choose a different adviser account'; end if;
 if p_all then
  select array_agg(id order by id) into v_fields from public.fields where user_id=p_owner;
 else
  select array_agg(distinct id order by id) into v_fields from unnest(p_fields) as chosen(id);
 end if;
 if coalesce(cardinality(v_fields),0)=0 then raise exception 'Select at least one field'; end if;
 -- Lock and validate the complete selection before making any invitation changes.
 perform id from public.fields where id=any(v_fields) order by id for share;
 if exists(select 1 from unnest(v_fields) as chosen(id) where not exists(select 1 from public.fields f where f.id=chosen.id and f.user_id=p_owner and public.advisory_manage_field(f.id))) then raise exception 'Every selected field must belong to this client and allow advisory management'; end if;
 foreach v_field in array v_fields loop
  insert into public.advisory_links(field_id,owner_id,advisor_id,advisor_email,share_plans,share_scouting,share_yield,invited_by)
  values(v_field,p_owner,v_advisor,lower(trim(p_email)),p_plans,p_scouting,p_yield,auth.uid())
  on conflict(field_id,advisor_id) do update set status=case when advisory_links.status='Active' then 'Active' else 'Pending' end,
   share_plans=excluded.share_plans,share_scouting=excluded.share_scouting,share_yield=excluded.share_yield,invited_by=excluded.invited_by,updated_at=now()
  returning id into v_id;
  insert into public.advisory_events(field_id,actor_id,record_id,action,payload) values(v_field,auth.uid(),v_id,'Field access invited/updated',jsonb_build_object('advisor_id',v_advisor,'scope',case when p_all then 'All current client fields' else 'Selected fields' end,'plans',p_plans,'scouting',p_scouting,'yield',p_yield));
 end loop;
 return cardinality(v_fields);
end $$;

create or replace function public.advisory_links_decision(p_links uuid[],p_status text) returns integer language plpgsql security definer set search_path=public as $$
declare v_links uuid[]; v_id uuid;
begin
 select array_agg(distinct id order by id) into v_links from unnest(p_links) as chosen(id);
 if coalesce(cardinality(v_links),0)=0 then raise exception 'Select at least one connection'; end if;
 perform id from public.advisory_links where id=any(v_links) order by id for update;
 foreach v_id in array v_links loop
  -- Existing per-field checks enforce who may accept, decline or revoke.
  perform public.advisory_link_decision(v_id,p_status);
 end loop;
 return cardinality(v_links);
end $$;

create or replace function public.advisory_save_scouting(p_field uuid,p_date date,p_category text,p_issue text,p_severity text,p_notes text,p_recommendation text,p_follow_up date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_id uuid;
begin
 if not public.advisory_write_field(p_field) then raise exception 'Active field advisory access required'; end if;
 if p_date is null or nullif(trim(p_issue),'') is null then raise exception 'Enter observation date and issue'; end if;
 if p_severity is null or p_severity not in ('Low','Medium','High','Critical') then raise exception 'Choose a severity'; end if;
 if p_follow_up<p_date then raise exception 'Follow-up must not precede the observation'; end if;
 select user_id into v_owner from public.fields where id=p_field;
 insert into public.scouting_observations(user_id,field_id,observation_date,category,issue_name,severity,notes,recommendation,follow_up_date,status,advisory_recorded_by)
 values(v_owner,p_field,p_date,coalesce(nullif(trim(p_category),''),'General'),trim(p_issue),p_severity,p_notes,p_recommendation,p_follow_up,'Open',auth.uid()) returning id into v_id;
 insert into public.advisory_events(field_id,actor_id,record_id,action) values(p_field,auth.uid(),v_id,'Scouting observation recorded');
 return v_id;
end $$;

create or replace function public.get_advisory_field_context(p_field uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare l public.advisory_links%rowtype; v_manager boolean; v_result jsonb:='{}';
begin
 if not public.advisory_read_field(p_field) then raise exception 'No access to this field'; end if;
 v_manager:=public.advisory_manage_field(p_field);
 select * into l from public.advisory_links where field_id=p_field and advisor_id=auth.uid() and status='Active';
 if v_manager or coalesce(l.share_plans,false) then v_result:=v_result||jsonb_build_object('plans',coalesce((select jsonb_agg(to_jsonb(p)) from public.activity_plans p where p.field_id=p_field),'[]')); end if;
 -- Authors can see their own observations even when older scouting history is not shared.
 v_result:=v_result||jsonb_build_object('scouting',coalesce((select jsonb_agg(to_jsonb(s)-'photo_url'-'photo_path' order by s.observation_date desc,s.created_at desc) from public.scouting_observations s where s.field_id=p_field and (v_manager or coalesce(l.share_scouting,false) or s.advisory_recorded_by=auth.uid())),'[]'));
 if v_manager or coalesce(l.share_yield,false) then v_result:=v_result||jsonb_build_object('harvest',coalesce((select jsonb_agg(jsonb_build_object('date',h.harvest_date,'tonnes',h.tonnes_harvested,'area_ha',h.area_ha,'crop',h.crop,'season',h.season)) from public.harvest_records h where h.field_id=p_field),'[]')); end if;
 return v_result;
end $$;

revoke all on function public.advisory_invite_fields(uuid,text,uuid[],boolean,boolean,boolean,boolean) from public,anon;
revoke all on function public.advisory_links_decision(uuid[],text) from public,anon;
revoke all on function public.advisory_save_scouting(uuid,date,text,text,text,text,text,date) from public,anon;
revoke all on function public.get_advisory_field_context(uuid) from public,anon;
grant execute on function public.advisory_invite_fields(uuid,text,uuid[],boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.advisory_links_decision(uuid[],text) to authenticated;
grant execute on function public.advisory_save_scouting(uuid,date,text,text,text,text,text,date) to authenticated;
grant execute on function public.get_advisory_field_context(uuid) to authenticated;
commit;
