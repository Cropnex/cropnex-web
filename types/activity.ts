export type Activity = {
  id: string;
  user_id?: string;
  activity_type: string;
  field_name: string;
  crop?: string | null;
  date: string;
  area_ha?: number | null;
  notes: string | null;
  created_at: string;
};
