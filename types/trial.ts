export type Trial = {
  id: string; user_id: string; field_id: string; season: string; name: string;
  crop: string | null; cultivar: string | null; objective: string | null;
  start_date: string | null; end_date: string | null;
  crop_price_per_tonne: number; notes: string | null; created_at: string;
};
export type TrialStrip = {
  id: string; trial_id: string; user_id: string; strip_name: string;
  description: string | null; area_ha: number; operation_cost_per_ha: number;
  harvested: boolean; tonnes: number; moisture: number | null;
  record_date: string | null; notes: string | null; yield_source: string;
  treatment_id: string | null;
};
export type TrialInput = {
  id: string; trial_id: string; user_id: string; strip_id: string | null;
  input_type: string; product_name: string; rate: number; rate_unit: string;
  unit_price: number; notes: string | null; legacy_template?: boolean;
};
export type TrialVisit = {
  id: string; trial_id: string; user_id: string; visit_date: string;
  title: string; notes: string | null; created_at: string;
};
export type TrialPhoto = {
  id: string; trial_id: string; user_id: string; object_path: string;
  caption: string | null; visit_id: string | null; strip_id: string | null;
  taken_date: string | null; url?: string;
};
export type TrialDetails = {
  strips: TrialStrip[]; inputs: TrialInput[]; visits: TrialVisit[]; photos: TrialPhoto[];
};
