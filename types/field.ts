export type Point = {
  lat: number;
  lng: number;
};

export type Field = {
  id: string;
  user_id?: string;
  created_at?: string;
  field_name: string;
  farm_name: string | null;
  crop: string | null;
  season: string | null;
  planting_date: string | null;
  cultivar: string | null;
  soil_type: string | null;
  expected_yield: number | null;
  status: string | null;
  area_ha: number;
  notes: string | null;
  boundary: Point[] | null;
  farmer_id?: string | null;
  farm_id?: string | null;
  cultivar_id?: string | null;
};

export type FieldFormValues = {
  field_name: string;
  farm_name: string;
  crop: string;
  season: string;
  planting_date: string;
  cultivar: string;
  soil_type: string;
  expected_yield: string;
  area_ha: string;
  status: string;
  notes: string;
};
