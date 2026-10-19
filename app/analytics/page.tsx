"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { FinancialTransaction } from "@/types/financial";
import type { InventoryItem } from "@/types/inventory";
import type { Equipment } from "@/types/equipment";
import type { WorkOrder } from "@/types/work-order";
import type { HarvestRecord } from "@/types/harvest";
import { useSeason } from "@/components/season/SeasonProvider";

type MonthlyPoint = {
  month: string;
  income: number;
  expenses: number;
};

type CropArea = {
  crop: string;
  area: number;
};

type FieldProfit = {
  name: string;
  margin: number;
};

export default function AnalyticsPage() {
  const { currentSeason } = useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [transactions, setTransactions] = useState<
    FinancialTransaction[]
  >([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [harvests, setHarvests] = useState<HarvestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);

    const [
      fieldsResult,
      transactionsResult,
      inventoryResult,
      equipmentResult,
      jobsResult,
      harvestsResult,
    ] = await Promise.all([
      supabase.from("fields").select("*").eq("season", currentSeason),
      supabase.from("financial_transactions").select("*"),
      supabase.from("inventory_items").select("*").eq("season", currentSeason),
      supabase.from("equipment").select("*"),
      supabase.from("work_orders").select("*"),
      supabase.from("harvest_records").select("*").eq("season", currentSeason),
    ]);

    setFields((fieldsResult.data || []) as Field[]);
    setTransactions(
      (transactionsResult.data || []) as FinancialTransaction[]
    );
    setInventory((inventoryResult.data || []) as InventoryItem[]);
    setEquipment((equipmentResult.data || []) as Equipment[]);
    setJobs((jobsResult.data || []) as WorkOrder[]);
    setHarvests((harvestsResult.data || []) as HarvestRecord[]);
    setLoading(false);
  }

  useEffect(() => {
    if (currentSeason) void loadData();
  }, [currentSeason]);

  const totals = useMemo(() => {
    const income = transactions
      .filter((item) => item.transaction_type === "Income")
      .reduce((sum, item) => sum + item.amount, 0);

    const expenses = transactions
      .filter((item) => item.transaction_type === "Expense")
      .reduce((sum, item) => sum + item.amount, 0);

    const inventoryValue = inventory.reduce(
      (sum, item) => sum + item.quantity * (item.unit_cost || 0),
      0
    );

    const harvestedTonnes = harvests.reduce(
      (sum, item) => sum + item.tonnes_harvested,
      0
    );

    const harvestedArea = harvests.reduce(
      (sum, item) => sum + item.area_ha,
      0
    );

    return {
      income,
      expenses,
      grossMargin: income - expenses,
      inventoryValue,
      harvestedTonnes,
      averageYield:
        harvestedArea > 0 ? harvestedTonnes / harvestedArea : 0,
    };
  }, [transactions, inventory, harvests]);

  const monthlyData: MonthlyPoint[] = useMemo(() => {
    const map = new Map<string, MonthlyPoint>();

    transactions.forEach((item) => {
      const month = item.transaction_date.slice(0, 7);
      const current = map.get(month) || {
        month,
        income: 0,
        expenses: 0,
      };

      if (item.transaction_type === "Income") {
        current.income += item.amount;
      } else {
        current.expenses += item.amount;
      }

      map.set(month, current);
    });

    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-8);
  }, [transactions]);

  const cropAreas: CropArea[] = useMemo(() => {
    const map = new Map<string, number>();

    fields.forEach((field) => {
      const crop = field.crop || "Unspecified";
      map.set(crop, (map.get(crop) || 0) + field.area_ha);
    });

    return Array.from(map.entries())
      .map(([crop, area]) => ({ crop, area }))
      .sort((a, b) => b.area - a.area);
  }, [fields]);

  const fieldProfitability: FieldProfit[] = useMemo(() => {
    return fields
      .map((field) => {
        const fieldTransactions = transactions.filter(
          (item) => item.field_id === field.id
        );

        const income = fieldTransactions
          .filter((item) => item.transaction_type === "Income")
          .reduce((sum, item) => sum + item.amount, 0);

        const expenses = fieldTransactions
          .filter((item) => item.transaction_type === "Expense")
          .reduce((sum, item) => sum + item.amount, 0);

        return {
          name: field.field_name,
          margin: income - expenses,
        };
      })
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 8);
  }, [fields, transactions]);

  const completedJobs = jobs.filter(
    (job) => job.status === "Completed"
  ).length;

  const openJobs = jobs.filter(
    (job) => job.status !== "Completed"
  ).length;

  const jobCompletion =
    jobs.length > 0 ? (completedJobs / jobs.length) * 100 : 0;

  const lowStockItems = inventory.filter(
    (item) =>
      item.minimum_quantity !== null &&
      item.quantity <= item.minimum_quantity
  );

  const serviceDue = equipment.filter((item) => {
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
  });

  const maxMonthly = Math.max(
    1,
    ...monthlyData.flatMap((item) => [item.income, item.expenses])
  );

  const maxCropArea = Math.max(
    1,
    ...cropAreas.map((item) => item.area)
  );

  const maxMargin = Math.max(
    1,
    ...fieldProfitability.map((item) => Math.abs(item.margin))
  );

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Executive Analytics
          </h1>
          <p className="mt-2 text-gray-400">
            Visual performance indicators across your farm.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Refresh Analytics
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading analytics...</p>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Gross margin"
              value={`R${totals.grossMargin.toFixed(2)}`}
              note={`Income R${totals.income.toFixed(2)}`}
            />
            <Kpi
              label="Inventory value"
              value={`R${totals.inventoryValue.toFixed(2)}`}
              note={`${lowStockItems.length} low-stock items`}
            />
            <Kpi
              label="Average yield"
              value={`${totals.averageYield.toFixed(2)} t/ha`}
              note={`${totals.harvestedTonnes.toFixed(2)} t recorded`}
            />
            <Kpi
              label="Job completion"
              value={`${jobCompletion.toFixed(1)}%`}
              note={`${completedJobs} completed · ${openJobs} open`}
            />
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <ChartPanel title="Monthly Cash Flow">
              {monthlyData.length === 0 ? (
                <EmptyState text="No financial transactions recorded." />
              ) : (
                <div className="space-y-5">
                  {monthlyData.map((item) => (
                    <div key={item.month}>
                      <div className="mb-2 flex justify-between gap-4 text-sm">
                        <span className="font-medium text-gray-300">
                          {item.month}
                        </span>
                        <span className="text-gray-500">
                          Net R{(item.income - item.expenses).toFixed(2)}
                        </span>
                      </div>

                      <Bar
                        label={`Income R${item.income.toFixed(2)}`}
                        width={(item.income / maxMonthly) * 100}
                        positive
                      />

                      <div className="mt-2">
                        <Bar
                          label={`Expenses R${item.expenses.toFixed(2)}`}
                          width={(item.expenses / maxMonthly) * 100}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartPanel>

            <ChartPanel title="Crop Area Distribution">
              {cropAreas.length === 0 ? (
                <EmptyState text="No field crop data recorded." />
              ) : (
                <div className="space-y-4">
                  {cropAreas.map((item) => (
                    <div key={item.crop}>
                      <div className="mb-2 flex justify-between gap-4 text-sm">
                        <span>{item.crop}</span>
                        <span>{item.area.toFixed(2)} ha</span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-black/40">
                        <div
                          className="h-full rounded-full bg-green-500"
                          style={{
                            width: `${(item.area / maxCropArea) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartPanel>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <ChartPanel title="Field Profitability">
              {fieldProfitability.length === 0 ? (
                <EmptyState text="No field financial data recorded." />
              ) : (
                <div className="space-y-4">
                  {fieldProfitability.map((item) => (
                    <div key={item.name}>
                      <div className="mb-2 flex justify-between gap-4 text-sm">
                        <span>{item.name}</span>
                        <span
                          className={
                            item.margin >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          R{item.margin.toFixed(2)}
                        </span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-black/40">
                        <div
                          className={`h-full rounded-full ${
                            item.margin >= 0
                              ? "bg-green-500"
                              : "bg-red-500"
                          }`}
                          style={{
                            width: `${(Math.abs(item.margin) / maxMargin) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartPanel>

            <ChartPanel title="Operational Risk">
              <RiskRow
                label="Low-stock items"
                value={lowStockItems.length}
                href="/inventory"
              />
              <RiskRow
                label="Equipment service due"
                value={serviceDue.length}
                href="/equipment"
              />
              <RiskRow
                label="Open job cards"
                value={openJobs}
                href="/jobs"
              />
              <RiskRow
                label="Unprofitable fields"
                value={
                  fieldProfitability.filter((item) => item.margin < 0).length
                }
                href="/financials"
              />
            </ChartPanel>
          </section>

          <section className="mt-8 rounded-2xl border border-green-500/20 bg-green-500/10 p-6">
            <h2 className="text-2xl font-bold text-green-400">
              Management Snapshot
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Snapshot
                label="Income"
                value={`R${totals.income.toFixed(2)}`}
              />
              <Snapshot
                label="Expenses"
                value={`R${totals.expenses.toFixed(2)}`}
              />
              <Snapshot
                label="Completed jobs"
                value={String(completedJobs)}
              />
              <Snapshot
                label="Service alerts"
                value={String(serviceDue.length)}
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Kpi({
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
      <p className="mt-2 text-sm text-gray-500">{note}</p>
    </div>
  );
}

function ChartPanel({
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

function Bar({
  label,
  width,
  positive = false,
}: {
  label: string;
  width: number;
  positive?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <div className="h-3 overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full ${
            positive ? "bg-green-500" : "bg-amber-500"
          }`}
          style={{ width: `${Math.min(width, 100)}%` }}
        />
      </div>
    </div>
  );
}

function RiskRow({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a
      href={href}
      className="mb-3 flex items-center justify-between gap-4 rounded-xl bg-black/20 p-4 hover:bg-black/30"
    >
      <span className="text-gray-300">{label}</span>
      <span
        className={
          value > 0
            ? "font-bold text-amber-400"
            : "font-bold text-green-400"
        }
      >
        {value}
      </span>
    </a>
  );
}

function Snapshot({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-gray-400">{text}</p>;
}
