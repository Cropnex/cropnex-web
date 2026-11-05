"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {allReportRows} from '@/lib/reporting';
import {trialRequest} from '@/lib/trial-request';
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
  complete_field: false,
};

export default function HarvestPage() {
  const{currentSeason}=useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const saveRequest=useRef<{payload:string;id:string}|null>(null);

  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');const sequence=useRef(0);
  async function loadAll(){const request=++sequence.current;if(!currentSeason){setLoading(false);return;}setLoading(true);setLoadError('');try{const [f,r]=await trialRequest(signal=>Promise.all([
    allReportRows<Field>((a,b)=>supabase.from('fields').select('*').eq('season',currentSeason).order('field_name').order('id').range(a,b).abortSignal(signal)),
    allReportRows<HarvestRecord>((a,b)=>supabase.from('harvest_records').select('*').eq('season',currentSeason).order('harvest_date',{ascending:false}).order('id').range(a,b).abortSignal(signal))
  ]),undefined,60000);if(request!==sequence.current)return;setFields(f);setRecords(r);}catch(e){if(request===sequence.current)setLoadError(e instanceof Error?e.message:String((e as {message?:string})?.message||e));}finally{if(request===sequence.current)setLoading(false);}}

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
      const details={tonnes,price:form.price_per_tonne?Number(form.price_per_tonne):null,transport_cost:Number(form.transport_cost||0),other_cost:Number(form.other_cost||0),moisture:form.moisture_percent?Number(form.moisture_percent):null,grade:form.quality_grade.trim(),destination_type:form.destination_type,destination:form.destination_name.trim(),notes:form.notes.trim()};
      if(![details.tonnes,details.transport_cost,details.other_cost,...(details.price===null?[]:[details.price]),...(details.moisture===null?[]:[details.moisture])].every(Number.isFinite))throw new Error('Enter valid numeric quantities and prices.');
      const payload=JSON.stringify({field:field.id,date:form.harvest_date,details,complete:form.complete_field});
      if(saveRequest.current?.payload!==payload)saveRequest.current={payload,id:crypto.randomUUID()};
      const requestId=saveRequest.current.id;
      const {error}=await trialRequest(()=>supabase.rpc('save_manual_harvest',{p_request:requestId,p_field:field.id,p_date:form.harvest_date,p_details:details,p_complete:form.complete_field}),undefined,60000);
      if(error)throw new Error(error.message);
      saveRequest.current=null;
      setForm(emptyForm);
      await loadAll();
    } catch(error) { alert(error instanceof Error?error.message:"Harvest could not be saved. No partial capture should remain. Retry the same details if the connection timed out."); } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();return()=>{sequence.current++;};
  }, [currentSeason]);

  const totals = useMemo(() => {
    const tonnes = records.reduce(
      (sum, record) => sum + Number(record.tonnes_harvested),
      0
    );

    const area = Array.from(new Map(records.map(record => [record.field_id, record.area_ha])).values()).reduce((sum, value) => sum + Number(value), 0);

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
    fields.forEach(field => grouped.set(field.id, { fieldId:field.id, latestDate:"", crop:field.crop, area:Number(field.area_ha||0), tonnes:0, weightedMoisture:0, pricedTonnes:0, revenue:0, loads:0 }));
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
  }, [records,fields]);

  if(loading||loadError)return <main className="p-6"><h1 className="text-3xl font-bold">Harvest & Yield</h1><p role="status" className="my-4">{loadError||'Loading complete harvest records…'}</p>{loadError&&<button className="primary" onClick={()=>void loadAll()}>Retry</button>}</main>;
  return (
    <main className="min-h-screen bg-[#14261F] p-6 text-white md:p-8">
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

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-green-300/20 bg-green-300/5 p-4 text-sm">
          <input type="checkbox" checked={form.complete_field} onChange={event => setForm({ ...form, complete_field: event.target.checked })} className="mt-0.5 h-4 w-4 accent-green-500" />
          <span><strong>Mark this field’s harvest complete</strong><span className="mt-1 block text-xs text-gray-400">Use after all harvest records and transport tonnes for the field have been entered.</span></span>
        </label>

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
                <th className="px-4 py-3">Field status</th>
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
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${field?.harvest_status === "Completed" ? "bg-green-500/15 text-green-300" : "bg-amber-500/15 text-amber-200"}`}>{field?.harvest_status === "Completed" ? "Complete" : "In progress"}</span></td>
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
