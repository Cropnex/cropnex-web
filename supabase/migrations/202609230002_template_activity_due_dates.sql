-- Season-specific due dates for activities stored inside reusable field-plan templates.
alter table public.crop_template_activities
  add column if not exists due_date date;

create index if not exists crop_template_activities_template_due_idx
  on public.crop_template_activities(crop_template_id,due_date,sequence_no);
