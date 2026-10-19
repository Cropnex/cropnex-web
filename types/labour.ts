export type Employee = {
  id: string;
  user_id?: string;
  created_at?: string;
  full_name: string;
  role: string;
  phone: string | null;
  email: string | null;
  hourly_rate: number | null;
  employment_type: string;
  status: string;
  notes: string | null;
};

export type LabourEntry = {
  id: string;
  user_id?: string;
  employee_id: string;
  field_id: string | null;
  work_order_id: string | null;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  activity_type: string | null;
  description: string | null;
  hourly_rate: number | null;
  total_cost: number | null;
  notes: string | null;
};

