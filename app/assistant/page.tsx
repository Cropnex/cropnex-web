"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { Equipment } from "@/types/equipment";
import type { InventoryItem } from "@/types/inventory";
import type { WorkOrder } from "@/types/work-order";
import type { FinancialTransaction } from "@/types/financial";
import type { HarvestRecord } from "@/types/harvest";
import type { GrainPosition, ProductionForecast } from "@/types/grain";
import { useSeason } from "@/components/season/SeasonProvider";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const suggestions = [
  "What jobs are still open?",
  "Which equipment needs a service?",
  "What inventory is low?",
  "What is my gross margin?",
  "How many hectares do I farm?",
  "How much grain is unpriced?",
  "What is my average harvested yield?",
];

export default function AssistantPage() {
  const { currentSeason } = useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [transactions, setTransactions] =
    useState<FinancialTransaction[]>([]);
  const [harvests, setHarvests] = useState<HarvestRecord[]>([]);
  const [forecasts, setForecasts] = useState<ProductionForecast[]>([]);
  const [positions, setPositions] = useState<GrainPosition[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        "Hello Jako. I can analyse the CropNex data already stored in your account. Ask about jobs, equipment, inventory, financials, fields, harvests or grain exposure.",
    },
  ]);

  async function loadData() {
    setLoading(true);

    const [
      fieldsResult,
      equipmentResult,
      inventoryResult,
      jobsResult,
      transactionsResult,
      harvestsResult,
      forecastsResult,
      positionsResult,
    ] = await Promise.all([
      supabase.from("fields").select("*").eq("season", currentSeason),
      supabase.from("equipment").select("*"),
      supabase.from("inventory_items").select("*").eq("season", currentSeason),
      supabase.from("work_orders").select("*"),
      supabase.from("financial_transactions").select("*"),
      supabase.from("harvest_records").select("*").eq("season", currentSeason),
      supabase.from("production_forecasts").select("*").eq("season", currentSeason),
      supabase.from("grain_positions").select("*").eq("season", currentSeason),
    ]);

    setFields((fieldsResult.data || []) as Field[]);
    setEquipment((equipmentResult.data || []) as Equipment[]);
    setInventory((inventoryResult.data || []) as InventoryItem[]);
    setJobs((jobsResult.data || []) as WorkOrder[]);
    setTransactions(
      (transactionsResult.data || []) as FinancialTransaction[]
    );
    setHarvests((harvestsResult.data || []) as HarvestRecord[]);
    setForecasts(
      (forecastsResult.data || []) as ProductionForecast[]
    );
    setPositions((positionsResult.data || []) as GrainPosition[]);
    setLoading(false);
  }

  useEffect(() => {
    if (currentSeason) void loadData();
  }, [currentSeason]);

  const farmSummary = useMemo(() => {
    const totalArea = fields.reduce(
      (sum, field) => sum + field.area_ha,
      0
    );

    const lowStock = inventory.filter(
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

    const openJobs = jobs.filter(
      (job) => job.status !== "Completed"
    );

    const income = transactions
      .filter((item) => item.transaction_type === "Income")
      .reduce((sum, item) => sum + item.amount, 0);

    const expenses = transactions
      .filter((item) => item.transaction_type === "Expense")
      .reduce((sum, item) => sum + item.amount, 0);

    const totalHarvestTonnes = harvests.reduce(
      (sum, item) => sum + item.tonnes_harvested,
      0
    );

    const totalHarvestArea = harvests.reduce(
      (sum, item) => sum + item.area_ha,
      0
    );

    const expectedTonnes = forecasts.reduce(
      (sum, item) => sum + item.expected_tonnes,
      0
    );

    const hedgedTonnes = positions
      .filter((item) => item.status !== "Cancelled")
      .reduce((sum, item) => sum + item.tonnes, 0);

    return {
      totalArea,
      lowStock,
      serviceDue,
      openJobs,
      income,
      expenses,
      grossMargin: income - expenses,
      averageYield:
        totalHarvestArea > 0
          ? totalHarvestTonnes / totalHarvestArea
          : 0,
      expectedTonnes,
      hedgedTonnes,
      unpricedTonnes: Math.max(
        expectedTonnes - hedgedTonnes,
        0
      ),
    };
  }, [
    fields,
    inventory,
    equipment,
    jobs,
    transactions,
    harvests,
    forecasts,
    positions,
  ]);

  function answerQuestion(question: string) {
    const normalized = question.toLowerCase();

    if (
      normalized.includes("open job") ||
      normalized.includes("jobs are still open") ||
      normalized.includes("jobs due")
    ) {
      if (farmSummary.openJobs.length === 0) {
        return "There are no open job cards.";
      }

      const jobsText = farmSummary.openJobs
        .slice(0, 8)
        .map(
          (job) =>
            `${job.title} (${job.field_name || "no field"}, ${
              job.planned_date || "no date"
            })`
        )
        .join("; ");

      return `You have ${farmSummary.openJobs.length} open job card${
        farmSummary.openJobs.length === 1 ? "" : "s"
      }: ${jobsText}.`;
    }

    if (
      normalized.includes("service") ||
      normalized.includes("equipment need")
    ) {
      if (farmSummary.serviceDue.length === 0) {
        return "No equipment is currently marked as service due.";
      }

      return `${farmSummary.serviceDue.length} equipment item${
        farmSummary.serviceDue.length === 1 ? "" : "s"
      } need attention: ${farmSummary.serviceDue
        .map((item) => item.name)
        .join(", ")}.`;
    }

    if (
      normalized.includes("low stock") ||
      normalized.includes("inventory is low") ||
      normalized.includes("stock low")
    ) {
      if (farmSummary.lowStock.length === 0) {
        return "No inventory items are currently below their minimum stock level.";
      }

      return `${farmSummary.lowStock.length} low-stock item${
        farmSummary.lowStock.length === 1 ? "" : "s"
      }: ${farmSummary.lowStock
        .map(
          (item) =>
            `${item.name} (${item.quantity} ${item.unit})`
        )
        .join(", ")}.`;
    }

    if (
      normalized.includes("gross margin") ||
      normalized.includes("profit")
    ) {
      return `Recorded income is R${farmSummary.income.toFixed(
        2
      )}, expenses are R${farmSummary.expenses.toFixed(
        2
      )}, and gross margin is R${farmSummary.grossMargin.toFixed(
        2
      )}.`;
    }

    if (
      normalized.includes("hectare") ||
      normalized.includes("farm area")
    ) {
      return `You currently have ${fields.length} field${
        fields.length === 1 ? "" : "s"
      } covering ${farmSummary.totalArea.toFixed(2)} hectares.`;
    }

    if (
      normalized.includes("unpriced") ||
      normalized.includes("hedged") ||
      normalized.includes("grain exposure")
    ) {
      const hedgePercentage =
        farmSummary.expectedTonnes > 0
          ? (farmSummary.hedgedTonnes /
              farmSummary.expectedTonnes) *
            100
          : 0;

      return `Expected production is ${farmSummary.expectedTonnes.toFixed(
        2
      )} t. Recorded hedged or contracted tonnes are ${farmSummary.hedgedTonnes.toFixed(
        2
      )} t (${hedgePercentage.toFixed(
        1
      )}%). Unpriced exposure is ${farmSummary.unpricedTonnes.toFixed(
        2
      )} t.`;
    }

    if (
      normalized.includes("yield") ||
      normalized.includes("harvest average")
    ) {
      return `The average recorded harvested yield is ${farmSummary.averageYield.toFixed(
        2
      )} t/ha across ${harvests.length} harvest record${
        harvests.length === 1 ? "" : "s"
      }.`;
    }

    if (
      normalized.includes("summary") ||
      normalized.includes("today") ||
      normalized.includes("briefing")
    ) {
      return `Farm briefing: ${farmSummary.totalArea.toFixed(
        2
      )} ha across ${fields.length} fields; ${
        farmSummary.openJobs.length
      } open jobs; ${
        farmSummary.lowStock.length
      } low-stock items; ${
        farmSummary.serviceDue.length
      } equipment service alerts; gross margin R${farmSummary.grossMargin.toFixed(
        2
      )}; unpriced grain exposure ${farmSummary.unpricedTonnes.toFixed(
        2
      )} t.`;
    }

    return "I can currently answer questions about open jobs, equipment service, low stock, gross margin, farm hectares, grain exposure, harvest yield and a general farm briefing.";
  }

  function submitQuestion(questionOverride?: string) {
    const question = (questionOverride || query).trim();
    if (!question) return;

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: "user",
      text: question,
    };

    const assistantMessage: Message = {
      id: `${Date.now()}-assistant`,
      role: "assistant",
      text: answerQuestion(question),
    };

    setMessages((current) => [
      ...current,
      userMessage,
      assistantMessage,
    ]);
    setQuery("");
  }

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>

          <h1 className="mt-2 text-4xl font-black">
            Smart Farm Assistant
          </h1>

          <p className="mt-2 text-gray-400">
            Ask questions about the live data stored in CropNex.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Refresh Farm Data
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="h-[58vh] space-y-4 overflow-y-auto p-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-green-500 text-black"
                      : "border border-white/10 bg-black/30 text-gray-200"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 p-4">
            <div className="flex gap-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    submitQuestion();
                  }
                }}
                placeholder={
                  loading
                    ? "Loading farm data..."
                    : "Ask CropNex a farm question..."
                }
                disabled={loading}
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-green-500/50 disabled:opacity-50"
              />

              <button
                type="button"
                onClick={() => submitQuestion()}
                disabled={loading}
                className="rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold text-green-400">
              Quick Questions
            </h2>

            <div className="mt-4 space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submitQuestion(suggestion)}
                  className="w-full rounded-xl bg-black/20 px-4 py-3 text-left text-sm text-gray-300 hover:bg-black/30"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
            <h2 className="text-xl font-bold text-green-400">
              Current Snapshot
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <Row
                label="Farmed area"
                value={`${farmSummary.totalArea.toFixed(2)} ha`}
              />
              <Row
                label="Open jobs"
                value={String(farmSummary.openJobs.length)}
              />
              <Row
                label="Low stock"
                value={String(farmSummary.lowStock.length)}
              />
              <Row
                label="Service alerts"
                value={String(farmSummary.serviceDue.length)}
              />
              <Row
                label="Gross margin"
                value={`R${farmSummary.grossMargin.toFixed(2)}`}
              />
              <Row
                label="Unpriced grain"
                value={`${farmSummary.unpricedTonnes.toFixed(2)} t`}
              />
            </div>
          </section>

          <Link
            href="/reports"
            className="block rounded-2xl border border-white/10 bg-white/5 p-5 hover:border-green-500/40"
          >
            <p className="font-bold text-green-400">
              Open Full Reports
            </p>
            <p className="mt-2 text-sm text-gray-400">
              View detailed field, financial and operational analytics.
            </p>
          </Link>
        </aside>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        This version is a rules-based assistant using your CropNex data.
        It does not send farm data to an external AI service.
      </p>
    </main>
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
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
