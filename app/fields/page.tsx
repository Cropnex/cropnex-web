"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FieldCard from "@/components/fields/FieldCard";
import FieldForm from "@/components/fields/FieldForm";
import { supabase } from "@/lib/supabase";
import type { Field, FieldFormValues } from "@/types/field";
import { useSeason } from "@/components/season/SeasonProvider";
import { boundaryHasShape } from "@/lib/field-boundary";

const blankValues: FieldFormValues = {
  field_name: "", farm_name: "", crop: "", season: "", planting_date: "", cultivar: "",
  soil_type: "", expected_yield: "", area_ha: "", status: "Active", notes: "",
};

export default function FieldsPage() {
  const { currentSeason } = useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<FieldFormValues>(blankValues);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function loadFields() {
    if (!currentSeason) { setFields([]); setLoading(false); return; }
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.from("fields")
      .select("id, user_id, created_at, field_name, farm_name, crop, season, planting_date, cultivar, soil_type, expected_yield, status, area_ha, notes, boundary")
      .eq("season", currentSeason).order("farm_name").order("field_name");
    if (error) {
      console.error("Could not load fields:", error);
      setLoadError(error.message);
    } else {
      setFields(((data || []) as Field[]).filter((field) => boundaryHasShape(field.boundary)));
    }
    setLoading(false);
  }

  function startEdit(field: Field) {
    setEditingFieldId(field.id);
    setValues({
      field_name: field.field_name, farm_name: field.farm_name || "", crop: field.crop || "",
      season: field.season || currentSeason, planting_date: field.planting_date || "", cultivar: field.cultivar || "",
      soil_type: field.soil_type || "", expected_yield: field.expected_yield === null ? "" : String(field.expected_yield),
      area_ha: String(field.area_ha), status: field.status || "Active", notes: field.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() { setEditingFieldId(null); setValues(blankValues); }

  async function saveField() {
    if (!editingFieldId) return;
    if (!values.field_name.trim()) return alert("Enter a field name.");
    if (!values.area_ha || Number(values.area_ha) <= 0) return alert("Enter a valid field area.");
    setSaving(true);
    try {
      const { error } = await supabase.from("fields").update({
        field_name: values.field_name.trim(), farm_name: values.farm_name.trim() || null,
        crop: values.crop.trim() || null, planting_date: values.planting_date || null,
        cultivar: values.cultivar.trim() || null, soil_type: values.soil_type.trim() || null,
        expected_yield: values.expected_yield ? Number(values.expected_yield) : null,
        area_ha: Number(values.area_ha), status: values.status || "Active", notes: values.notes.trim() || null,
      }).eq("id", editingFieldId);
      if (error) return alert(error.message);
      cancelEdit();
      await loadFields();
    } finally { setSaving(false); }
  }

  useEffect(() => { void loadFields(); }, [currentSeason]);

  return (
    <main className="min-h-screen bg-[#14261F] p-6 text-white md:p-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><p className="ag-kicker">CropNex · {currentSeason || "Farm fields"}</p><h1 className="mt-2 text-4xl font-black">Fields</h1><p className="mt-2 text-gray-400">Manage field details and hectares. Each field must have a mapped boundary.</p></div>
        <Link href="/farm-map" className="rounded-xl bg-[#86CF34] px-5 py-3 font-bold text-[#111516]">Open Farm Map</Link>
      </header>

      {editingFieldId && <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4"><p className="ag-kicker">Edit existing field</p><h2 className="mt-1 text-xl font-bold">Field details</h2><p className="mt-1 text-sm text-white/60">The boundary stays attached. To reshape it, select the field on the Farm Map.</p></div>
        <FieldForm values={values} saving={saving} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} onSave={saveField} onCancel={cancelEdit} submitLabel="Save field details" />
      </section>}

      <section>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-2xl font-bold">Fields with boundaries</h2><p className="mt-1 text-sm text-gray-400">New fields are created by drawing or importing their boundary on the Farm Map.</p></div><span className="text-sm text-gray-400">{fields.length} field{fields.length === 1 ? "" : "s"}</span></div>
        {loading ? <p className="text-gray-400">Loading fields…</p>
          : loadError ? <div className="rounded-2xl border border-red-300/20 bg-red-300/[.06] p-5 text-red-100">Could not load fields: {loadError}<button type="button" onClick={() => void loadFields()} className="ml-3 underline">Retry</button></div>
          : fields.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/5 p-6"><h3 className="font-bold">No mapped fields for this season yet</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Create a field by importing a boundary file or drawing it on the map. CropNex will calculate the mapped hectares, and you can keep that value or enter your registered area.</p><Link href="/farm-map" className="mt-4 inline-flex rounded-xl bg-[#86CF34] px-4 py-3 font-bold text-[#111516]">Go to Farm Map</Link></div>
          : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{fields.map((field) => <FieldCard key={field.id} field={field} onEdit={startEdit} />)}</div>}
      </section>
    </main>
  );
}
