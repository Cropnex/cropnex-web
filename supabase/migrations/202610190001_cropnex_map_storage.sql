-- Create a private bucket for CropNex map uploads.
insert into storage.buckets (id, name, public)
values ('cropnex-layers', 'cropnex-layers', false)
on conflict (id) do nothing;

drop policy if exists cropnex_layers_select on storage.objects;
create policy cropnex_layers_select on storage.objects
  for select to authenticated
  using (bucket_id = 'cropnex-layers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cropnex_layers_insert on storage.objects;
create policy cropnex_layers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cropnex-layers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cropnex_layers_delete on storage.objects;
create policy cropnex_layers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'cropnex-layers' and (storage.foldername(name))[1] = auth.uid()::text);
