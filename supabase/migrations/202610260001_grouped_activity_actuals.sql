-- Grouped, date-ranged activity actuals. The existing single-plan RPC continues
-- to own stock validation, negative-stock alerts, and per-field transactions.
alter table public.activity_plans
  add column if not exists actual_start_date date,
  add column if not exists actual_end_date date;

update public.activity_plans
set actual_start_date = coalesce(actual_start_date, actual_date),
    actual_end_date = coalesce(actual_end_date, actual_date)
where status = 'Actualised' and actual_date is not null;

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
  v_operation jsonb;
  v_plan public.activity_plans%rowtype;
  v_source public.activity_plans%rowtype;
  v_op public.activity_plan_operations%rowtype;
  v_actual_total numeric;
  v_count integer := 0;
  v_payload jsonb;
  v_note text;
begin
  if p_actual_start_date is null or p_actual_end_date is null or p_actual_end_date < p_actual_start_date then
    raise exception 'Enter a valid actual date range';
  end if;
  if jsonb_typeof(p_plans) <> 'array' or jsonb_array_length(p_plans) = 0 then
    raise exception 'Select at least one field';
  end if;

  for v_entry in select value from jsonb_array_elements(p_plans) loop
    select * into v_plan from public.activity_plans
    where id = (v_entry->>'plan_id')::uuid and user_id = auth.uid()
    for update;
    if not found then raise exception 'Activity plan not found or access denied'; end if;
    if v_plan.status <> 'Planned' then raise exception 'One of the selected activities has already been actualised'; end if;

    if v_count = 0 then
      v_source := v_plan;
    elsif v_plan.season is distinct from v_source.season
       or v_plan.activity_type is distinct from v_source.activity_type then
      raise exception 'Selected activities must have the same activity and season';
    end if;

    v_payload := coalesce(v_entry->'products','[]'::jsonb);
    v_note := concat(coalesce(p_actual_notes,'Actual confirmed from Farm Planning'),
      ' · actual period ',p_actual_start_date,' to ',p_actual_end_date);

    -- This existing RPC handles product stock movements and preserves the
    -- established negative-stock and inventory-alert behavior. The enclosing
    -- function call remains atomic across all selected fields.
    perform public.actualise_activity_plan_v2(
      v_plan.id, p_actual_end_date, v_payload, v_note
    );

    -- The legacy RPC actualises every planned operation automatically. Replace
    -- that with the operator's explicit selection and actual rate.
    for v_op in select * from public.activity_plan_operations
      where plan_id = v_plan.id and user_id = auth.uid() for update loop
      select ops.value into v_operation
      from jsonb_array_elements(coalesce(v_entry->'operations','[]'::jsonb)) as ops(value)
      where ops.value->>'id' = v_op.id::text
      limit 1;
      if found then
        if coalesce((v_operation->>'rate')::numeric,0) < 0 then
          raise exception 'Operation rate cannot be negative';
        end if;
        update public.activity_plan_operations set
          actual_rate_per_ha = coalesce((v_operation->>'rate')::numeric,0),
          actual_quantity = coalesce((v_operation->>'rate')::numeric,0) * v_plan.planned_area_ha,
          actual_unit_price = planned_unit_price,
          actual_cost = round(coalesce((v_operation->>'rate')::numeric,0) * v_plan.planned_area_ha * planned_unit_price,2)
        where id = v_op.id;
      else
        update public.activity_plan_operations set actual_rate_per_ha=null,
          actual_quantity=null,actual_unit_price=null,actual_cost=null where id=v_op.id;
      end if;
    end loop;

    select coalesce(sum(actual_cost),0) into v_actual_total
    from public.activity_plan_products where plan_id=v_plan.id and user_id=auth.uid();
    select v_actual_total + coalesce(sum(actual_cost),0) into v_actual_total
    from public.activity_plan_operations where plan_id=v_plan.id and user_id=auth.uid();

    update public.activity_plans set
      actual_start_date=p_actual_start_date,
      actual_end_date=p_actual_end_date,
      actual_notes=v_note,
      actual_total=v_actual_total,
      updated_at=now()
    where id=v_plan.id and user_id=auth.uid();
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('actualised_count',v_count,
    'actual_start_date',p_actual_start_date,'actual_end_date',p_actual_end_date);
end;
$$;

grant execute on function public.actualise_activity_group_v1(date,date,jsonb,text) to authenticated;
