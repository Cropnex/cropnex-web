"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type {
  FieldBudget,
  FinancialTransaction,
} from "@/types/financial";
import { useSeason } from "@/components/season/SeasonProvider";

type CropRevenueForecast = {
  season: string;
  crop: string;
  expected_tonnes: number;
  contract_tonnes: number;
  estimated_tonnes: number;
  manual_price_per_tonne: number | null;
  forecast_income: number;
  weighted_price_per_tonne: number | null;
};
type FieldPerformance={field_id:string;field_name:string;crop:string|null;area_ha:number;activity_count:number;total_cost:number;projected_tonnes:number;projected_income:number;projected_margin:number;average_price_per_tonne:number};
type CommitmentSummary={source:string;category:string;name:string;season:string|null;seasonal_amount:number};
type BusinessCommitment={id:string;name:string;category:string;amount:number;frequency:string;season:string|null;active:boolean};

const emptyTransaction = {
  field_id: "",
  transaction_date: "",
  transaction_type: "Expense",
  category: "Seed",
  description: "",
  quantity: "",
  unit: "",
  unit_price: "",
  amount: "",
  supplier_or_customer: "",
  reference: "",
  notes: "",
};

const emptyBudget = {
  field_id: "",
  season: "2026/2027",
  expected_yield: "",
  expected_price: "",
  budgeted_cost_per_ha: "",
  notes: "",
};
const emptyCommitment={name:"",category:"Living expenses",amount:"",frequency:"Monthly",season:"2026/2027",notes:""};

