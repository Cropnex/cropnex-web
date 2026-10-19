export type FieldSummary = {
  fieldId: string;
  fieldName: string;
  crop: string;
  areaHa: number;
  activityCount: number;
  expenseTotal: number;
  incomeTotal: number;
  grossMargin: number;
  costPerHa: number;
};

export type CategoryTotal = {
  category: string;
  amount: number;
};

export type MonthlyTotal = {
  month: string;
  income: number;
  expenses: number;
};

