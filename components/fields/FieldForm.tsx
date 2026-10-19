"use client";

import type { FieldFormValues } from "@/types/field";

type FieldFormProps = {
  values: FieldFormValues;
  saving: boolean;
  onChange: (name: keyof FieldFormValues, value: string) => void;
  onSave: () => void;
  onCancel?: () => void;
  submitLabel?: string;
};

export default function FieldForm({
  values,
  saving,
  onChange,
  onSave,
  onCancel,
  submitLabel = "Save Field",
}: FieldFormProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="mb-5 text-2xl font-bold text-green-400">
        Field Details
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Field name"
          value={values.field_name}
          onChange={(value) => onChange("field_name", value)}
          placeholder="Field 4"
        />

        <Input
          label="Farm"
          value={values.farm_name}
          onChange={(value) => onChange("farm_name", value)}
          placeholder="Main Farm"
        />

        <Input
          label="Crop"
          value={values.crop}
          onChange={(value) => onChange("crop", value)}
          placeholder="Maize"
        />

        <Input
          label="Season"
          value={values.season}
          onChange={(value) => onChange("season", value)}
          placeholder="2026/2027"
        />

        <Input
          label="Planting date"
          type="date"
          value={values.planting_date}
          onChange={(value) => onChange("planting_date", value)}
        />

        <Input
          label="Cultivar"
          value={values.cultivar}
          onChange={(value) => onChange("cultivar", value)}
          placeholder="PAN 5R-891BR"
        />

        <Input
          label="Soil type"
          value={values.soil_type}
          onChange={(value) => onChange("soil_type", value)}
          placeholder="Hutton / Avalon"
        />

        <Input
          label="Expected yield (t/ha)"
          type="number"
          step="0.01"
          value={values.expected_yield}
          onChange={(value) => onChange("expected_yield", value)}
          placeholder="5.00"
        />

        <Input
          label="Area (ha)"
          type="number"
          step="0.01"
          value={values.area_ha}
          onChange={(value) => onChange("area_ha", value)}
          placeholder="53.00"
        />

        <div>
          <label className="mb-2 block text-sm text-gray-400">Status</label>
          <select
            value={values.status}
            onChange={(event) => onChange("status", event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          >
            <option>Active</option>
            <option>Planned</option>
            <option>Fallow</option>
            <option>Inactive</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm text-gray-400">Notes</label>
          <textarea
            rows={4}
            value={values.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
            placeholder="Field notes..."
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
        >
          {saving ? "Saving..." : submitLabel}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-6 py-3"
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
      />
    </div>
  );
}
