export type WorkOrder = {
  id: string;
  user_id?: string;
  created_at?: string;
  title: string;
  field_id: string | null;
  field_name: string | null;
  activity_type: string;
  planned_date: string | null;
  operator_name: string | null;
  equipment_id: string | null;
  implement_name: string | null;
  estimated_hours: number | null;
  diesel_litres: number | null;
  status: string;
  notes: string | null;
  completed_at: string | null;
};

export type WorkOrderProduct = {
  id: string;
  work_order_id: string;
  inventory_item_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_cost: number | null;
};

