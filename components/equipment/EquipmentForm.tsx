"use client";

import type { EquipmentFormValues } from "@/types/equipment";

type Props = {
  values: EquipmentFormValues;
  saving: boolean;
  onChange: (name: keyof EquipmentFormValues, value: string) => void;
  onSave: () => void;
  onCancel?: () => void;
  submitLabel?: string;
};

export default function EquipmentForm({ values, saving, onChange, onSave, onCancel, submitLabel = "Save Equipment" }: Props) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="mb-5 text-2xl font-bold text-green-400">Equipment Details</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Input label="Name" value={values.name} onChange={(v) => onChange("name", v)} placeholder="John Deere 6195M" />
        <Select label="Category" value={values.category} onChange={(v) => onChange("category", v)} options={["Tractor","Sprayer","Planter","Combine","Truck","Bakkie","Implement","Other"]} />
        <Input label="Brand" value={values.brand} onChange={(v) => onChange("brand", v)} placeholder="John Deere" />
        <Input label="Model" value={values.model} onChange={(v) => onChange("model", v)} placeholder="6195M" />
        <Input label="Registration" value={values.registration} onChange={(v) => onChange("registration", v)} />
        <Input label="Serial number" value={values.serial_number} onChange={(v) => onChange("serial_number", v)} />
        <Input label="Year" type="number" value={values.year} onChange={(v) => onChange("year", v)} />
        <Input label="Purchase date" type="date" value={values.purchase_date} onChange={(v) => onChange("purchase_date", v)} />
        <Input label="Purchase price (R)" type="number" step="0.01" value={values.purchase_price} onChange={(v) => onChange("purchase_price", v)} />
        <Input label="Current engine hours" type="number" step="0.1" value={values.engine_hours} onChange={(v) => onChange("engine_hours", v)} />
        <Input label="Service interval (hours)" type="number" step="0.1" value={values.service_interval} onChange={(v) => onChange("service_interval", v)} />
        <Input label="Last service hours" type="number" step="0.1" value={values.last_service_hours} onChange={(v) => onChange("last_service_hours", v)} />
        <Select label="Fuel type" value={values.fuel_type} onChange={(v) => onChange("fuel_type", v)} options={["Diesel","Petrol","Electric","None","Other"]} />
        <Select label="Status" value={values.status} onChange={(v) => onChange("status", v)} options={["Active","Service Due","Out of Service","Sold","Inactive"]} />
        <div className="md:col-span-2 xl:col-span-3 mt-2 border-t border-white/10 pt-5"><p className="text-sm font-black uppercase tracking-wider text-[#a4df57]">Equipment finance</p><p className="mt-1 text-xs text-gray-500">Optional. Used as a business commitment in projected bank and management reports.</p></div>
        <Input label="Installment amount (R)" type="number" step="0.01" value={values.installment_amount} onChange={(v) => onChange("installment_amount", v)} />
        <Select label="Installment frequency" value={values.installment_frequency} onChange={(v) => onChange("installment_frequency", v)} options={["Monthly","Quarterly","Annual","Per season"]} />
        <Input label="Finance start date" type="date" value={values.finance_start_date} onChange={(v) => onChange("finance_start_date", v)} />
        <Input label="Finance term (seasons)" type="number" step="1" value={values.finance_term_seasons} onChange={(v) => onChange("finance_term_seasons", v)} />
        <div className="md:col-span-2"><Input label="Finance notes / bank reference" value={values.finance_notes} onChange={(v) => onChange("finance_notes", v)} /></div>
        <div className="md:col-span-2 xl:col-span-3">
          <label className="mb-2 block text-sm text-gray-400">Notes</label>
          <textarea rows={4} value={values.notes} onChange={(e) => onChange("notes", e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50">{saving ? "Saving..." : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl border border-white/10 px-6 py-3">Cancel</button>}
      </div>
    </section>
  );
}

function Input({label,value,onChange,placeholder,type="text",step}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;type?:string;step?:string}) {
  return <div><label className="mb-2 block text-sm text-gray-400">{label}</label><input type={type} step={step} value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" /></div>;
}
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:string[]}) {
  return <div><label className="mb-2 block text-sm text-gray-400">{label}</label><select value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3">{options.map((o)=><option key={o}>{o}</option>)}</select></div>;
}
