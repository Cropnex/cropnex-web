"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { FinancialTransaction } from "@/types/financial";
import type { InventoryItem } from "@/types/inventory";
import type { Equipment } from "@/types/equipment";
import type { Activity } from "@/types/activity";
import type { WorkOrder } from "@/types/work-order";
import { useSeason } from "@/components/season/SeasonProvider";
import { downloadManagementWorkbook } from "@/lib/management-workbook";
import type {
  CategoryTotal,
  FieldSummary,
  MonthlyTotal,
} from "@/types/reports";
type HarvestLive={field_id:string;field_name:string;crop:string|null;cultivar:string|null;harvest_status:string;reconciled_tonnes:number;yield_t_ha:number;market_price_per_tonne:number;projected_income:number;costs:number;margin:number;finished:boolean;contract_tonnes:number;safex_tonnes:number;unpriced_tonnes:number;remaining_planned_cost:number;actualised_cost:number};
type FieldPerformance={field_id:string;field_name:string;crop:string|null;area_ha:number;activity_count:number;planning_cost:number;remaining_planned_cost:number;actualised_cost:number;additional_expenses:number;total_cost:number;harvested_tonnes:number;average_price_per_tonne:number;contract_tonnes:number;safex_tonnes:number;unpriced_tonnes:number;projected_income:number;projected_margin:number};
type CommitmentSummary={source:string;category:string;name:string;season:string|null;seasonal_amount:number};

