export type GrainPosition = {
  id: string;
  user_id?: string;
  created_at?: string;
  season: string;
  commodity: string;
  position_type: string;
  contract_date: string | null;
  delivery_month: string | null;
  tonnes: number;
  price_per_tonne: number | null;
  strike_price: number | null;
  premium_per_tonne: number | null;
  buyer_or_broker: string | null;
  reference: string | null;
  status: string;
  notes: string | null;
};

export type ProductionForecast = {
  id: string;
  user_id?: string;
  created_at?: string;
  season: string;
  commodity: string;
  expected_tonnes: number;
  notes: string | null;
};

