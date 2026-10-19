"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field, Point } from "@/types/field";
import type {
  DailyWeather,
  HourlyWeather,
  WeatherResponse,
} from "@/types/weather";
import { useSeason } from "@/components/season/SeasonProvider";

const fallbackLocation = {
  latitude: -26.905,
  longitude: 27.457,
  label: "Parys / Koppies Area",
};

function boundaryCentre(boundary: Point[] | null) {
  if (!boundary || boundary.length === 0) return null;

  const total = boundary.reduce(
    (accumulator, point) => ({
      latitude: accumulator.latitude + point.lat,
      longitude: accumulator.longitude + point.lng,
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: total.latitude / boundary.length,
    longitude: total.longitude / boundary.length,
  };
}

export default function WeatherPage() {
  const { currentSeason } = useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");

  const selectedField = fields.find(
    (field) => field.id === selectedFieldId
  );

  const selectedLocation = useMemo(() => {
    const centre = boundaryCentre(selectedField?.boundary || null);

    if (centre) {
      return {
        ...centre,
        label: selectedField?.field_name || "Selected field",
      };
    }

    return fallbackLocation;
  }, [selectedField]);

  async function loadFields() {
    if (!currentSeason) return;
    const { data, error } = await supabase
      .from("fields")
      .select("*")
      .eq("season", currentSeason)
      .order("farm_name")
      .order("field_name");

    if (error) {
      alert(error.message);
      return;
    }

    const loadedFields = (data || []) as Field[];
    setFields(loadedFields);

    if (loadedFields.length > 0) {
      setSelectedFieldId((current) => current || loadedFields[0].id);
    }
  }

  async function loadWeather() {
    setLoading(true);

    try {
      const parameters = new URLSearchParams({
        latitude: String(selectedLocation.latitude),
        longitude: String(selectedLocation.longitude),
        timezone: "Africa/Johannesburg",
        forecast_days: "7",
        current: [
          "temperature_2m",
          "relative_humidity_2m",
          "apparent_temperature",
          "precipitation",
          "weather_code",
          "wind_speed_10m",
          "wind_direction_10m",
          "wind_gusts_10m",
        ].join(","),
        hourly: [
          "temperature_2m",
          "precipitation_probability",
          "precipitation",
          "wind_speed_10m",
          "wind_gusts_10m",
          "relative_humidity_2m",
        ].join(","),
        daily: [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_sum",
          "precipitation_probability_max",
          "wind_speed_10m_max",
          "wind_gusts_10m_max",
        ].join(","),
      });

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${parameters.toString()}`
      );

      if (!response.ok) {
        throw new Error("Weather service could not be reached.");
      }

      const result = (await response.json()) as WeatherResponse;
      setWeather(result);
      setUpdatedAt(new Date().toLocaleTimeString("en-ZA"));
    } catch (error) {
      console.error(error);
      alert("Could not load weather data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedFieldId("");
    void loadFields();
  }, [currentSeason]);

  useEffect(() => {
    void loadWeather();
  }, [selectedLocation.latitude, selectedLocation.longitude]);

  const dailyForecast: DailyWeather[] = useMemo(() => {
    if (!weather) return [];

    return weather.daily.time.map((date, index) => ({
      date,
      weatherCode: weather.daily.weather_code[index],
      temperatureMax: weather.daily.temperature_2m_max[index],
      temperatureMin: weather.daily.temperature_2m_min[index],
      precipitationSum: weather.daily.precipitation_sum[index],
      precipitationProbabilityMax:
        weather.daily.precipitation_probability_max[index],
      windSpeedMax: weather.daily.wind_speed_10m_max[index],
      windGustsMax: weather.daily.wind_gusts_10m_max[index],
    }));
  }, [weather]);

  const nextTwelveHours: HourlyWeather[] = useMemo(() => {
    if (!weather) return [];

    const currentIndex = weather.hourly.time.findIndex(
      (time) => new Date(time).getTime() >= Date.now()
    );
    const startIndex = currentIndex >= 0 ? currentIndex : 0;

    return weather.hourly.time
      .slice(startIndex, startIndex + 12)
      .map((time, relativeIndex) => {
        const index = startIndex + relativeIndex;

        return {
          time,
          temperature: weather.hourly.temperature_2m[index],
          precipitationProbability:
            weather.hourly.precipitation_probability[index],
          precipitation: weather.hourly.precipitation[index],
          windSpeed: weather.hourly.wind_speed_10m[index],
          windGusts: weather.hourly.wind_gusts_10m[index],
          humidity: weather.hourly.relative_humidity_2m[index],
        };
      });
  }, [weather]);

  const sprayAssessment = useMemo(() => {
    if (!weather) {
      return {
        status: "Unknown",
        message: "Weather data not loaded.",
        className: "text-gray-400",
      };
    }

    const current = weather.current;

    if (
      current.precipitation > 0 ||
      current.wind_speed_10m > 20 ||
      current.wind_gusts_10m > 30
    ) {
      return {
        status: "Recommendation: avoid spraying",
        message:
          "Modelled rain or wind exceeds CropNex's configurable guidance threshold. Verify conditions on the field and the product label before deciding.",
        className: "text-red-400",
      };
    }

    if (
      current.wind_speed_10m > 15 ||
      current.wind_gusts_10m > 25 ||
      current.relative_humidity_2m < 35
    ) {
      return {
        status: "Recommendation: use caution",
        message:
          "Modelled wind, gust or humidity is close to the guidance threshold. Verify locally and follow the registered product label.",
        className: "text-amber-400",
      };
    }

    return {
      status: "Recommendation: conditions may be favourable",
      message:
        "Current modelled conditions are within CropNex's guidance thresholds. This is not approval to spray; confirm local conditions, the registered label and professional requirements.",
      className: "text-green-400",
    };
  }, [weather]);

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Weather & Spray Guidance
          </h1>
          <p className="mt-2 text-gray-400">
            Modelled weather and decision-support guidance for the selected field.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 px-5 py-3"
        >
          Back to Dashboard
        </Link>
      </div>

      <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[240px]">
            <label className="mb-2 block text-sm text-gray-400">
              Weather location
            </label>
            <select
              value={selectedFieldId}
              onChange={(event) =>
                setSelectedFieldId(event.target.value)
              }
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
            >
              {fields.length === 0 && (
                <option value="">Parys / Koppies Area</option>
              )}
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.field_name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-gray-400">
            <p>{selectedLocation.label}</p>
            <p>
              {selectedLocation.latitude.toFixed(5)},{" "}
              {selectedLocation.longitude.toFixed(5)}
            </p>
            {updatedAt && <p>Updated at {updatedAt}</p>}
          </div>

          <button
            type="button"
            onClick={loadWeather}
            className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
          >
            Refresh Weather
          </button>
        </div>
      </section>

      {loading || !weather ? (
        <p className="text-gray-400">Loading weather...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Summary
              label="Temperature"
              value={`${weather.current.temperature_2m.toFixed(1)}°C`}
              note={`Feels like ${weather.current.apparent_temperature.toFixed(1)}°C`}
            />
            <Summary
              label="Wind"
              value={`${weather.current.wind_speed_10m.toFixed(1)} km/h`}
              note={`Gusts ${weather.current.wind_gusts_10m.toFixed(1)} km/h`}
            />
            <Summary
              label="Humidity"
              value={`${weather.current.relative_humidity_2m.toFixed(0)}%`}
              note={`${weather.current.precipitation.toFixed(1)} mm current precipitation`}
            />
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-gray-400">
                Modelled spray guidance
              </p>
              <p
                className={`mt-2 text-2xl font-black ${sprayAssessment.className}`}
              >
                {sprayAssessment.status}
              </p>
              <p className="mt-2 text-sm text-gray-400">
                {sprayAssessment.message}
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-5 text-amber-100">
            Decision-support recommendation only. Weather models and field conditions can differ. CropNex does not authorise an application. The operator remains responsible for checking current on-site conditions, the registered product label, applicable law and any required professional advice.
          </p>

          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-bold">
              Seven-Day Forecast
            </h2>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {dailyForecast.map((day) => (
                <article
                  key={day.date}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5"
                >
                  <p className="font-bold text-green-400">
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                      "en-ZA",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      }
                    )}
                  </p>

                  <p className="mt-4 text-3xl font-black">
                    {day.temperatureMax.toFixed(0)}°
                    <span className="text-lg text-gray-500">
                      {" "}
                      / {day.temperatureMin.toFixed(0)}°
                    </span>
                  </p>

                  <div className="mt-4 space-y-2 text-sm text-gray-300">
                    <Row
                      label="Rain chance"
                      value={`${day.precipitationProbabilityMax}%`}
                    />
                    <Row
                      label="Rain total"
                      value={`${day.precipitationSum.toFixed(1)} mm`}
                    />
                    <Row
                      label="Max wind"
                      value={`${day.windSpeedMax.toFixed(1)} km/h`}
                    />
                    <Row
                      label="Max gust"
                      value={`${day.windGustsMax.toFixed(1)} km/h`}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-bold">
              Next 12 Hours
            </h2>

            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Temp</th>
                    <th className="px-4 py-3">Rain chance</th>
                    <th className="px-4 py-3">Rain</th>
                    <th className="px-4 py-3">Wind</th>
                    <th className="px-4 py-3">Gusts</th>
                    <th className="px-4 py-3">Humidity</th>
                  </tr>
                </thead>
                <tbody>
                  {nextTwelveHours.map((hour) => (
                    <tr
                      key={hour.time}
                      className="border-b border-white/5"
                    >
                      <td className="px-4 py-3 font-medium">
                        {new Date(hour.time).toLocaleTimeString(
                          "en-ZA",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {hour.temperature.toFixed(1)}°C
                      </td>
                      <td className="px-4 py-3">
                        {hour.precipitationProbability}%
                      </td>
                      <td className="px-4 py-3">
                        {hour.precipitation.toFixed(1)} mm
                      </td>
                      <td className="px-4 py-3">
                        {hour.windSpeed.toFixed(1)} km/h
                      </td>
                      <td className="px-4 py-3">
                        {hour.windGusts.toFixed(1)} km/h
                      </td>
                      <td className="px-4 py-3">
                        {hour.humidity}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="mt-8 text-xs text-gray-500">
        Weather data: Open-Meteo. Forecasts are modelled estimates and
        should be checked against local conditions before operational
        decisions.
      </p>
    </main>
  );
}

function Summary({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-green-400">
        {value}
      </p>
      <p className="mt-2 text-sm text-gray-400">{note}</p>
    </div>
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
      <span className="text-gray-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
