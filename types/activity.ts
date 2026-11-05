export type Activity = {
  id: string;
  field_id?: string | null;
  season?: string | null;
  user_id?: string;
  activity_type: string;
  field_name: string;
  crop?: string | null;
  date: string;
  area_ha?: number | null;
  notes: string | null;
  created_at: string;
};
