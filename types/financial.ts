export type FieldBudget = {
  id: string;
  user_id?: string;
  field_id: string;
  season: string | null;
  expected_yield: number | null;
  expected_price: number | null;
  budgeted_cost_per_ha: number | null;
  notes: string | null;
};

export type FinancialTransaction = {
  id: string;
  user_id?: string;
  field_id: string | null;
  transaction_date: string;
  transaction_type: "Income" | "Expense";
  category: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number;
  supplier_or_customer: string | null;
  reference: string | null;
  notes: string | null;
};

