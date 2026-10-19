"use client";

import { useEffect, useMemo, useState } from "react";
import AlertCard from "@/components/alerts/AlertCard";
import PreferencesPanel from "@/components/alerts/PreferencesPanel";
import { supabase } from "@/lib/supabase";
import type { Equipment } from "@/types/equipment";
import type { Field } from "@/types/field";
import type { FinancialTransaction } from "@/types/financial";
import type {
  GrainPosition,
  ProductionForecast,
} from "@/types/grain";
import type { InventoryItem } from "@/types/inventory";
import type { WorkOrder } from "@/types/work-order";
import type {
  AlertPreferences,
  SmartAlert,
} from "@/types/alerts";
import { useSeason } from "@/components/season/SeasonProvider";

const defaultPreferences: AlertPreferences = {
  low_stock_enabled: true,
  service_due_enabled: true,
  overdue_jobs_enabled: true,
  negative_margin_enabled: true,
  unpriced_grain_enabled: true,
  upcoming_jobs_days: 3,
};

export default function AlertsPage() {
  const { currentSeason } = useSeason();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [transactions, setTransactions] =
    useState<FinancialTransaction[]>([]);
  const [forecasts, setForecasts] =
    useState<ProductionForecast[]>([]);
  const [positions, setPositions] = useState<GrainPosition[]>([]);
  const [preferences, setPreferences] =
    useState<AlertPreferences>(defaultPreferences);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);

    const [
      inventoryResult,
      equipmentResult,
      jobsResult,
      fieldsResult,
      transactionsResult,
      forecastsResult,
      positionsResult,
      preferencesResult,
    ] = await Promise.all([
      supabase.from("inventory_items").select("*").eq("season", currentSeason),
      supabase.from("equipment").select("*"),
      supabase.from("work_orders").select("*"),
      supabase.from("fields").select("*").eq("season", currentSeason),
      supabase.from("financial_transactions").select("*"),
      supabase.from("production_forecasts").select("*").eq("season", currentSeason),
      supabase.from("grain_positions").select("*").eq("season", currentSeason),
      supabase
        .from("alert_preferences")
        .select("*")
        .maybeSingle(),
    ]);

    setInventory((inventoryResult.data || []) as InventoryItem[]);
    setEquipment((equipmentResult.data || []) as Equipment[]);
    setJobs((jobsResult.data || []) as WorkOrder[]);
    setFields((fieldsResult.data || []) as Field[]);
    setTransactions(
      (transactionsResult.data || []) as FinancialTransaction[]
    );
    setForecasts(
      (forecastsResult.data || []) as ProductionForecast[]
    );
    setPositions((positionsResult.data || []) as GrainPosition[]);

    if (preferencesResult.data) {
      setPreferences(
        preferencesResult.data as AlertPreferences
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    if (currentSeason) void loadAll();
  }, [currentSeason]);

  async function savePreferences() {
    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const { error } = await supabase
        .from("alert_preferences")
        .upsert(
          {
            user_id: data.user.id,
            ...preferences,
          },
          {
            onConflict: "user_id",
          }
        );

      if (error) {
        alert(error.message);
        return;
      }

      alert("Alert preferences saved.");
    } finally {
      setSaving(false);
    }
  }

  const alerts: SmartAlert[] = useMemo(() => {
    const result: SmartAlert[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (preferences.low_stock_enabled) {
      inventory
        .filter(
          (item) =>
            item.minimum_quantity !== null &&
            item.quantity <= item.minimum_quantity
        )
        .forEach((item) => {
          result.push({
            id: `stock-${item.id}`,
            title: `${item.name} is low`,
            description: `Current stock is ${item.quantity} ${item.unit}; minimum level is ${item.minimum_quantity} ${item.unit}.`,
            severity:
              item.quantity <= 0 ? "critical" : "warning",
            href: "/inventory",
            category: "Inventory",
          });
        });
    }

    if (preferences.service_due_enabled) {
      equipment.forEach((item) => {
        const overdue =
          item.service_interval !== null &&
          item.last_service_hours !== null &&
          item.engine_hours - item.last_service_hours >=
            item.service_interval;

        if (overdue || item.status === "Service Due") {
          result.push({
            id: `service-${item.id}`,
            title: `${item.name} needs service`,
            description:
              item.last_service_hours !== null
                ? `${(
                    item.engine_hours -
                    item.last_service_hours
                  ).toFixed(1)} hours have passed since the last service.`
                : "The machine is marked as service due.",
            severity: "warning",
            href: "/equipment",
            category: "Equipment",
          });
        }
      });
    }

    if (preferences.overdue_jobs_enabled) {
      jobs
        .filter((job) => {
          if (
            job.status === "Completed" ||
            !job.planned_date
          ) {
            return false;
          }

          return (
            new Date(`${job.planned_date}T00:00:00`) < today
          );
        })
        .forEach((job) => {
          result.push({
            id: `overdue-${job.id}`,
            title: `${job.title} is overdue`,
            description: `Planned for ${job.planned_date} on ${
              job.field_name || "an unassigned field"
            }.`,
            severity: "critical",
            href: "/jobs",
            category: "Job Cards",
          });
        });
    }

    const upcomingLimit = new Date(today);
    upcomingLimit.setDate(
      upcomingLimit.getDate() +
        preferences.upcoming_jobs_days
    );

    jobs
      .filter((job) => {
        if (
          job.status === "Completed" ||
          !job.planned_date
        ) {
          return false;
        }

        const date = new Date(
          `${job.planned_date}T00:00:00`
        );

        return date >= today && date <= upcomingLimit;
      })
      .forEach((job) => {
        result.push({
          id: `upcoming-${job.id}`,
          title: `${job.title} is coming up`,
          description: `Scheduled for ${job.planned_date} on ${
            job.field_name || "an unassigned field"
          }.`,
          severity: "info",
          href: "/jobs",
          category: "Upcoming Work",
        });
      });

    if (preferences.negative_margin_enabled) {
      fields.forEach((field) => {
        const fieldTransactions = transactions.filter(
          (item) => item.field_id === field.id
        );

        const income = fieldTransactions
          .filter(
            (item) => item.transaction_type === "Income"
          )
          .reduce((sum, item) => sum + item.amount, 0);

        const expenses = fieldTransactions
          .filter(
            (item) => item.transaction_type === "Expense"
          )
          .reduce((sum, item) => sum + item.amount, 0);

        const margin = income - expenses;

        if (expenses > 0 && margin < 0) {
          result.push({
            id: `margin-${field.id}`,
            title: `${field.field_name} has a negative margin`,
            description: `Recorded margin is R${margin.toFixed(
              2
            )} with expenses of R${expenses.toFixed(2)}.`,
            severity: "warning",
            href: "/financials",
            category: "Financials",
          });
        }
      });
    }

    if (preferences.unpriced_grain_enabled) {
      forecasts.forEach((forecast) => {
        const hedgedTonnes = positions
          .filter(
            (position) =>
              position.season === forecast.season &&
              position.commodity === forecast.commodity &&
              position.status !== "Cancelled"
          )
          .reduce(
            (sum, position) => sum + position.tonnes,
            0
          );

        const unpriced = Math.max(
          forecast.expected_tonnes - hedgedTonnes,
          0
        );

        if (unpriced > 0) {
          const unpricedPercentage =
            forecast.expected_tonnes > 0
              ? (unpriced / forecast.expected_tonnes) * 100
              : 0;

          result.push({
            id: `grain-${forecast.id}`,
            title: `${forecast.commodity} remains unpriced`,
            description: `${unpriced.toFixed(
              2
            )} t (${unpricedPercentage.toFixed(
              1
            )}%) of expected ${forecast.season} production is not yet hedged or contracted.`,
            severity:
              unpricedPercentage >= 75
                ? "warning"
                : "info",
            href: "/grain-marketing",
            category: "Grain Marketing",
          });
        }
      });
    }

    const rank = {
      critical: 0,
      warning: 1,
      info: 2,
    };

    return result.sort(
      (a, b) => rank[a.severity] - rank[b.severity]
    );
  }, [
    inventory,
    equipment,
    jobs,
    fields,
    transactions,
    forecasts,
    positions,
    preferences,
  ]);

  const criticalCount = alerts.filter(
    (alert) => alert.severity === "critical"
  ).length;

  const warningCount = alerts.filter(
    (alert) => alert.severity === "warning"
  ).length;

  const infoCount = alerts.filter(
    (alert) => alert.severity === "info"
  ).length;

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>

          <h1 className="mt-2 text-4xl font-black">
            Smart Alerts & Daily Briefing
          </h1>

          <p className="mt-2 text-gray-400">
            Operational risks and priorities generated from
            your live farm data.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAll}
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Refresh Alerts
        </button>
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <Summary
          label="Critical"
          value={String(criticalCount)}
          className="text-red-400"
        />

        <Summary
          label="Warnings"
          value={String(warningCount)}
          className="text-amber-400"
        />

        <Summary
          label="Information"
          value={String(infoCount)}
          className="text-blue-400"
        />
      </section>

      {loading ? (
        <p className="text-gray-400">Loading alerts...</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section>
            <div className="mb-4">
              <h2 className="text-2xl font-bold">
                Daily Briefing
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                {alerts.length} active alert
                {alerts.length === 1 ? "" : "s"}
              </p>
            </div>

            {alerts.length === 0 ? (
              <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-6">
                <h3 className="text-2xl font-bold text-green-400">
                  No active alerts
                </h3>

                <p className="mt-2 text-gray-300">
                  No current low-stock, service, overdue job,
                  negative margin or grain exposure alerts were
                  found.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                  />
                ))}
              </div>
            )}
          </section>

          <PreferencesPanel
            preferences={preferences}
            saving={saving}
            onChange={(name, value) =>
              setPreferences((current) => ({
                ...current,
                [name]: value,
              }))
            }
            onSave={savePreferences}
          />
        </div>
      )}
    </main>
  );
}

function Summary({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p
        className={`mt-2 text-3xl font-black ${className}`}
      >
        {value}
      </p>
    </div>
  );
}
