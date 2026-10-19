"use client";

export { default } from "@/components/grain/GrainMarketWorkspace";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type {
  GrainPosition,
  ProductionForecast,
} from "@/types/grain";

const emptyForecast = {
  season: "2026/2027",
  commodity: "White Maize",
  expected_tonnes: "",
  notes: "",
};

const emptyPosition = {
  season: "2026/2027",
  commodity: "White Maize",
  position_type: "Physical Contract",
  contract_date: "",
  delivery_month: "",
  tonnes: "",
  price_per_tonne: "",
  strike_price: "",
  premium_per_tonne: "",
  buyer_or_broker: "",
  reference: "",
  status: "Open",
  notes: "",
};

function LegacyGrainMarketingPage() {
  const [forecasts, setForecasts] = useState<ProductionForecast[]>([]);
  const [positions, setPositions] = useState<GrainPosition[]>([]);
  const [forecastForm, setForecastForm] = useState(emptyForecast);
  const [positionForm, setPositionForm] = useState(emptyPosition);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [forecastResult, positionResult] = await Promise.all([
      supabase
        .from("production_forecasts")
        .select("*")
        .order("season", { ascending: false })
        .order("commodity"),
      supabase
        .from("grain_positions")
        .select("*")
        .order("contract_date", { ascending: false }),
    ]);

    if (forecastResult.error) alert(forecastResult.error.message);
    if (positionResult.error) alert(positionResult.error.message);

    setForecasts(
      (forecastResult.data || []) as ProductionForecast[]
    );
    setPositions((positionResult.data || []) as GrainPosition[]);
  }

  async function saveForecast() {
    if (!forecastForm.expected_tonnes) {
      alert("Enter expected tonnes.");
      return;
    }

    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const { error } = await supabase
        .from("production_forecasts")
        .upsert(
          {
            user_id: data.user.id,
            season: forecastForm.season,
            commodity: forecastForm.commodity,
            expected_tonnes: Number(
              forecastForm.expected_tonnes
            ),
            notes: forecastForm.notes.trim() || null,
          },
          {
            onConflict: "user_id,season,commodity",
          }
        );

      if (error) {
        alert(error.message);
        return;
      }

      setForecastForm(emptyForecast);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function savePosition() {
    if (!positionForm.tonnes) {
      alert("Enter tonnes.");
      return;
    }

    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        alert("You must be logged in.");
        return;
      }

      const { error } = await supabase
        .from("grain_positions")
        .insert({
          user_id: data.user.id,
          season: positionForm.season,
          commodity: positionForm.commodity,
          position_type: positionForm.position_type,
          contract_date: positionForm.contract_date || null,
          delivery_month:
            positionForm.delivery_month.trim() || null,
          tonnes: Number(positionForm.tonnes),
          price_per_tonne: positionForm.price_per_tonne
            ? Number(positionForm.price_per_tonne)
            : null,
          strike_price: positionForm.strike_price
            ? Number(positionForm.strike_price)
            : null,
          premium_per_tonne: positionForm.premium_per_tonne
            ? Number(positionForm.premium_per_tonne)
            : null,
          buyer_or_broker:
            positionForm.buyer_or_broker.trim() || null,
          reference: positionForm.reference.trim() || null,
          status: positionForm.status,
          notes: positionForm.notes.trim() || null,
        });

      if (error) {
        alert(error.message);
        return;
      }

      setPositionForm(emptyPosition);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const summaries = useMemo(() => {
    return forecasts.map((forecast) => {
      const matchingPositions = positions.filter(
        (position) =>
          position.season === forecast.season &&
          position.commodity === forecast.commodity &&
          position.status !== "Cancelled"
      );

      const hedgedTonnes = matchingPositions.reduce(
        (sum, position) => sum + position.tonnes,
        0
      );

      const fixedPricePositions = matchingPositions.filter(
        (position) => position.price_per_tonne !== null
      );

      const weightedValue = fixedPricePositions.reduce(
        (sum, position) =>
          sum +
          position.tonnes *
            (position.price_per_tonne || 0),
        0
      );

      const fixedTonnes = fixedPricePositions.reduce(
        (sum, position) => sum + position.tonnes,
        0
      );

      const averagePrice =
        fixedTonnes > 0 ? weightedValue / fixedTonnes : null;

      return {
        forecast,
        hedgedTonnes,
        unpricedTonnes: Math.max(
          forecast.expected_tonnes - hedgedTonnes,
          0
        ),
        hedgePercentage:
          forecast.expected_tonnes > 0
            ? (hedgedTonnes / forecast.expected_tonnes) * 100
            : 0,
        averagePrice,
      };
    });
  }, [forecasts, positions]);

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>

          <h1 className="mt-2 text-4xl font-black">
            Grain Marketing & SAFEX
          </h1>

          <p className="mt-2 text-gray-400">
            Track production forecasts, physical contracts,
            futures, options and unpriced tonnes.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-5 text-2xl font-bold text-green-400">
            Production Forecast
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Season"
              value={forecastForm.season}
              onChange={(value) =>
                setForecastForm({
                  ...forecastForm,
                  season: value,
                })
              }
            />

            <CommoditySelect
              value={forecastForm.commodity}
              onChange={(value) =>
                setForecastForm({
                  ...forecastForm,
                  commodity: value,
                })
              }
            />

            <Input
              label="Expected tonnes"
              type="number"
              value={forecastForm.expected_tonnes}
              onChange={(value) =>
                setForecastForm({
                  ...forecastForm,
                  expected_tonnes: value,
                })
              }
            />
          </div>

          <textarea
            rows={3}
            value={forecastForm.notes}
            onChange={(event) =>
              setForecastForm({
                ...forecastForm,
                notes: event.target.value,
              })
            }
            placeholder="Forecast notes"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />

          <button
            type="button"
            onClick={saveForecast}
            disabled={saving}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            Save Forecast
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-5 text-2xl font-bold text-green-400">
            New Grain Position
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Season"
              value={positionForm.season}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  season: value,
                })
              }
            />

            <CommoditySelect
              value={positionForm.commodity}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  commodity: value,
                })
              }
            />

            <Select
              label="Position type"
              value={positionForm.position_type}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  position_type: value,
                })
              }
            >
              <option>Physical Contract</option>
              <option>Futures Sell</option>
              <option>Put Option</option>
              <option>Call Option</option>
              <option>Minimum Price Contract</option>
              <option>Other</option>
            </Select>

            <Input
              label="Contract date"
              type="date"
              value={positionForm.contract_date}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  contract_date: value,
                })
              }
            />

            <Input
              label="Delivery month"
              value={positionForm.delivery_month}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  delivery_month: value,
                })
              }
            />

            <Input
              label="Tonnes"
              type="number"
              value={positionForm.tonnes}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  tonnes: value,
                })
              }
            />

            <Input
              label="Fixed price (R/t)"
              type="number"
              value={positionForm.price_per_tonne}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  price_per_tonne: value,
                })
              }
            />

            <Input
              label="Strike price (R/t)"
              type="number"
              value={positionForm.strike_price}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  strike_price: value,
                })
              }
            />

            <Input
              label="Premium (R/t)"
              type="number"
              value={positionForm.premium_per_tonne}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  premium_per_tonne: value,
                })
              }
            />

            <Input
              label="Buyer / broker"
              value={positionForm.buyer_or_broker}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  buyer_or_broker: value,
                })
              }
            />

            <Input
              label="Reference"
              value={positionForm.reference}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  reference: value,
                })
              }
            />

            <Select
              label="Status"
              value={positionForm.status}
              onChange={(value) =>
                setPositionForm({
                  ...positionForm,
                  status: value,
                })
              }
            >
              <option>Open</option>
              <option>Delivered</option>
              <option>Closed</option>
              <option>Cancelled</option>
            </Select>
          </div>

          <textarea
            rows={3}
            value={positionForm.notes}
            onChange={(event) =>
              setPositionForm({
                ...positionForm,
                notes: event.target.value,
              })
            }
            placeholder="Position notes"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />

          <button
            type="button"
            onClick={savePosition}
            disabled={saving}
            className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            Save Position
          </button>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">
          Marketing Exposure
        </h2>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <article
              key={summary.forecast.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <p className="text-sm text-gray-500">
                {summary.forecast.season}
              </p>

              <h3 className="text-2xl font-bold text-green-400">
                {summary.forecast.commodity}
              </h3>

              <div className="mt-5 space-y-3">
                <Row
                  label="Expected production"
                  value={`${summary.forecast.expected_tonnes.toFixed(
                    2
                  )} t`}
                />

                <Row
                  label="Hedged / contracted"
                  value={`${summary.hedgedTonnes.toFixed(2)} t`}
                />

                <Row
                  label="Unpriced exposure"
                  value={`${summary.unpricedTonnes.toFixed(2)} t`}
                />

                <Row
                  label="Hedge percentage"
                  value={`${summary.hedgePercentage.toFixed(1)}%`}
                />

                <Row
                  label="Average fixed price"
                  value={
                    summary.averagePrice !== null
                      ? `R${summary.averagePrice.toFixed(2)}/t`
                      : "Not set"
                  }
                />
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{
                    width: `${Math.min(
                      summary.hedgePercentage,
                      100
                    )}%`,
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">
          Position Register
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-gray-400">
              <tr>
                <th className="px-4 py-3">Season</th>
                <th className="px-4 py-3">Commodity</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Tonnes</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Strike</th>
                <th className="px-4 py-3">Premium</th>
                <th className="px-4 py-3">Buyer / Broker</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {positions.map((position) => (
                <tr
                  key={position.id}
                  className="border-b border-white/5"
                >
                  <td className="px-4 py-3">
                    {position.season}
                  </td>

                  <td className="px-4 py-3 font-bold text-green-400">
                    {position.commodity}
                  </td>

                  <td className="px-4 py-3">
                    {position.position_type}
                  </td>

                  <td className="px-4 py-3">
                    {position.tonnes.toFixed(2)} t
                  </td>

                  <td className="px-4 py-3">
                    {position.price_per_tonne !== null
                      ? `R${position.price_per_tonne.toFixed(2)}`
                      : "—"}
                  </td>

                  <td className="px-4 py-3">
                    {position.strike_price !== null
                      ? `R${position.strike_price.toFixed(2)}`
                      : "—"}
                  </td>

                  <td className="px-4 py-3">
                    {position.premium_per_tonne !== null
                      ? `R${position.premium_per_tonne.toFixed(2)}`
                      : "—"}
                  </td>

                  <td className="px-4 py-3">
                    {position.buyer_or_broker || "—"}
                  </td>

                  <td className="px-4 py-3">
                    {position.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-xs text-gray-500">
        This module records your own positions and forecasts. It does
        not yet fetch live SAFEX prices or provide financial advice.
      </p>
    </main>
  );
}

function CommoditySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      label="Commodity"
      value={value}
      onChange={onChange}
    >
      <option>White Maize</option>
      <option>Yellow Maize</option>
      <option>Sunflower</option>
      <option>Soybeans</option>
      <option>Wheat</option>
      <option>Sorghum</option>
      <option>Other</option>
    </Select>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
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
