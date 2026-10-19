"use client";

import type { AlertPreferences } from "@/types/alerts";

type Props = {
  preferences: AlertPreferences;
  saving: boolean;
  onChange: (
    name: keyof AlertPreferences,
    value: boolean | number
  ) => void;
  onSave: () => void;
};

export default function PreferencesPanel({
  preferences,
  saving,
  onChange,
  onSave,
}: Props) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-2xl font-bold text-green-400">
        Alert Preferences
      </h2>

      <div className="mt-5 space-y-4">
        <Toggle
          label="Low-stock alerts"
          checked={preferences.low_stock_enabled}
          onChange={(value) =>
            onChange("low_stock_enabled", value)
          }
        />

        <Toggle
          label="Equipment service alerts"
          checked={preferences.service_due_enabled}
          onChange={(value) =>
            onChange("service_due_enabled", value)
          }
        />

        <Toggle
          label="Overdue job alerts"
          checked={preferences.overdue_jobs_enabled}
          onChange={(value) =>
            onChange("overdue_jobs_enabled", value)
          }
        />

        <Toggle
          label="Negative field margin alerts"
          checked={preferences.negative_margin_enabled}
          onChange={(value) =>
            onChange("negative_margin_enabled", value)
          }
        />

        <Toggle
          label="Unpriced grain alerts"
          checked={preferences.unpriced_grain_enabled}
          onChange={(value) =>
            onChange("unpriced_grain_enabled", value)
          }
        />

        <div>
          <label className="mb-2 block text-sm text-gray-400">
            Upcoming job window (days)
          </label>

          <input
            type="number"
            min="1"
            max="30"
            value={preferences.upcoming_jobs_days}
            onChange={(event) =>
              onChange(
                "upcoming_jobs_days",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-6 w-full rounded-xl bg-green-500 py-3 font-bold text-black disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-black/20 p-4">
      <span className="text-sm text-gray-300">{label}</span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-green-500"
      />
    </label>
  );
}
