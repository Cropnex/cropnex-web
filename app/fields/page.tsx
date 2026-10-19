"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FieldCard from "@/components/fields/FieldCard";
import FieldForm from "@/components/fields/FieldForm";
import { supabase } from "@/lib/supabase";
import type { Field, FieldFormValues } from "@/types/field";
import { useSeason } from "@/components/season/SeasonProvider";

const emptyForm: FieldFormValues = {
  field_name: "",
  farm_name: "Main Farm",
  crop: "",
  season: "2026/2027",
  planting_date: "",
  cultivar: "",
  soil_type: "",
  expected_yield: "",
  area_ha: "",
  status: "Active",
  notes: "",
};

export default function FieldsPage() {
  const{currentSeason}=useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [form, setForm] = useState<FieldFormValues>(emptyForm);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadFields() {
    if(!currentSeason)return;
    setLoading(true);

    const { data, error } = await supabase
      .from("fields")
      .select(
        "id, user_id, created_at, field_name, farm_name, crop, season, planting_date, cultivar, soil_type, expected_yield, status, area_ha, notes, boundary"
      )
      .eq("season",currentSeason)
      .order("farm_name", { ascending: true })
      .order("field_name", { ascending: true });

    if (error) {
      console.error("Could not load fields:", error);
      alert(error.message);
    } else {
      setFields((data || []) as Field[]);
    }

    setLoading(false);
  }

  function updateForm(name: keyof FieldFormValues, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function startEdit(field: Field) {
    setEditingFieldId(field.id);
    setForm({
      field_name: field.field_name,
      farm_name: field.farm_name || "",
      crop: field.crop || "",
      season: field.season || "",
      planting_date: field.planting_date || "",
      cultivar: field.cultivar || "",
      soil_type: field.soil_type || "",
      expected_yield:
        field.expected_yield !== null ? String(field.expected_yield) : "",
      area_ha: String(field.area_ha),
      status: field.status || "Active",
      notes: field.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingFieldId(null);
    setForm({...emptyForm,season:currentSeason});
  }

  async function saveField() {
    if (!form.field_name.trim()) {
      alert("Enter a field name.");
      return;
    }

    if (!form.area_ha || Number(form.area_ha) <= 0) {
      alert("Enter a valid field area.");
      return;
    }

    setSaving(true);

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        alert("You must be logged in.");
        return;
      }

      const payload = {
        user_id: userData.user.id,
        field_name: form.field_name.trim(),
        farm_name: form.farm_name.trim() || null,
        crop: form.crop.trim() || null,
        season: currentSeason,
        planting_date: form.planting_date || null,
        cultivar: form.cultivar.trim() || null,
        soil_type: form.soil_type.trim() || null,
        expected_yield: form.expected_yield
          ? Number(form.expected_yield)
          : null,
        area_ha: Number(form.area_ha),
        status: form.status || "Active",
        notes: form.notes.trim() || null,
      };

      const query = editingFieldId
        ? supabase.from("fields").update(payload).eq("id", editingFieldId)
        : supabase.from("fields").insert(payload);

      const { error } = await query;

      if (error) {
        alert(error.message);
        return;
      }

      resetForm();
      await loadFields();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if(!currentSeason)return;setForm(value=>({...value,season:currentSeason}));void loadFields();
  }, [currentSeason]);

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">Field Management</h1>
          <p className="mt-2 text-gray-400">
            Manage farms, seasons, cultivars, planting dates and yield targets.
          </p>
        </div>

        <Link
          href="/farm-map"
          className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
        >
          Open Farm Map
        </Link>
      </div>

      <FieldForm
        values={form}
        saving={saving}
        onChange={updateForm}
        onSave={saveField}
        onCancel={editingFieldId ? resetForm : undefined}
        submitLabel={editingFieldId ? "Update Field" : "Save Field"}
      />

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Your Fields</h2>
          <span className="text-sm text-gray-400">
            {fields.length} field{fields.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading fields...</p>
        ) : fields.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-400">
            No fields found yet.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {fields.map((field) => (
              <FieldCard
                key={field.id}
                field={field}
                onEdit={startEdit}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