export default function ReportsPage() {
  const{currentSeason}=useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] =
    useState<FinancialTransaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [harvestLive, setHarvestLive] = useState<HarvestLive[]>([]);
  const [performance,setPerformance] = useState<FieldPerformance[]>([]);
  const [commitmentSummary,setCommitmentSummary]=useState<CommitmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReports() {
    if(!currentSeason)return;
    setLoading(true);

    const fieldsResult = await supabase.from("fields").select("*").eq("season",currentSeason).order("field_name");
    const loadedFields=(fieldsResult.data||[]) as Field[];
    const priceGroups=new Map(loadedFields.filter(field=>field.user_id&&field.season&&field.crop).map(field=>[`${field.user_id}|${field.season}|${field.crop}`,field]));
    await Promise.all([...priceGroups.values()].map(field=>supabase.rpc("reprice_grain_harvest",{p_user_id:field.user_id,p_season:field.season,p_crop:field.crop})));
    const [
      activitiesResult,
      transactionsResult,
      inventoryResult,
      equipmentResult,
      jobsResult,
      harvestResult,
      performanceResult,
      commitmentsResult,
    ] = await Promise.all([
      supabase.from("activities").select("*").eq("season",currentSeason).order("date", {
        ascending: false,
      }),
      supabase
        .from("financial_transactions")
        .select("*")
        .order("transaction_date", { ascending: false }),
      supabase.from("inventory_items").select("*").eq("season",currentSeason).order("name"),
      supabase.from("equipment").select("*").order("name"),
      supabase
        .from("work_orders")
        .select("*")
        .order("planned_date", { ascending: false }),
      supabase.from("field_harvest_live_summary").select("*").eq("season",currentSeason).gt("reconciled_tonnes",0).order("finished").order("field_name"),
      supabase.from("field_performance_report").select("*").eq("season",currentSeason).order("field_name"),
      supabase.from("business_commitment_summary").select("*").order("category"),
    ]);

    const errors = [
      fieldsResult.error,
      activitiesResult.error,
      transactionsResult.error,
      inventoryResult.error,
      equipmentResult.error,
      jobsResult.error,
      harvestResult.error,
      performanceResult.error,
      commitmentsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error(errors);
      alert("Some report data could not be loaded.");
    }

    setFields(loadedFields);
    setActivities((activitiesResult.data || []) as Activity[]);
    const fieldIds=new Set(loadedFields.map(field=>field.id));
    setTransactions(((transactionsResult.data || []) as FinancialTransaction[]).filter(row=>row.field_id&&fieldIds.has(row.field_id)));
    setInventory((inventoryResult.data || []) as InventoryItem[]);
    setEquipment((equipmentResult.data || []) as Equipment[]);
    setJobs((jobsResult.data || []) as WorkOrder[]);
    setHarvestLive((harvestResult.data || []) as HarvestLive[]);
    setPerformance((performanceResult.data||[]) as FieldPerformance[]);
    setCommitmentSummary((commitmentsResult.data||[]) as CommitmentSummary[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadReports();
  }, [currentSeason]);

  const financialTotals = useMemo(() => {
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

  const fieldSummaries: FieldSummary[] = useMemo(() => {
    return fields.map((field) => {
      const report=performance.find(item=>item.field_id===field.id);
      const income=Number(report?.projected_income||0),expenses=Number(report?.total_cost||0);

      return {
        fieldId: field.id,
        fieldName: field.field_name,
        crop: field.crop || "Not specified",
        areaHa: field.area_ha,
        activityCount: Number(report?.activity_count||0),
        expenseTotal: expenses,
        incomeTotal: income,
        grossMargin: income - expenses,
        costPerHa: field.area_ha > 0 ? expenses / field.area_ha : 0,
      };
    });
  }, [fields, performance]);

  const projectedTotals=useMemo(()=>fieldSummaries.reduce((totals,row)=>({income:totals.income+row.incomeTotal,expenses:totals.expenses+row.expenseTotal,margin:totals.margin+row.grossMargin}),{income:0,expenses:0,margin:0}),[fieldSummaries]);
  const commitmentTotal=useMemo(()=>commitmentSummary.reduce((sum,row)=>sum+Number(row.seasonal_amount||0),0),[commitmentSummary]);
  const businessProjectedMargin=projectedTotals.margin-commitmentTotal;

  const categoryTotals: CategoryTotal[] = useMemo(() => {
    const totals = new Map<string, number>();

    transactions
      .filter((item) => item.transaction_type === "Expense")
      .forEach((item) => {
        totals.set(
          item.category,
          (totals.get(item.category) || 0) + item.amount
        );
      });

    return Array.from(totals.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const monthlyTotals: MonthlyTotal[] = useMemo(() => {
    const totals = new Map<string, MonthlyTotal>();

    transactions.forEach((item) => {
      const month = item.transaction_date.slice(0, 7);
      const current = totals.get(month) || {
        month,
        income: 0,
        expenses: 0,
      };

      if (item.transaction_type === "Income") {
        current.income += item.amount;
      } else {
        current.expenses += item.amount;
      }

      totals.set(month, current);
    });

    return Array.from(totals.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
  }, [transactions]);

  const stockValue = useMemo(() => {
    return inventory.reduce(
      (sum, item) => sum + item.quantity * (item.unit_cost || 0),
      0
    );
  }, [inventory]);

  const lowStockCount = inventory.filter(
    (item) =>
      item.minimum_quantity !== null &&
      item.quantity <= item.minimum_quantity
  ).length;

  const serviceDueCount = equipment.filter((item) => {
    if (
      item.service_interval === null ||
      item.last_service_hours === null
    ) {
      return item.status === "Service Due";
    }

    return (
      item.engine_hours - item.last_service_hours >=
        item.service_interval ||
      item.status === "Service Due"
    );
  }).length;

  const openJobs = jobs.filter(
    (job) => job.status !== "Completed"
  ).length;

  const completedJobs = jobs.filter(
    (job) => job.status === "Completed"
  ).length;

  const totalArea = fields.reduce(
    (sum, field) => sum + field.area_ha,
    0
  );

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Reports
          </h1>
          <p className="mt-2 text-gray-400">
            A consolidated view of farm performance, costs, stock and
            operations.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => downloadManagementWorkbook({ fields, activities, transactions, inventory, equipment })}
            disabled={loading}
            className="rounded-xl bg-[#83c341] px-5 py-3 font-bold text-[#07130e] disabled:opacity-50"
          >
            Export management workbook
          </button>
          <Link
            href="/reports/planning"
            className="rounded-xl border border-[#83c341]/30 bg-[#83c341]/10 px-5 py-3 font-bold text-[#a4df57]"
          >
            Field Cost Report
          </Link>
          <button
            type="button"
            onClick={loadReports}
            className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
          >
            Refresh Reports
          </button>

          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 px-5 py-3"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading reports...</p>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Summary
              label="Farmed area"
              value={`${totalArea.toFixed(2)} ha`}
              note={`${fields.length} fields`}
            />
            <Summary
              label="Projected business margin"
              value={`R${businessProjectedMargin.toFixed(2)}`}
              note={`Before commitments R${projectedTotals.margin.toFixed(2)}`}
            />
            <Summary
              label="Inventory value"
              value={`R${stockValue.toFixed(2)}`}
              note={`${lowStockCount} low-stock items`}
            />
            <Summary
              label="Open jobs"
              value={String(openJobs)}
              note={`${completedJobs} completed`}
            />
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <Panel title="Operational Alerts">
              <AlertRow
                label="Low-stock inventory"
                value={String(lowStockCount)}
                warning={lowStockCount > 0}
              />
              <AlertRow
                label="Equipment service due"
                value={String(serviceDueCount)}
                warning={serviceDueCount > 0}
              />
              <AlertRow
                label="Open job cards"
                value={String(openJobs)}
                warning={openJobs > 0}
              />
              <AlertRow
                label="Activities recorded"
                value={String(activities.length)}
              />
            </Panel>

            <Panel title="Projected Field Economics">
              <MetricRow
                label="Contract + SAFEX income"
                value={`R${projectedTotals.income.toFixed(2)}`}
              />
              <MetricRow
                label="Planned/actual activity costs"
                value={`R${projectedTotals.expenses.toFixed(2)}`}
              />
              <MetricRow
                label="Projected gross margin"
                value={`R${projectedTotals.margin.toFixed(2)}`}
              />
              <MetricRow
                label="Equipment + business commitments"
                value={`R${commitmentTotal.toFixed(2)}`}
              />
              <MetricRow
                label="Projected business margin"
                value={`R${businessProjectedMargin.toFixed(2)}`}
              />
              <MetricRow
                label="Average cost per field"
                value={
                  fields.length > 0
                    ? `R${(
                        projectedTotals.expenses / fields.length
                      ).toFixed(2)}`
                    : "R0.00"
                }
              />
            </Panel>
          </section>

          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-bold">Live Harvest Performance</h2>
            <div className="grid gap-4 lg:grid-cols-2">{harvestLive.map(item=><article key={item.field_id} className={`rounded-2xl border p-5 ${item.finished?"border-green-400/50 bg-green-400/10":"border-amber-300/20 bg-amber-300/[.05]"}`}><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold">{item.field_name}</h3><p className="text-sm text-gray-400">{item.crop||"Crop not set"}{item.cultivar?` · ${item.cultivar}`:""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${item.finished?"bg-green-400 text-black":"bg-amber-300 text-black"}`}>{item.finished?"FINISHED":"IN PROGRESS"}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><HarvestMetric label="Tonnes" value={`${Number(item.reconciled_tonnes).toFixed(2)} t`}/><HarvestMetric label="Yield" value={`${Number(item.yield_t_ha).toFixed(2)} t/ha`}/><HarvestMetric label="Blended price" value={`R${Number(item.market_price_per_tonne).toLocaleString("en-ZA",{maximumFractionDigits:0})}/t`}/><HarvestMetric label="Projected income" value={`R${Number(item.projected_income).toLocaleString("en-ZA",{maximumFractionDigits:0})}`}/><HarvestMetric label="Plan/actual costs" value={`R${Number(item.costs).toLocaleString("en-ZA",{maximumFractionDigits:0})}`}/><HarvestMetric label="Projected margin" value={`R${Number(item.margin).toLocaleString("en-ZA",{maximumFractionDigits:0})}`}/></div><p className="mt-3 text-xs text-gray-500">Income: {Number(item.contract_tonnes||0).toFixed(1)} t contracts · {Number(item.safex_tonnes||0).toFixed(1)} t SAFEX{Number(item.unpriced_tonnes||0)>0?` · ${Number(item.unpriced_tonnes).toFixed(1)} t unpriced`:""}. Costs: R{Number(item.actualised_cost||0).toLocaleString("en-ZA",{maximumFractionDigits:0})} actualised + R{Number(item.remaining_planned_cost||0).toLocaleString("en-ZA",{maximumFractionDigits:0})} still planned.</p></article>)}{!harvestLive.length&&<p className="text-sm text-gray-400">Reconciled Transport Log loads will appear here automatically.</p>}</div>
          </section>

          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-bold">
              Field Performance
            </h2>

            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Field</th>
                    <th className="px-4 py-3">Crop</th>
                    <th className="px-4 py-3">Area</th>
                    <th className="px-4 py-3">Activities</th>
                    <th className="px-4 py-3">Income</th>
                    <th className="px-4 py-3">Expenses</th>
                    <th className="px-4 py-3">Cost/ha</th>
                    <th className="px-4 py-3">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldSummaries.map((summary) => { const source=performance.find(item=>item.field_id===summary.fieldId); return (
                    <tr
                      key={summary.fieldId}
                      className="border-b border-white/5"
                    >
                      <td className="px-4 py-3 font-bold text-green-400">
                        {summary.fieldName}
                      </td>
                      <td className="px-4 py-3">{summary.crop}</td>
                      <td className="px-4 py-3">
                        {summary.areaHa.toFixed(2)} ha
                      </td>
                      <td className="px-4 py-3">
                        {summary.activityCount}
                      </td>
                      <td className="px-4 py-3">
                        R{summary.incomeTotal.toFixed(2)}
                        {source&&Number(source.harvested_tonnes)>0&&<p className="mt-1 text-[10px] text-gray-500">{Number(source.contract_tonnes).toFixed(1)} t contract · {Number(source.safex_tonnes).toFixed(1)} t SAFEX{Number(source.unpriced_tonnes)>0?` · ${Number(source.unpriced_tonnes).toFixed(1)} t unpriced`:""}</p>}
                      </td>
                      <td className="px-4 py-3">
                        R{summary.expenseTotal.toFixed(2)}
                        {source&&<p className="mt-1 text-[10px] text-gray-500">R{Number(source.actualised_cost).toFixed(0)} actual · R{Number(source.remaining_planned_cost).toFixed(0)} planned</p>}
                      </td>
                      <td className="px-4 py-3">
                        R{summary.costPerHa.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-3 font-bold ${
                          summary.grossMargin >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        R{summary.grossMargin.toFixed(2)}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <Panel title="Expenses by Category">
              {categoryTotals.length === 0 ? (
                <p className="text-gray-400">
                  No expense data recorded.
                </p>
              ) : (
                <div className="space-y-3">
                  {categoryTotals.map((item) => {
                    const percentage =
                      financialTotals.expenses > 0
                        ? (item.amount /
                            financialTotals.expenses) *
                          100
                        : 0;

                    return (
                      <div key={item.category}>
                        <div className="mb-1 flex justify-between gap-4 text-sm">
                          <span>{item.category}</span>
                          <span>
                            R{item.amount.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/40">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{
                              width: `${Math.min(
                                percentage,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Monthly Cash Flow">
              {monthlyTotals.length === 0 ? (
                <p className="text-gray-400">
                  No monthly data recorded.
                </p>
              ) : (
                <div className="space-y-3">
                  {monthlyTotals.map((item) => (
                    <div
                      key={item.month}
                      className="rounded-xl bg-black/20 p-4"
                    >
                      <p className="font-bold text-green-400">
                        {item.month}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                        <MetricSmall
                          label="Income"
                          value={`R${item.income.toFixed(2)}`}
                        />
                        <MetricSmall
                          label="Expenses"
                          value={`R${item.expenses.toFixed(2)}`}
                        />
                        <MetricSmall
                          label="Net"
                          value={`R${(
                            item.income - item.expenses
                          ).toFixed(2)}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </section>
        </>
      )}
    </main>
  );
}

function HarvestMetric({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-gray-400">{label}</p><b className="mt-1 block">{value}</b></div>}

function Summary({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-green-400">
        {value}
      </p>
      <p className="mt-2 text-sm text-gray-400">{note}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="mb-5 text-2xl font-bold text-green-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="mb-3 flex justify-between gap-4 rounded-xl bg-black/20 p-4">
      <span className="text-gray-400">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function AlertRow({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="mb-3 flex justify-between gap-4 rounded-xl bg-black/20 p-4">
      <span className="text-gray-300">{label}</span>
      <span
        className={
          warning ? "font-bold text-amber-400" : "font-bold text-green-400"
        }
      >
        {value}
      </span>
    </div>
  );
}

function MetricSmall({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
