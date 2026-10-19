-- AGCORE v6.12.1: repair transfer receipt on databases missing the catalogue link.

alter table public.inventory_items add column if not exists master_product_id uuid;

do $$ begin
  if to_regclass('public.master_products') is not null and not exists(
    select 1 from pg_constraint where conrelid='public.inventory_items'::regclass and conname='inventory_items_master_product_id_fkey'
  ) then
    alter table public.inventory_items add constraint inventory_items_master_product_id_fkey
      foreign key(master_product_id) references public.master_products(id) on delete restrict;
  end if;
end $$;

create index if not exists inventory_items_master_product_idx on public.inventory_items(master_product_id);

create or replace function public.receive_inventory_transfer(p_transfer_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_transfer public.inventory_transfers%rowtype;v_line public.inventory_transfer_lines%rowtype;v_source public.inventory_items%rowtype;v_target public.inventory_items%rowtype;v_qty numeric;
begin
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id and user_id=auth.uid() for update;
  if not found then raise exception 'Transfer not found or access denied';end if;
  if v_transfer.status<>'Dispatched' then raise exception 'Only a dispatched transfer can be received';end if;

  for v_line in select * from public.inventory_transfer_lines where transfer_id=p_transfer_id and user_id=auth.uid() loop
    select * into v_source from public.inventory_items where id=v_line.source_item_id and user_id=auth.uid();
    if not found then raise exception 'The source inventory item could not be found';end if;
    v_qty:=coalesce(v_line.quantity_received,v_line.quantity_dispatched);

    select i.* into v_target from public.inventory_items i
    where i.user_id=auth.uid() and i.location_id=v_transfer.to_location_id and i.status<>'Inactive'
      and i.season is not distinct from v_source.season
      and (
        (v_source.master_product_id is not null and i.master_product_id=v_source.master_product_id)
        or (lower(trim(i.name))=lower(trim(v_source.name)))
      )
      and i.unit=v_source.unit
      and coalesce(i.batch_number,'')=coalesce(v_source.batch_number,'')
    order by case when i.master_product_id=v_source.master_product_id then 0 else 1 end,i.created_at
    limit 1 for update;

    if not found then
      insert into public.inventory_items(user_id,season,master_product_id,name,category,unit,quantity,minimum_quantity,unit_cost,supplier,batch_number,expiry_date,location,location_id,status,notes,owner_type,owner_name,stock_status)
      select auth.uid(),v_source.season,v_source.master_product_id,v_source.name,v_source.category,v_source.unit,v_qty,v_source.minimum_quantity,v_source.unit_cost,v_source.supplier,v_source.batch_number,v_source.expiry_date,l.name,l.id,'Active','Created from inventory transfer',v_source.owner_type,v_source.owner_name,'Available'
      from public.inventory_locations l where l.id=v_transfer.to_location_id returning * into v_target;
    else
      update public.inventory_items set quantity=quantity+v_qty,unit_cost=coalesce(v_source.unit_cost,unit_cost) where id=v_target.id returning * into v_target;
    end if;

    update public.inventory_transfer_lines set quantity_received=v_qty where id=v_line.id;
    insert into public.inventory_transactions(user_id,inventory_item_id,transaction_date,transaction_type,quantity,unit_cost,reference,notes,season,location_id)
    values(auth.uid(),v_target.id,current_date,'Transfer In',v_qty,v_source.unit_cost,coalesce(v_transfer.reference,'TRANSFER-'||left(p_transfer_id::text,8)),'Received from inventory location',v_source.season,v_transfer.to_location_id);
  end loop;

  update public.inventory_transfers set status='Received',received_at=now() where id=p_transfer_id;
end $$;

grant execute on function public.receive_inventory_transfer(uuid) to authenticated;