export default function FinancialsPage() {
  const{currentSeason}=useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [transactions, setTransactions] =
    useState<FinancialTransaction[]>([]);
  const [budgets, setBudgets] = useState<FieldBudget[]>([]);
  const [cropForecasts, setCropForecasts] = useState<CropRevenueForecast[]>([]);
  const [performance,setPerformance]=useState<FieldPerformance[]>([]);
  const [commitmentSummary,setCommitmentSummary]=useState<CommitmentSummary[]>([]);
  const [commitments,setCommitments]=useState<BusinessCommitment[]>([]);
  const [transactionForm, setTransactionForm] =
    useState(emptyTransaction);
  const [budgetForm, setBudgetForm] = useState(emptyBudget);
  const [commitmentForm,setCommitmentForm]=useState(emptyCommitment);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    if(!currentSeason)return;
    const [fieldsResult, transactionsResult, budgetsResult, cropForecastResult,performanceResult,commitmentSummaryResult,commitmentsResult] =
      await Promise.all([
        supabase.from("fields").select("*").eq("season",currentSeason).order("field_name"),
        supabase
          .from("financial_transactions")
          .select("*")
          .order("transaction_date", { ascending: false }),
        supabase
          .from("field_budgets")
          .select("*")
          .eq("season",currentSeason)
          .order("season", { ascending: false }),
        supabase
          .from("crop_revenue_forecast")
          .select("*")
          .eq("season",currentSeason)
          .order("season", { ascending: false }),
        supabase.from("field_performance_report").select("*").eq("season",currentSeason).order("field_name"),
        supabase.from("business_commitment_summary").select("*").order("category"),
        supabase.from("business_commitments").select("*").order("created_at",{ascending:false}),
      ]);

    if (fieldsResult.error) alert(fieldsResult.error.message);
    if (transactionsResult.error) alert(transactionsResult.error.message);
    if (budgetsResult.error) alert(budgetsResult.error.message);

    const activeFields=(fieldsResult.data || []) as Field[];const activeFieldIds=new Set(activeFields.map(field=>field.id));
    setFields(activeFields);
    setTransactions(((transactionsResult.data || []) as FinancialTransaction[]).filter(row=>row.field_id&&activeFieldIds.has(row.field_id)));
    setBudgets((budgetsResult.data || []) as FieldBudget[]);
    setCropForecasts((cropForecastResult.data || []) as CropRevenueForecast[]);
    setPerformance((performanceResult.data||[]) as FieldPerformance[]);
    setCommitmentSummary((commitmentSummaryResult.data||[]) as CommitmentSummary[]);
    setCommitments((commitmentsResult.data||[]) as BusinessCommitment[]);
  }

  async function saveCommitment(){if(!commitmentForm.name.trim()||Number(commitmentForm.amount)<=0){alert("Enter a name and amount.");return}setSaving(true);try{const{data}=await supabase.auth.getUser();if(!data.user)return alert("You must be logged in.");const{error}=await supabase.from("business_commitments").insert({user_id:data.user.id,name:commitmentForm.name.trim(),category:commitmentForm.category,amount:Number(commitmentForm.amount),frequency:commitmentForm.frequency,season:commitmentForm.season.trim()||null,notes:commitmentForm.notes.trim()||null});if(error)throw error;setCommitmentForm(emptyCommitment);await loadAll()}catch(error){alert(error instanceof Error?error.message:"The commitment could not be saved.")}finally{setSaving(false)}}

  async function saveTransaction() {
    if (
      !transactionForm.transaction_date ||
      !transactionForm.description.trim() ||
      !transactionForm.amount
    ) {
      alert("Enter a date, description and amount.");
      return;
    }

    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const calculatedAmount =
        transactionForm.quantity && transactionForm.unit_price
          ? Number(transactionForm.quantity) *
            Number(transactionForm.unit_price)
          : Number(transactionForm.amount);

      const { error } = await supabase
        .from("financial_transactions")
        .insert({
          user_id: data.user.id,
          field_id: transactionForm.field_id || null,
          transaction_date: transactionForm.transaction_date,
          transaction_type: transactionForm.transaction_type,
          category: transactionForm.category,
          description: transactionForm.description.trim(),
          quantity: transactionForm.quantity
            ? Number(transactionForm.quantity)
            : null,
          unit: transactionForm.unit.trim() || null,
          unit_price: transactionForm.unit_price
            ? Number(transactionForm.unit_price)
            : null,
          amount: calculatedAmount,
          supplier_or_customer:
            transactionForm.supplier_or_customer.trim() || null,
          reference: transactionForm.reference.trim() || null,
          notes: transactionForm.notes.trim() || null,
        });

      if (error) {
        alert(error.message);
        return;
      }

      setTransactionForm(emptyTransaction);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function saveBudget() {
    if (!budgetForm.field_id) {
      alert("Select a field.");
      return;
    }

    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const payload = {
        user_id: data.user.id,
        field_id: budgetForm.field_id,
        season: budgetForm.season.trim() || null,
        expected_yield: budgetForm.expected_yield
          ? Number(budgetForm.expected_yield)
          : null,
        expected_price: budgetForm.expected_price
          ? Number(budgetForm.expected_price)
          : null,
        budgeted_cost_per_ha: budgetForm.budgeted_cost_per_ha
          ? Number(budgetForm.budgeted_cost_per_ha)
          : null,
        notes: budgetForm.notes.trim() || null,
      };

      const { error } = await supabase
        .from("field_budgets")
        .upsert(payload, {
          onConflict: "user_id,field_id,season",
        });

      if (error) {
        alert(error.message);
        return;
      }

      setBudgetForm(emptyBudget);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [currentSeason]);

  const totals = useMemo(() => {
    const income = transactions
      .filter((item) => item.transaction_type === "Income")
      .reduce((sum, item) => sum + item.amount, 0);

    const expenses = transactions
      .filter((item) => item.transaction_type === "Expense")
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      income,
      expenses,
      grossMargin: income - expenses,
    };
  }, [transactions]);

  const fieldSummaries = fields.map((field) => {
    const report=performance.find(item=>item.field_id===field.id);
    const fieldTransactions = transactions.filter(
      (item) => item.field_id === field.id
    );

    const income = fieldTransactions
      .filter((item) => item.transaction_type === "Income")
      .reduce((sum, item) => sum + item.amount, 0);

    const expenses = fieldTransactions
      .filter((item) => item.transaction_type === "Expense")
      .reduce((sum, item) => sum + item.amount, 0);

    const budget = budgets.find(
      (item) => item.field_id === field.id
    );

    const expectedRevenue =
      budget?.expected_yield && budget?.expected_price
        ? budget.expected_yield *
          budget.expected_price *
          field.area_ha
        : null;

    const budgetedCost =
      budget?.budgeted_cost_per_ha
        ? budget.budgeted_cost_per_ha * field.area_ha
        : null;

    return {
      field,
      income:Number(report?.projected_income??income),
      expenses:Number(report?.total_cost??expenses),
      margin:Number(report?.projected_margin??(income-expenses)),
      projectedTonnes:Number(report?.projected_tonnes||0),
      averagePrice:Number(report?.average_price_per_tonne||0),
      expectedRevenue,
      budgetedCost,
      projectedMargin:
        expectedRevenue !== null && budgetedCost !== null
          ? expectedRevenue - budgetedCost
          : null,
    };
  });

  const forecastIncome = cropForecasts.reduce(
    (sum, row) => sum + Number(row.forecast_income || 0),
    0
  );
  const projectedFieldCosts=performance.reduce((sum,row)=>sum+Number(row.total_cost||0),0);
  const businessCommitmentCost=commitmentSummary.reduce((sum,row)=>sum+Number(row.seasonal_amount||0),0);
  const businessProjectedMargin=forecastIncome-projectedFieldCosts-businessCommitmentCost;

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Business & Finance
          </h1>
          <p className="mt-2 text-gray-400">
            Track income, expenses, budgets and gross margin per field.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Projected crop income"
          value={`R${forecastIncome.toFixed(2)}`}
        />
        <Summary
          label="Field operating costs"
          value={`R${projectedFieldCosts.toFixed(2)}`}
        />
        <Summary
          label="Business commitments"
          value={`R${businessCommitmentCost.toFixed(2)}`}
        />
        <Summary
          label="Projected business margin"
          value={`R${businessProjectedMargin.toFixed(2)}`}
        />
      </div>

      {cropForecasts.length > 0 && (
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-bold text-green-400">Contract and planning-price forecast</h2>
          <p className="mt-2 text-sm text-gray-400">Signed contracts price the first tonnes. The editable crop planning price estimates the remaining expected production.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cropForecasts.map((row) => (
              <article key={`${row.season}-${row.crop}`} className="rounded-xl bg-black/20 p-4">
                <div className="flex justify-between gap-3"><b>{row.crop}</b><span className="text-xs text-gray-500">{row.season}</span></div>
                <p className="mt-3 text-xl font-black text-green-400">R {Number(row.forecast_income).toLocaleString("en-ZA", {maximumFractionDigits: 0})}</p>
                <p className="mt-2 text-xs text-gray-400">{Number(row.contract_tonnes).toFixed(1)} t contracted · {Number(row.estimated_tonnes).toFixed(1)} t estimated</p>
                <p className="mt-1 text-xs text-gray-500">Weighted price: R {Number(row.weighted_price_per_tonne || 0).toFixed(2)}/t</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-5 text-2xl font-bold text-green-400">
            New Financial Transaction
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Field"
              value={transactionForm.field_id}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  field_id: value,
                })
              }
            >
              <option value="">General / unallocated</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.field_name}
                </option>
              ))}
            </Select>

            <Input
              label="Date"
              type="date"
              value={transactionForm.transaction_date}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  transaction_date: value,
                })
              }
            />

            <Select
              label="Type"
              value={transactionForm.transaction_type}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  transaction_type: value,
                })
              }
            >
              <option>Expense</option>
              <option>Income</option>
            </Select>

            <Select
              label="Category"
              value={transactionForm.category}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  category: value,
                })
              }
            >
              {[
                "Seed",
                "Fertiliser",
                "Chemical",
                "Diesel",
                "Labour",
                "Machinery",
                "Repairs",
                "Insurance",
                "Crop Sale",
                "Other",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>

            <Input
              label="Description"
              value={transactionForm.description}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  description: value,
                })
              }
            />

            <Input
              label="Amount (R)"
              type="number"
              value={transactionForm.amount}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  amount: value,
                })
              }
            />

            <Input
              label="Quantity"
              type="number"
              value={transactionForm.quantity}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  quantity: value,
                })
              }
            />

            <Input
              label="Unit"
              value={transactionForm.unit}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  unit: value,
                })
              }
            />

            <Input
              label="Unit price (R)"
              type="number"
              value={transactionForm.unit_price}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  unit_price: value,
                })
              }
            />

            <Input
              label="Supplier / customer"
              value={transactionForm.supplier_or_customer}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  supplier_or_customer: value,
                })
              }
            />

            <Input
              label="Reference"
              value={transactionForm.reference}
              onChange={(value) =>
                setTransactionForm({
                  ...transactionForm,
                  reference: value,
                })
              }
            />
          </div>

          <textarea
            rows={3}
            value={transactionForm.notes}
            onChange={(event) =>
              setTransactionForm({
                ...transactionForm,
                notes: event.target.value,
              })
            }
            placeholder="Notes"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />

          <button
            type="button"
            onClick={saveTransaction}
            disabled={saving}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            Save Transaction
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-5 text-2xl font-bold text-green-400">
            Field Budget
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Field"
              value={budgetForm.field_id}
              onChange={(value) =>
                setBudgetForm({ ...budgetForm, field_id: value })
              }
            >
              <option value="">Select field</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.field_name}
                </option>
              ))}
            </Select>

            <Input
              label="Season"
              value={budgetForm.season}
              onChange={(value) =>
                setBudgetForm({ ...budgetForm, season: value })
              }
            />

            <Input
              label="Expected yield (t/ha)"
              type="number"
              value={budgetForm.expected_yield}
              onChange={(value) =>
                setBudgetForm({
                  ...budgetForm,
                  expected_yield: value,
                })
              }
            />

            <Input
              label="Expected price (R/t)"
              type="number"
              value={budgetForm.expected_price}
              onChange={(value) =>
                setBudgetForm({
                  ...budgetForm,
                  expected_price: value,
                })
              }
            />

            <Input
              label="Budgeted cost (R/ha)"
              type="number"
              value={budgetForm.budgeted_cost_per_ha}
              onChange={(value) =>
                setBudgetForm({
                  ...budgetForm,
                  budgeted_cost_per_ha: value,
                })
              }
            />
          </div>

          <textarea
            rows={3}
            value={budgetForm.notes}
            onChange={(event) =>
              setBudgetForm({
                ...budgetForm,
                notes: event.target.value,
              })
            }
            placeholder="Budget notes"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />

          <button
            type="button"
            onClick={saveBudget}
            disabled={saving}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            Save Budget
          </button>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-2xl font-bold text-green-400">Business commitments</h2>
        <p className="mt-2 text-sm text-gray-400">Add costs not tied to a field, such as living expenses, insurance, rent, salaries and loan repayments. Equipment installments entered on an equipment record are included automatically.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input label="Commitment" value={commitmentForm.name} onChange={value=>setCommitmentForm({...commitmentForm,name:value})}/>
          <Select label="Category" value={commitmentForm.category} onChange={value=>setCommitmentForm({...commitmentForm,category:value})}>{["Living expenses","Insurance","Rent","Salaries","Loan repayment","Other"].map(value=><option key={value}>{value}</option>)}</Select>
          <Input label="Amount (R)" type="number" value={commitmentForm.amount} onChange={value=>setCommitmentForm({...commitmentForm,amount:value})}/>
          <Select label="Frequency" value={commitmentForm.frequency} onChange={value=>setCommitmentForm({...commitmentForm,frequency:value})}>{["Monthly","Quarterly","Annual","Per season","Once-off"].map(value=><option key={value}>{value}</option>)}</Select>
          <Input label="Season" value={commitmentForm.season} onChange={value=>setCommitmentForm({...commitmentForm,season:value})}/>
        </div>
        <button type="button" onClick={saveCommitment} disabled={saving} className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50">Add commitment</button>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{commitmentSummary.map((item,index)=><article key={`${item.source}-${item.name}-${index}`} className="rounded-xl bg-black/20 p-4"><div className="flex justify-between gap-3"><div><b>{item.name}</b><p className="text-xs text-gray-500">{item.category} · {item.source}</p></div><strong className="text-green-400">R{Number(item.seasonal_amount).toLocaleString("en-ZA",{maximumFractionDigits:0})}</strong></div></article>)}{!commitmentSummary.length&&<p className="text-sm text-gray-400">No business commitments recorded yet.</p>}</div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">
          Field Profitability
        </h2>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {fieldSummaries.map((summary) => (
            <article
              key={summary.field.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <h3 className="text-2xl font-bold text-green-400">
                {summary.field.field_name}
              </h3>
              <p className="text-sm text-gray-400">
                {summary.field.crop || "No crop"} ·{" "}
                {summary.field.area_ha} ha
              </p>

              <div className="mt-5 space-y-3">
                <Row
                  label="Projected crop income"
                  value={`R${summary.income.toFixed(2)}`}
                />
                <Row
                  label="Plan / actual activity costs"
                  value={`R${summary.expenses.toFixed(2)}`}
                />
                <Row
                  label="Projected field margin"
                  value={`R${summary.margin.toFixed(2)}`}
                />
                <Row
                  label="Expected production"
                  value={`${summary.projectedTonnes.toFixed(2)} t`}
                />
                <Row
                  label="Blended price"
                  value={`R${summary.averagePrice.toFixed(2)}/t`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">
          Recent Transactions
        </h2>

        <div className="space-y-3">
          {transactions.slice(0, 20).map((transaction) => {
            const field = fields.find(
              (item) => item.id === transaction.field_id
            );

            return (
              <article
                key={transaction.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div>
                  <p className="font-bold text-green-400">
                    {transaction.description}
                  </p>
                  <p className="text-sm text-gray-400">
                    {transaction.transaction_date} ·{" "}
                    {field?.field_name || "General"} ·{" "}
                    {transaction.category}
                  </p>
                </div>

                <p
                  className={
                    transaction.transaction_type === "Income"
                      ? "font-bold text-green-400"
                      : "font-bold text-red-400"
                  }
                >
                  {transaction.transaction_type === "Income"
                    ? "+"
                    : "-"}
                  R{transaction.amount.toFixed(2)}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-green-400">
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">
        {label}
      </label>
      <input
        type={type}
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
      >
        {children}
      </select>
    </div>
  );
}
