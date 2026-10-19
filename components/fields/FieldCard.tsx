import type { Field } from "@/types/field";

type FieldCardProps = {
  field: Field;
  onEdit: (field: Field) => void;
};

export default function FieldCard({ field, onEdit }: FieldCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            {field.farm_name || "No farm"} · {field.season || "No season"}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-green-400">
            {field.field_name}
          </h2>
        </div>

        <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400">
          {field.status || "Active"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Detail label="Crop" value={field.crop || "Not set"} />
        <Detail label="Area" value={`${field.area_ha} ha`} />
        <Detail label="Cultivar" value={field.cultivar || "Not set"} />
        <Detail
          label="Expected yield"
          value={
            field.expected_yield !== null
              ? `${field.expected_yield} t/ha`
              : "Not set"
          }
        />
        <Detail label="Soil" value={field.soil_type || "Not set"} />
        <Detail label="Planting" value={field.planting_date || "Not set"} />
      </div>

      {field.notes && (
        <p className="mt-4 text-sm text-gray-400">{field.notes}</p>
      )}

      <button
        type="button"
        onClick={() => onEdit(field)}
        className="mt-5 rounded-xl border border-white/10 px-4 py-2 text-sm hover:border-green-500/40"
      >
        Edit Field
      </button>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-medium text-gray-200">{value}</p>
    </div>
  );
}
