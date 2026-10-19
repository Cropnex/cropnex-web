"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { Equipment } from "@/types/equipment";
import type { InventoryItem } from "@/types/inventory";
import type { WorkOrder, WorkOrderProduct } from "@/types/work-order";
import { useSeason } from "@/components/season/SeasonProvider";

type JobForm = {
  title: string;
  field_id: string;
  activity_type: string;
  planned_date: string;
  operator_name: string;
  equipment_id: string;
  implement_name: string;
  estimated_hours: string;
  diesel_litres: string;
  status: string;
  notes: string;
};

type ProductForm = {
  inventory_item_id: string;
  quantity: string;
};

const emptyJob: JobForm = {
  title: "",
  field_id: "",
  activity_type: "Spraying",
  planned_date: "",
  operator_name: "",
  equipment_id: "",
  implement_name: "",
  estimated_hours: "",
  diesel_litres: "",
  status: "Planned",
  notes: "",
};

const emptyProduct: ProductForm = {
  inventory_item_id: "",
  quantity: "",
};

export default function JobsPage() {
  const { currentSeason } = useSeason();
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Record<string, WorkOrderProduct[]>>({});
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    if (!currentSeason) return;
    const [jobsResult, fieldsResult, equipmentResult, inventoryResult] =
      await Promise.all([
        supabase.from("work_orders").select("*").order("planned_date", { ascending: true }),
        supabase.from("fields").select("*").eq("season", currentSeason).order("farm_name").order("field_name"),
        supabase.from("equipment").select("*").order("name"),
        supabase.from("inventory_items").select("*").eq("season", currentSeason).order("name"),
      ]);

    if (jobsResult.error) alert(jobsResult.error.message);
    if (fieldsResult.error) alert(fieldsResult.error.message);
    if (equipmentResult.error) alert(equipmentResult.error.message);
    if (inventoryResult.error) alert(inventoryResult.error.message);

    setJobs((jobsResult.data || []) as WorkOrder[]);
    setFields((fieldsResult.data || []) as Field[]);
    setEquipment((equipmentResult.data || []) as Equipment[]);
    setInventory((inventoryResult.data || []) as InventoryItem[]);
  }

  async function loadProducts(jobId: string) {
    const { data, error } = await supabase
      .from("work_order_products")
      .select("*")
      .eq("work_order_id", jobId)
      .order("product_name");

    if (error) return alert(error.message);

    setProducts((current) => ({
      ...current,
      [jobId]: (data || []) as WorkOrderProduct[],
    }));
  }

  async function saveJob() {
    if (!form.title.trim()) return alert("Enter a job title.");

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return alert("You must be logged in.");

      const field = fields.find((item) => item.id === form.field_id);

      const { error } = await supabase.from("work_orders").insert({
        user_id: authData.user.id,
        title: form.title.trim(),
        field_id: form.field_id || null,
        field_name: field?.field_name || null,
        activity_type: form.activity_type,
        planned_date: form.planned_date || null,
        operator_name: form.operator_name.trim() || null,
        equipment_id: form.equipment_id || null,
        implement_name: form.implement_name.trim() || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        diesel_litres: form.diesel_litres ? Number(form.diesel_litres) : null,
        status: form.status,
        notes: form.notes.trim() || null,
      });

      if (error) return alert(error.message);

      setForm(emptyJob);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function addProduct() {
    if (!selectedJob) return;
    if (!productForm.inventory_item_id || Number(productForm.quantity) <= 0) {
      return alert("Select a product and enter a valid quantity.");
    }

    const item = inventory.find(
      (inventoryItem) => inventoryItem.id === productForm.inventory_item_id
    );

    if (!item) return;

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return alert("You must be logged in.");

    const { error } = await supabase.from("work_order_products").insert({
      user_id: authData.user.id,
      work_order_id: selectedJob.id,
      inventory_item_id: item.id,
      product_name: item.name,
      quantity: Number(productForm.quantity),
      unit: item.unit,
      unit_cost: item.unit_cost,
    });

    if (error) return alert(error.message);

    setProductForm(emptyProduct);
    await loadProducts(selectedJob.id);
  }

  async function updateStatus(job: WorkOrder, status: string) {
    if (status === "Completed") {
      const jobProducts = products[job.id] || [];

      for (const product of jobProducts) {
        if (!product.inventory_item_id) continue;

        const item = inventory.find(
          (inventoryItem) => inventoryItem.id === product.inventory_item_id
        );

        if (!item) continue;
        if (product.quantity > item.quantity) {
          alert(`Not enough stock for ${item.name}.`);
          return;
        }
      }

      for (const product of jobProducts) {
        if (!product.inventory_item_id) continue;

        const item = inventory.find(
          (inventoryItem) => inventoryItem.id === product.inventory_item_id
        );
        if (!item) continue;

        const newQuantity = item.quantity - product.quantity;

        const { error: movementError } = await supabase
          .from("inventory_transactions")
          .insert({
            user_id: job.user_id,
            inventory_item_id: item.id,
            transaction_date: new Date().toISOString().slice(0, 10),
            transaction_type: "Stock Out",
            quantity: product.quantity,
            unit_cost: product.unit_cost,
            reference: job.title,
            notes: `Used on work order ${job.title}`,
          });

        if (movementError) return alert(movementError.message);

        const { error: inventoryError } = await supabase
          .from("inventory_items")
          .update({ quantity: newQuantity })
          .eq("id", item.id);

        if (inventoryError) return alert(inventoryError.message);
      }

      const field = fields.find((item) => item.id === job.field_id);

      const { error: activityError } = await supabase.from("activities").insert({
        user_id: job.user_id,
        activity_type: job.activity_type,
        field_name: job.field_name || "Unassigned",
        crop: field?.crop || null,
        date: new Date().toISOString().slice(0, 10),
        area_ha: field?.area_ha || null,
        notes: job.notes || `Completed work order: ${job.title}`,
      });

      if (activityError) return alert(activityError.message);
    }

    const { error } = await supabase
      .from("work_orders")
      .update({
        status,
        completed_at: status === "Completed" ? new Date().toISOString() : null,
      })
      .eq("id", job.id);

    if (error) return alert(error.message);

    await loadAll();
  }

  useEffect(() => {
    setForm(emptyJob);
    void loadAll();
  }, [currentSeason]);

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">Job Cards</h1>
          <p className="mt-2 text-gray-400">
            Plan work, assign machinery and deduct products when jobs are completed.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Back to Dashboard
        </Link>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-5 text-2xl font-bold text-green-400">New Job Card</h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Job title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <Select label="Field" value={form.field_id} onChange={(value) => setForm({ ...form, field_id: value })}>
            <option value="">Select field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>{field.field_name}</option>
            ))}
          </Select>
          <Select label="Activity" value={form.activity_type} onChange={(value) => setForm({ ...form, activity_type: value })}>
            {["Spraying","Planting","Fertilising","Harvesting","Scouting","Cultivation"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          <Input label="Planned date" type="date" value={form.planned_date} onChange={(value) => setForm({ ...form, planned_date: value })} />
          <Input label="Operator" value={form.operator_name} onChange={(value) => setForm({ ...form, operator_name: value })} />
          <Select label="Machine" value={form.equipment_id} onChange={(value) => setForm({ ...form, equipment_id: value })}>
            <option value="">Select machine</option>
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Input label="Implement" value={form.implement_name} onChange={(value) => setForm({ ...form, implement_name: value })} />
          <Input label="Estimated hours" type="number" value={form.estimated_hours} onChange={(value) => setForm({ ...form, estimated_hours: value })} />
          <Input label="Diesel litres" type="number" value={form.diesel_litres} onChange={(value) => setForm({ ...form, diesel_litres: value })} />
        </div>

        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Instructions or notes..."
          className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
        />

        <button
          type="button"
          onClick={saveJob}
          disabled={saving}
          className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Job Card"}
        </button>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => (
          <article key={job.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">{job.activity_type}</p>
                <h2 className="text-2xl font-bold text-green-400">{job.title}</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {job.field_name || "No field"} · {job.planned_date || "No date"}
                </p>
              </div>
              <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400">
                {job.status}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  setSelectedJob(job);
                  await loadProducts(job.id);
                }}
                className="rounded-xl border border-white/10 px-4 py-2"
              >
                Products
              </button>

              {job.status !== "Completed" && (
                <button
                  type="button"
                  onClick={() => updateStatus(job, "Completed")}
                  className="rounded-xl bg-green-500 px-4 py-2 font-bold text-black"
                >
                  Complete Job
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      {selectedJob && (
        <aside className="fixed right-0 top-0 z-50 h-screen w-full overflow-y-auto border-l border-white/10 bg-[#08110d] p-6 shadow-2xl sm:w-[460px]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Job Products</p>
              <h2 className="text-2xl font-black text-green-400">{selectedJob.title}</h2>
            </div>
            <button type="button" onClick={() => setSelectedJob(null)} className="text-2xl">✕</button>
          </div>

          <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <Select
              label="Inventory item"
              value={productForm.inventory_item_id}
              onChange={(value) => setProductForm({ ...productForm, inventory_item_id: value })}
            >
              <option value="">Select product</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.location || "Unassigned shed"} · {item.name} ({item.quantity} {item.unit})
                </option>
              ))}
            </Select>

            <Input
              label="Quantity"
              type="number"
              value={productForm.quantity}
              onChange={(value) => setProductForm({ ...productForm, quantity: value })}
            />

            <button
              type="button"
              onClick={addProduct}
              className="w-full rounded-xl bg-green-500 py-3 font-bold text-black"
            >
              Add Product
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {(products[selectedJob.id] || []).map((product) => (
              <article key={product.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <strong className="text-green-400">{product.product_name}</strong>
                <p className="mt-1">{product.quantity} {product.unit}</p>
              </article>
            ))}
          </div>
        </aside>
      )}
    </main>
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
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
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
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
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
