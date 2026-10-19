"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { HarvestRecord } from "@/types/harvest";
import { useSeason } from "@/components/season/SeasonProvider";

const emptyForm = {
  field_id: "",
  harvest_date: "",
  tonnes_harvested: "",
  moisture_percent: "",
  quality_grade: "",
  destination_type: "Buyer",
  destination_name: "",
  price_per_tonne: "",
  transport_cost: "",
  other_cost: "",
  notes: "",
};

export default function HarvestPage() {
  const{currentSeason}=useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    if(!currentSeason)return;
    const [fieldsResult, recordsResult] = await Promise.all([
      supabase.from("fields").select("*").eq("season",currentSeason).order("field_name"),
      supabase
        .from("harvest_records")
        .select("*")
        .eq("season",currentSeason)
        .order("harvest_date", { ascending: false }),
    ]);

    if (fieldsResult.error) alert(fieldsResult.error.message);
    if (recordsResult.error) alert(recordsResult.error.message);

    setFields((fieldsResult.data || []) as Field[]);
    setRecords((recordsResult.data || []) as HarvestRecord[]);
  }

  async function saveHarvest() {
    if (!form.field_id || !form.harvest_date) {
      alert("Select a field and harvest date.");
      return;
    }

    const tonnes = Number(form.tonnes_harvested);

    if (!tonnes || tonnes <= 0) {
      alert("Enter valid harvested tonnes.");
      return;
    }

    const field = fields.find((item) => item.id === form.field_id);
    if (!field) return;

    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const pricePerTonne = form.price_per_tonne
        ? Number(form.price_per_tonne)
        : null;

      const transportCost = form.transport_cost
        ? Number(form.transport_cost)
        : 0;

      const otherCost = form.other_cost
        ? Number(form.other_cost)
        : 0;

      const { error } = await supabase
        .from("harvest_records")
        .insert({
          user_id: data.user.id,
          field_id: field.id,
          harvest_date: form.harvest_date,
          crop: field.crop,
          season: field.season,
          area_ha: field.area_ha,
          tonnes_harvested: tonnes,
          moisture_percent: form.moisture_percent
            ? Number(form.moisture_percent)
            : null,
          quality_grade: form.quality_grade.trim() || null,
          destination_type: form.destination_type,
          destination_name: form.destination_name.trim() || null,
          price_per_tonne: pricePerTonne,
          transport_cost: transportCost || null,
          other_cost: otherCost || null,
          notes: form.notes.trim() || null,
        });

      if (error) {
        alert(error.message);
        return;
      }

      const yieldPerHa = tonnes / field.area_ha;

      const { error: activityError } = await supabase
        .from("activities")
        .insert({
          user_id: data.user.id,
          activity_type: "Harvesting",
          field_name: field.field_name,
          crop: field.crop,
          date: form.harvest_date,
          area_ha: field.area_ha,
          notes: `${tonnes.toFixed(2)} t harvested at ${yieldPerHa.toFixed(
            2
          )} t/ha`,
        });

      if (activityError) {
        alert(activityError.message);
        return;
      }

      if (pricePerTonne !== null) {
        const grossRevenue = tonnes * pricePerTonne;

        const { error: incomeError } = await supabase
          .from("financial_transactions")
          .insert({
            user_id: data.user.id,
            field_id: field.id,
            transaction_date: form.harvest_date,
            transaction_type: "Income",
            category: "Crop Sale",
            description: `${field.crop || "Crop"} harvest - ${
              field.field_name
            }`,
            quantity: tonnes,
            unit: "t",
            unit_price: pricePerTonne,
            amount: grossRevenue,
            supplier_or_customer:
              form.destination_name.trim() || null,
            reference: form.quality_grade.trim() || null,
            notes: form.notes.trim() || null,
          });

        if (incomeError) {
          alert(incomeError.message);
          return;
        }
      }

      const combinedCosts = transportCost + otherCost;

      if (combinedCosts > 0) {
        const { error: costError } = await supabase
          .from("financial_transactions")
          .insert({
            user_id: data.user.id,
            field_id: field.id,
            transaction_date: form.harvest_date,
            transaction_type: "Expense",
            category: "Harvest",
            description: `Harvest and transport costs - ${field.field_name}`,
            quantity: tonnes,
            unit: "t",
            unit_price: combinedCosts / tonnes,
            amount: combinedCosts,
            supplier_or_customer: null,
            reference: null,
            notes: form.notes.trim() || null,
          });

        if (costError) {
          alert(costError.message);
          return;
        }
      }

      setForm(emptyForm);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [currentSeason]);

  const totals = useMemo(() => {
    const tonnes = records.reduce(
      (sum, record) => sum + record.tonnes_harvested,
      0
    );

    const area = Array.from(new Map(records.map(record => [record.field_id, record.area_ha])).values()).reduce((sum, value) => sum + value, 0);

    const revenue = records.reduce(
      (sum, record) =>
        sum +
        record.tonnes_harvested *
          (record.price_per_tonne || 0),
      0
    );

    return {
      tonnes,
      averageYield: area > 0 ? tonnes / area : 0,
      revenue,
    };
  }, [records]);

  const fieldSummaries = useMemo(() => {
    const grouped = new Map<string, { fieldId:string; latestDate:string; crop:string|null; area:number; tonnes:number; weightedMoisture:number; pricedTonnes:number; revenue:number; loads:number }>();
    records.forEach(record => {
      const row = grouped.get(record.field_id) || { fieldId:record.field_id, latestDate:record.harvest_date, crop:record.crop, area:record.area_ha, tonnes:0, weightedMoisture:0, pricedTonnes:0, revenue:0, loads:0 };
      row.latestDate = row.latestDate > record.harvest_date ? row.latestDate : record.harvest_date;
      row.tonnes += Number(record.tonnes_harvested || 0);
      row.loads += 1;
      if (record.moisture_percent !== null) row.weightedMoisture += Number(record.moisture_percent) * Number(record.tonnes_harvested || 0);
      if (record.price_per_tonne !== null) { row.pricedTonnes += Number(record.tonnes_harvested || 0); row.revenue += Number(record.price_per_tonne) * Number(record.tonnes_harvested || 0); }
      grouped.set(record.field_id, row);
    });
    return Array.from(grouped.values()).sort((a,b) => b.latestDate.localeCompare(a.latestDate));
  }, [records]);

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Harvest & Yield
          </h1>
          <p className="mt-2 text-gray-400">
            Record harvest tonnes, moisture, yield, destination and income.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Summary
          label="Total harvested"
          value={`${totals.tonnes.toFixed(2)} t`}
        />
        <Summary
          label="Average yield"
          value={`${totals.averageYield.toFixed(2)} t/ha`}
        />
        <Summary
          label="Recorded revenue"
          value={`R${totals.revenue.toFixed(2)}`}
        />
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-5 text-2xl font-bold text-green-400">
          New Harvest Record
        </h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Field"
            value={form.field_id}
            onChange={(value) =>
              setForm({ ...form, field_id: value })
            }
          >
            <option value="">Select field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.field_name} · {field.crop || "No crop"} ·{" "}
                {field.area_ha} ha
              </option>
            ))}
          </Select>

          <Input
            label="Harvest date"
            type="date"
            value={form.harvest_date}
            onChange={(value) =>
              setForm({ ...form, harvest_date: value })
            }
          />

          <Input
            label="Tonnes harvested"
            type="number"
            value={form.tonnes_harvested}
            onChange={(value) =>
              setForm({
                ...form,
                tonnes_harvested: value,
              })
            }
          />

          <Input
            label="Moisture (%)"
            type="number"
            value={form.moisture_percent}
            onChange={(value) =>
              setForm({
                ...form,
                moisture_percent: value,
              })
            }
          />

          <Input
            label="Quality / grade"
            value={form.quality_grade}
            onChange={(value) =>
              setForm({
                ...form,
                quality_grade: value,
              })
            }
          />

          <Select
            label="Destination type"
            value={form.destination_type}
            onChange={(value) =>
              setForm({
                ...form,
                destination_type: value,
              })
            }
          >
            <option>Buyer</option>
            <option>Silo</option>
            <option>On-farm Storage</option>
            <option>Feedlot</option>
            <option>Other</option>
          </Select>

          <Input
            label="Destination / buyer"
            value={form.destination_name}
            onChange={(value) =>
              setForm({
                ...form,
                destination_name: value,
              })
            }
          />

          <Input
            label="Price (R/t)"
            type="number"
            value={form.price_per_tonne}
            onChange={(value) =>
              setForm({
                ...form,
                price_per_tonne: value,
              })
            }
          />

          <Input
            label="Transport cost (R)"
            type="number"
            value={form.transport_cost}
            onChange={(value) =>
              setForm({
                ...form,
                transport_cost: value,
              })
            }
          />

          <Input
            label="Other harvest cost (R)"
            type="number"
            value={form.other_cost}
            onChange={(value) =>
              setForm({
                ...form,
                other_cost: value,
              })
            }
          />
        </div>

        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) =>
            setForm({ ...form, notes: event.target.value })
          }
          placeholder="Notes"
          className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
        />

        <button
          type="button"
          onClick={saveHarvest}
          disabled={saving}
          className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Harvest"}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">
          Harvest Summary by Field
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-gray-400">
              <tr>
                <th className="px-4 py-3">Latest load</th>
                <th className="px-4 py-3">Field</th>
                <th className="px-4 py-3">Crop</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Tonnes</th>
                <th className="px-4 py-3">Yield</th>
                <th className="px-4 py-3">Loads</th>
                <th className="px-4 py-3">Avg. moisture</th>
                <th className="px-4 py-3">Avg. price</th>
                <th className="px-4 py-3">Revenue</th>
              </tr>
            </thead>

            <tbody>
              {fieldSummaries.map((record) => {
                const field = fields.find(
                  (item) => item.id === record.fieldId
                );

                const yieldPerHa =
                  record.area > 0
                    ? record.tonnes /
                      record.area
                    : 0;
                const moisture = record.tonnes > 0 ? record.weightedMoisture / record.tonnes : null;
                const averagePrice = record.pricedTonnes > 0 ? record.revenue / record.pricedTonnes : null;

                return (
                  <tr
                    key={record.fieldId}
                    className="border-b border-white/5"
                  >
                    <td className="px-4 py-3">
                      {record.latestDate}
                    </td>
                    <td className="px-4 py-3 font-bold text-green-400">
                      {field?.field_name || "Unknown"}
                    </td>
                    <td className="px-4 py-3">
                      {record.crop || "Not set"}
                    </td>
                    <td className="px-4 py-3">
                      {record.area.toFixed(2)} ha
                    </td>
                    <td className="px-4 py-3">
                      {record.tonnes.toFixed(2)} t
                    </td>
                    <td className="px-4 py-3">
                      {yieldPerHa.toFixed(2)} t/ha
                    </td>
                    <td className="px-4 py-3">
                      {record.loads}
                    </td>
                    <td className="px-4 py-3">
                      {moisture !== null
                        ? `${moisture.toFixed(1)}%`
                        : "Not set"}
                    </td>
                    <td className="px-4 py-3">
                      {averagePrice !== null
                        ? `R${averagePrice.toFixed(2)}`
                        : "Not set"}
                    </td>
                    <td className="px-4 py-3">
                      {record.pricedTonnes > 0
                        ? `R${record.revenue.toFixed(2)}`
                        : "Not set"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
