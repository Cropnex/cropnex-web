export type HarvestRecord = {
  id: string;
  user_id?: string;
  created_at?: string;
  field_id: string;
  harvest_date: string;
  crop: string | null;
  season: string | null;
  area_ha: number;
  tonnes_harvested: number;
  moisture_percent: number | null;
  quality_grade: string | null;
  destination_type: string | null;
  destination_name: string | null;
  price_per_tonne: number | null;
  transport_cost: number | null;
  other_cost: number | null;
  notes: string | null;
};

