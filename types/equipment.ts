export type Equipment = {
  id: string;
  user_id?: string;
  created_at?: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  registration: string | null;
  serial_number: string | null;
  year: number | null;
  purchase_date: string | null;
  purchase_price: number | null;
  engine_hours: number;
  service_interval: number | null;
  last_service_hours: number | null;
  fuel_type: string | null;
  status: string;
  notes: string | null;
  installment_amount: number | null;
  installment_frequency: string | null;
  finance_start_date: string | null;
  finance_term_seasons: number | null;
  finance_notes: string | null;
};

export type EquipmentFormValues = {
  name: string;
  category: string;
  brand: string;
  model: string;
  registration: string;
  serial_number: string;
  year: string;
  purchase_date: string;
  purchase_price: string;
  engine_hours: string;
  service_interval: string;
  last_service_hours: string;
  fuel_type: string;
  status: string;
  notes: string;
  installment_amount: string;
  installment_frequency: string;
  finance_start_date: string;
  finance_term_seasons: string;
  finance_notes: string;
};

export type EquipmentService = {
  id: string;
  equipment_id: string;
  service_date: string;
  engine_hours: number | null;
  description: string;
  cost: number | null;
  notes: string | null;
};
