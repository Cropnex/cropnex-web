"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Employee, LabourEntry } from "@/types/labour";
import type { Field } from "@/types/field";
import type { WorkOrder } from "@/types/work-order";
import { useSeason } from "@/components/season/SeasonProvider";

const emptyEmployee = {
  full_name: "",
  role: "General Worker",
  phone: "",
  email: "",
  hourly_rate: "",
  employment_type: "Permanent",
  status: "Active",
  notes: "",
};

const emptyEntry = {
  employee_id: "",
  field_id: "",
  work_order_id: "",
  work_date: "",
  start_time: "",
  end_time: "",
  hours_worked: "",
  activity_type: "General",
  description: "",
  notes: "",
};

export default function LabourPage() {
  const { currentSeason } = useSeason();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<LabourEntry[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [editingEmployeeId, setEditingEmployeeId] =
    useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    if (!currentSeason) return;
    const [employeesResult, entriesResult, fieldsResult, jobsResult] =
      await Promise.all([
        supabase.from("employees").select("*").order("full_name"),
        supabase
          .from("labour_entries")
          .select("*")
          .order("work_date", { ascending: false }),
        supabase.from("fields").select("*").eq("season", currentSeason).order("farm_name").order("field_name"),
        supabase.from("work_orders").select("*").order("title"),
      ]);

    if (employeesResult.error) alert(employeesResult.error.message);
    if (entriesResult.error) alert(entriesResult.error.message);
    if (fieldsResult.error) alert(fieldsResult.error.message);
    if (jobsResult.error) alert(jobsResult.error.message);

    setEmployees((employeesResult.data || []) as Employee[]);
    setEntries((entriesResult.data || []) as LabourEntry[]);
    setFields((fieldsResult.data || []) as Field[]);
    setJobs((jobsResult.data || []) as WorkOrder[]);
  }

  async function saveEmployee() {
    if (!employeeForm.full_name.trim()) {
      alert("Enter an employee name.");
      return;
    }

    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const payload = {
        user_id: data.user.id,
        full_name: employeeForm.full_name.trim(),
        role: employeeForm.role,
        phone: employeeForm.phone.trim() || null,
        email: employeeForm.email.trim() || null,
        hourly_rate: employeeForm.hourly_rate
          ? Number(employeeForm.hourly_rate)
          : null,
        employment_type: employeeForm.employment_type,
        status: employeeForm.status,
        notes: employeeForm.notes.trim() || null,
      };

      const query = editingEmployeeId
        ? supabase
            .from("employees")
            .update(payload)
            .eq("id", editingEmployeeId)
        : supabase.from("employees").insert(payload);

      const { error } = await query;

      if (error) {
        alert(error.message);
        return;
      }

      setEditingEmployeeId(null);
      setEmployeeForm(emptyEmployee);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  function editEmployee(employee: Employee) {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      full_name: employee.full_name,
      role: employee.role,
      phone: employee.phone || "",
      email: employee.email || "",
      hourly_rate:
        employee.hourly_rate !== null
          ? String(employee.hourly_rate)
          : "",
      employment_type: employee.employment_type,
      status: employee.status,
      notes: employee.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function calculateHours() {
    if (!entryForm.start_time || !entryForm.end_time) return "";

    const [startHour, startMinute] = entryForm.start_time
      .split(":")
      .map(Number);
    const [endHour, endMinute] = entryForm.end_time
      .split(":")
      .map(Number);

    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const minutes = Math.max(end - start, 0);

    return (minutes / 60).toFixed(2);
  }

  async function saveEntry() {
    if (!entryForm.employee_id || !entryForm.work_date) {
      alert("Select an employee and date.");
      return;
    }

    const employee = employees.find(
      (item) => item.id === entryForm.employee_id
    );

    if (!employee) return;

    const hours = entryForm.hours_worked
      ? Number(entryForm.hours_worked)
      : Number(calculateHours());

    if (!hours || hours <= 0) {
      alert("Enter valid hours worked.");
      return;
    }

    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const hourlyRate = employee.hourly_rate;
      const totalCost =
        hourlyRate !== null ? hourlyRate * hours : null;

      const { error } = await supabase
        .from("labour_entries")
        .insert({
          user_id: data.user.id,
          employee_id: employee.id,
          field_id: entryForm.field_id || null,
          work_order_id: entryForm.work_order_id || null,
          work_date: entryForm.work_date,
          start_time: entryForm.start_time || null,
          end_time: entryForm.end_time || null,
          hours_worked: hours,
          activity_type: entryForm.activity_type,
          description: entryForm.description.trim() || null,
          hourly_rate: hourlyRate,
          total_cost: totalCost,
          notes: entryForm.notes.trim() || null,
        });

      if (error) {
        alert(error.message);
        return;
      }

      if (entryForm.field_id && totalCost !== null) {
        const { error: financialError } = await supabase
          .from("financial_transactions")
          .insert({
            user_id: data.user.id,
            field_id: entryForm.field_id,
            transaction_date: entryForm.work_date,
            transaction_type: "Expense",
            category: "Labour",
            description:
              entryForm.description.trim() ||
              `Labour - ${employee.full_name}`,
            quantity: hours,
            unit: "hours",
            unit_price: hourlyRate,
            amount: totalCost,
            supplier_or_customer: employee.full_name,
            reference: entryForm.work_order_id || null,
            notes: entryForm.notes.trim() || null,
          });

        if (financialError) {
          alert(financialError.message);
          return;
        }
      }

      setEntryForm(emptyEntry);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    setEntryForm(emptyEntry);
    void loadAll();
  }, [currentSeason]);

  const totals = useMemo(() => {
    const totalHours = entries.reduce(
      (sum, entry) => sum + entry.hours_worked,
      0
    );

    const totalCost = entries.reduce(
      (sum, entry) => sum + (entry.total_cost || 0),
      0
    );

    const activeEmployees = employees.filter(
      (employee) => employee.status === "Active"
    ).length;

    return {
      totalHours,
      totalCost,
      activeEmployees,
    };
  }, [entries, employees]);

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Labour & Operators
          </h1>
          <p className="mt-2 text-gray-400">
            Manage employees, hours, field work and labour costs.
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
          label="Active employees"
          value={String(totals.activeEmployees)}
        />
        <Summary
          label="Total hours"
          value={totals.totalHours.toFixed(2)}
        />
        <Summary
          label="Total labour cost"
          value={`R${totals.totalCost.toFixed(2)}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-5 text-2xl font-bold text-green-400">
            {editingEmployeeId ? "Edit Employee" : "New Employee"}
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Full name"
              value={employeeForm.full_name}
              onChange={(value) =>
                setEmployeeForm({
                  ...employeeForm,
                  full_name: value,
                })
              }
            />

            <Select
              label="Role"
              value={employeeForm.role}
              onChange={(value) =>
                setEmployeeForm({ ...employeeForm, role: value })
              }
            >
              {[
                "General Worker",
                "Operator",
                "Driver",
                "Mechanic",
                "Supervisor",
                "Manager",
                "Other",
              ].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </Select>

            <Input
              label="Phone"
              value={employeeForm.phone}
              onChange={(value) =>
                setEmployeeForm({ ...employeeForm, phone: value })
              }
            />

            <Input
              label="Email"
              type="email"
              value={employeeForm.email}
              onChange={(value) =>
                setEmployeeForm({ ...employeeForm, email: value })
              }
            />

            <Input
              label="Hourly rate (R)"
              type="number"
              value={employeeForm.hourly_rate}
              onChange={(value) =>
                setEmployeeForm({
                  ...employeeForm,
                  hourly_rate: value,
                })
              }
            />

            <Select
              label="Employment type"
              value={employeeForm.employment_type}
              onChange={(value) =>
                setEmployeeForm({
                  ...employeeForm,
                  employment_type: value,
                })
              }
            >
              <option>Permanent</option>
              <option>Seasonal</option>
              <option>Contract</option>
              <option>Casual</option>
            </Select>

            <Select
              label="Status"
              value={employeeForm.status}
              onChange={(value) =>
                setEmployeeForm({
                  ...employeeForm,
                  status: value,
                })
              }
            >
              <option>Active</option>
              <option>On Leave</option>
              <option>Inactive</option>
            </Select>
          </div>

          <textarea
            rows={3}
            value={employeeForm.notes}
            onChange={(event) =>
              setEmployeeForm({
                ...employeeForm,
                notes: event.target.value,
              })
            }
            placeholder="Notes"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={saveEmployee}
              disabled={saving}
              className="rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
            >
              {editingEmployeeId
                ? "Update Employee"
                : "Save Employee"}
            </button>

            {editingEmployeeId && (
              <button
                type="button"
                onClick={() => {
                  setEditingEmployeeId(null);
                  setEmployeeForm(emptyEmployee);
                }}
                className="rounded-xl border border-white/10 px-6 py-3"
              >
                Cancel
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-5 text-2xl font-bold text-green-400">
            Record Labour
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Employee"
              value={entryForm.employee_id}
              onChange={(value) =>
                setEntryForm({
                  ...entryForm,
                  employee_id: value,
                })
              }
            >
              <option value="">Select employee</option>
              {employees
                .filter((employee) => employee.status === "Active")
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
            </Select>

            <Input
              label="Date"
              type="date"
              value={entryForm.work_date}
              onChange={(value) =>
                setEntryForm({ ...entryForm, work_date: value })
              }
            />

            <Select
              label="Field"
              value={entryForm.field_id}
              onChange={(value) =>
                setEntryForm({ ...entryForm, field_id: value })
              }
            >
              <option value="">General / no field</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.field_name}
                </option>
              ))}
            </Select>

            <Select
              label="Job card"
              value={entryForm.work_order_id}
              onChange={(value) =>
                setEntryForm({
                  ...entryForm,
                  work_order_id: value,
                })
              }
            >
              <option value="">No job card</option>
              {jobs
                .filter((job) => job.status !== "Completed")
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
            </Select>

            <Input
              label="Start time"
              type="time"
              value={entryForm.start_time}
              onChange={(value) =>
                setEntryForm({ ...entryForm, start_time: value })
              }
            />

            <Input
              label="End time"
              type="time"
              value={entryForm.end_time}
              onChange={(value) =>
                setEntryForm({ ...entryForm, end_time: value })
              }
            />

            <Input
              label="Hours worked"
              type="number"
              value={
                entryForm.hours_worked || calculateHours()
              }
              onChange={(value) =>
                setEntryForm({
                  ...entryForm,
                  hours_worked: value,
                })
              }
            />

            <Select
              label="Activity"
              value={entryForm.activity_type}
              onChange={(value) =>
                setEntryForm({
                  ...entryForm,
                  activity_type: value,
                })
              }
            >
              {[
                "General",
                "Spraying",
                "Planting",
                "Fertilising",
                "Harvesting",
                "Scouting",
                "Maintenance",
                "Driving",
              ].map((activity) => (
                <option key={activity}>{activity}</option>
              ))}
            </Select>

            <Input
              label="Description"
              value={entryForm.description}
              onChange={(value) =>
                setEntryForm({
                  ...entryForm,
                  description: value,
                })
              }
            />
          </div>

          <textarea
            rows={3}
            value={entryForm.notes}
            onChange={(event) =>
              setEntryForm({
                ...entryForm,
                notes: event.target.value,
              })
            }
            placeholder="Notes"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />

          <button
            type="button"
            onClick={saveEntry}
            disabled={saving}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            Save Labour Entry
          </button>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Employees</h2>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee) => (
            <article
              key={employee.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">
                    {employee.role}
                  </p>
                  <h3 className="text-2xl font-bold text-green-400">
                    {employee.full_name}
                  </h3>
                </div>

                <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400">
                  {employee.status}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-300">
                <p>
                  Employment: {employee.employment_type}
                </p>
                <p>
                  Rate:{" "}
                  {employee.hourly_rate !== null
                    ? `R${employee.hourly_rate.toFixed(2)}/h`
                    : "Not set"}
                </p>
                {employee.phone && <p>Phone: {employee.phone}</p>}
              </div>

              <button
                type="button"
                onClick={() => editEmployee(employee)}
                className="mt-5 rounded-xl border border-white/10 px-4 py-2"
              >
                Edit
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">
          Recent Labour Entries
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-gray-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Field</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Cost</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 30).map((entry) => {
                const employee = employees.find(
                  (item) => item.id === entry.employee_id
                );
                const field = fields.find(
                  (item) => item.id === entry.field_id
                );

                return (
                  <tr
                    key={entry.id}
                    className="border-b border-white/5"
                  >
                    <td className="px-4 py-3">
                      {entry.work_date}
                    </td>
                    <td className="px-4 py-3 font-bold text-green-400">
                      {employee?.full_name || "Unknown"}
                    </td>
                    <td className="px-4 py-3">
                      {field?.field_name || "General"}
                    </td>
                    <td className="px-4 py-3">
                      {entry.activity_type || "General"}
                    </td>
                    <td className="px-4 py-3">
                      {entry.hours_worked.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.total_cost !== null
                        ? `R${entry.total_cost.toFixed(2)}`
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
