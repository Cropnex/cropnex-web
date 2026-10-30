"use client";

import { useEffect, useRef, useState } from "react";
import type { Field } from "@/types/field";
import type { Trial, TrialInput, TrialStrip, TrialVisit } from "@/types/trial";

export const controlClass = "mt-1 w-full rounded-lg border border-white/20 bg-[#0d1e17] px-3 py-2.5 text-white placeholder:text-[#7e9586] focus:border-[#9ada65] focus:outline-none";
export const actionClass = "rounded-lg bg-[#91d346] px-4 py-2.5 text-sm font-bold text-[#132011] disabled:opacity-50";
export const secondaryClass = "rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-[#d3dfd6] hover:bg-white/10 disabled:opacity-50";
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-[#cbd8cf]">{label}{children}</label>;
}
function DialogForm({ title, children, onClose, onSave }: {
  title: string; children: React.ReactNode; onClose: () => void; onSave: (data: FormData) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { const dialog = ref.current; if (!dialog) return; dialog.showModal(); dialog.querySelector<HTMLElement>("input,select,textarea")?.focus(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto max-h-[90dvh] w-[min(94vw,680px)] overflow-y-auto rounded-2xl border border-white/20 bg-[#14261f] p-5 text-white shadow-2xl backdrop:bg-black/75 sm:p-7">
    <div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close window" className={secondaryClass}>✕</button></div>
    <form onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
      try { await onSave(data); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this record."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-4">{children}</fieldset>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">{error}</p>}
      <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className={secondaryClass}>Cancel</button><button disabled={busy} className={actionClass}>{busy ? "Saving…" : "Save record"}</button></div>
    </form>
  </dialog>;
}

type FormProps = { onClose: () => void; onSave: (data: FormData) => Promise<void> };
export function TrialForm({ trial, fields, ...props }: FormProps & { trial?: Trial; fields: Field[] }) {
  return <DialogForm title={trial ? "Edit trial details" : "Create a trial"} {...props}>
    <FormField label="Trial name"><input autoFocus required name="name" defaultValue={trial?.name} className={controlClass} placeholder="e.g. Sunflower nutrition comparison" /></FormField>
    <FormField label="Field"><select required name="field_id" defaultValue={trial?.field_id || ""} disabled={Boolean(trial)} className={controlClass}><option value="">Choose field</option>{fields.map(field => <option key={field.id} value={field.id}>{field.farm_name} · {field.field_name} · {field.area_ha} ha</option>)}</select></FormField>
    <FormField label="Trial description"><textarea name="objective" rows={4} defaultValue={trial?.objective || ""} className={controlClass} placeholder="What are you comparing and what do you want to learn?" /></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label="Start date"><input name="start_date" type="date" defaultValue={trial?.start_date || ""} className={controlClass} /></FormField><FormField label="End date"><input name="end_date" type="date" defaultValue={trial?.end_date || ""} className={controlClass} /></FormField></div>
    <FormField label="Average SAFEX price (R / tonne)"><input name="crop_price_per_tonne" type="number" min="0" step="0.01" defaultValue={trial?.crop_price_per_tonne ?? ""} className={controlClass} placeholder="Enter your average price for this trial" /></FormField>
    <p className="text-xs leading-5 text-[#a9bfb0]">This one price is used for every harvested strip in the trial. You can update it later to recalculate the results.</p>
    <FormField label="Additional trial notes"><textarea name="notes" rows={3} defaultValue={trial?.notes || ""} className={controlClass} /></FormField>
  </DialogForm>;
}

export function StripForm({ strip, ...props }: FormProps & { strip?: TrialStrip }) {
  const [harvested, setHarvested] = useState(Boolean(strip?.harvested && strip.yield_source === "Manual"));
  return <DialogForm title={strip ? "Edit strip / record harvest" : "Add a trial strip"} {...props}>
    <FormField label="Strip name"><input autoFocus required name="strip_name" defaultValue={strip?.strip_name} className={controlClass} placeholder="e.g. Strip 1 – Standard programme" /></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label="Strip area (ha)"><input required name="area_ha" type="number" min="0.0001" step="0.0001" defaultValue={strip?.area_ha} className={controlClass} /></FormField><FormField label="Additional operation costs (R / ha)"><input name="operation_cost_per_ha" type="number" min="0" step="0.01" defaultValue={strip?.operation_cost_per_ha || 0} className={controlClass} /></FormField></div>
    <p className="text-xs text-[#a9bfb0]">Enter only operation costs that are not already listed as an input on this strip.</p>
    <FormField label="Strip description"><textarea name="description" rows={3} defaultValue={strip?.description || ""} className={controlClass} placeholder="Treatment, cultivar, layout or conditions specific to this strip" /></FormField>
    <label className="flex items-center gap-3 rounded-lg border border-[#91d346]/40 bg-[#91d346]/10 p-3 font-bold"><input name="harvested" type="checkbox" checked={harvested} onChange={e => setHarvested(e.target.checked)} className="h-5 w-5 accent-[#91d346]" />This strip has been harvested</label>
    {harvested && <div className="grid gap-4 sm:grid-cols-3"><FormField label="Tonnes harvested"><input required name="tonnes" type="number" min="0" step="0.001" defaultValue={strip?.yield_source === "Manual" ? strip?.tonnes : ""} className={controlClass} /></FormField><FormField label="Harvest date"><input required name="record_date" type="date" defaultValue={strip?.record_date || today()} className={controlClass} /></FormField><FormField label="Moisture %"><input name="moisture" type="number" min="0" max="100" step="0.01" defaultValue={strip?.moisture ?? ""} className={controlClass} /></FormField></div>}
    <FormField label="Strip / harvest notes"><textarea name="notes" rows={2} defaultValue={strip?.notes || ""} className={controlClass} /></FormField>
  </DialogForm>;
}

export function InputForm({ input, stripName, ...props }: FormProps & { input?: TrialInput; stripName: string }) {
  return <DialogForm title={`${input ? "Edit input" : "Add input"} · ${stripName}`} {...props}>
    <FormField label="Input type"><select name="input_type" defaultValue={input?.input_type || "Product"} className={controlClass}>{["Product", "Seed", "Operation"].map(type => <option key={type}>{type}</option>)}</select></FormField>
    <FormField label="Product / seed / operation name"><input required autoFocus name="product_name" defaultValue={input?.product_name} className={controlClass} /></FormField>
    <div className="grid gap-4 sm:grid-cols-3"><FormField label="Rate per hectare"><input required name="rate" type="number" min="0" step="0.0001" defaultValue={input?.rate ?? ""} className={controlClass} /></FormField><FormField label="Rate unit"><input required name="rate_unit" defaultValue={input?.rate_unit || "L/ha"} placeholder="e.g. kg/ha" className={controlClass} /></FormField><FormField label="Price per unit (R)"><input required name="unit_price" type="number" min="0" step="0.01" defaultValue={input?.unit_price ?? ""} className={controlClass} /></FormField></div>
    <p className="text-xs leading-5 text-[#a9bfb0]">Cost per hectare = rate per hectare × unit price. For a cost quoted per hectare, use rate 1 and enter that price. These comparison records do not deduct shed stock.</p>
    <FormField label="Input notes"><textarea name="notes" rows={2} defaultValue={input?.notes || ""} className={controlClass} /></FormField>
  </DialogForm>;
}

export function VisitForm({ visit, ...props }: FormProps & { visit?: TrialVisit }) {
  return <DialogForm title={visit ? "Edit trial visit" : "Log a trial visit"} {...props}>
    <FormField label="Visit date"><input required name="visit_date" type="date" defaultValue={visit?.visit_date || today()} className={controlClass} /></FormField>
    <FormField label="Visit description"><input required name="title" defaultValue={visit?.title} className={controlClass} placeholder="e.g. Flowering assessment" /></FormField>
    <FormField label="Observations and notes"><textarea name="notes" rows={6} defaultValue={visit?.notes || ""} className={controlClass} /></FormField>
  </DialogForm>;
}

export function PhotoForm({ strips, visits, ...props }: FormProps & { strips: TrialStrip[]; visits: TrialVisit[] }) {
  return <DialogForm title="Add trial photographs" {...props}>
    <FormField label="Photographs"><input required multiple name="photos" type="file" accept="image/jpeg,image/png,image/webp" className={controlClass} /></FormField>
    <FormField label="Date taken"><input name="taken_date" type="date" defaultValue={today()} className={controlClass} /></FormField>
    <FormField label="Description / caption"><textarea name="caption" rows={3} className={controlClass} /></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label="Related strip (optional)"><select name="strip_id" className={controlClass}><option value="">Whole trial</option>{strips.map(strip => <option key={strip.id} value={strip.id}>{strip.strip_name}</option>)}</select></FormField><FormField label="Related visit (optional)"><select name="visit_id" className={controlClass}><option value="">No specific visit</option>{visits.map(visit => <option key={visit.id} value={visit.id}>{visit.visit_date} · {visit.title}</option>)}</select></FormField></div>
  </DialogForm>;
}
