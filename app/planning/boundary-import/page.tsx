"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import shp from "shpjs";
import { supabase } from "@/lib/supabase";
import { categoryColor, createFeatureCollection, geometryAreaHa, geometryPoints, geometryPolygons, validCoordinates } from "@/lib/geojson-layer";
import type { GeoJsonFeature, GeoJsonGeometry, MapPoint } from "@/lib/geojson-layer";
import { useSeason } from "@/components/season/SeasonProvider";
import type { Field } from "@/types/field";

type ImportMode = "map-layer" | "field-boundaries";
type ImportAction = "create" | "update" | "skip";
type PreviewFeature = {
  key: string;
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
  areaHa: number;
  name: string;
  action: ImportAction;
  targetId: string;
  warning: string | null;
};

const nameHints = ["field_name", "fieldname", "field", "name", "land", "kamp", "block", "id"];
const mapLayerTypes = ["Soil classification", "NDVI", "Elevation", "Yield", "Planting", "Field boundary", "Other"];
const layerBucket = "cropnex-layers";

export default function BoundaryImportPage() {
  const { currentSeason } = useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [features, setFeatures] = useState<PreviewFeature[]>([]);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [displayAttribute, setDisplayAttribute] = useState("");
  const [nameAttribute, setNameAttribute] = useState("");
  const [mode, setMode] = useState<ImportMode>("map-layer");
  const [layerType, setLayerType] = useState("Soil classification");
  const [farmName, setFarmName] = useState("");
  const [season, setSeason] = useState("");
  const [crop, setCrop] = useState("");
  const [cultivar, setCultivar] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const selectedSeason = season || currentSeason;

  async function loadFields() {
    if (!currentSeason) return;
    const { data, error: loadError } = await supabase.from("fields").select("*").eq("season", currentSeason).order("farm_name").order("field_name");
    if (loadError) setError(`Could not load your field register: ${loadError.message}`);
    setFields((data || []) as Field[]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFields();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSeason]);

  async function parseFile() {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Choose a ZIP containing the .shp, .shx and .dbf files. Include the .prj file so the map can be placed correctly.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError("This file is larger than 30 MB. Export a smaller area or split the source map into smaller farm groups.");
      return;
    }
    setParsing(true);
    setError("");
    setResult("");
    try {
      const parsed = await shp(await file.arrayBuffer());
      const collections = Array.isArray(parsed) ? parsed : [parsed];
      const sourceFeatures = collections.flatMap((collection) => collection.features || []) as GeoJsonFeature[];
      const polygonFeatures = sourceFeatures.filter((feature) => geometryPolygons(feature.geometry).length > 0);
      if (!polygonFeatures.length) throw new Error("No Polygon or MultiPolygon features were found in this ZIP.");

      const keys = Array.from(new Set(polygonFeatures.flatMap((feature) => Object.keys(feature.properties || {}))));
      const detectedName = nameHints.map((hint) => keys.find((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === hint.replace(/_/g, ""))).find(Boolean) || keys[0] || "";
      setAttributes(keys);
      setNameAttribute(detectedName);
      setDisplayAttribute(keys.find((key) => /soil|class|type|zone|crop|yield/i.test(key)) || keys[0] || "");
      setFeatures(polygonFeatures.map((feature, index) => {
        const properties = feature.properties || {};
        const geometry = feature.geometry as GeoJsonGeometry;
        const polygons = geometryPolygons(geometry);
        const baseName = String(properties[detectedName] ?? `Field ${index + 1}`).trim() || `Field ${index + 1}`;
        const matchingField = findField(fields, baseName);
        const hasHoles = polygons.some((polygon) => polygon.length > 1);
        const multipart = polygons.length > 1;
        const valid = validCoordinates(geometry);
        const warning = !valid
          ? "Coordinates are outside valid latitude and longitude ranges."
          : multipart || hasHoles
            ? "This shape has multiple parts or interior rings. Import it as one map layer to preserve the full geometry."
            : null;
        return {
          key: `${index}`,
          geometry,
          properties,
          areaHa: geometryAreaHa(geometry),
          name: baseName,
          action: matchingField ? "update" : "create",
          targetId: matchingField?.id || "",
          warning,
        };
      }));
    } catch (parseError) {
      setFeatures([]);
      setError(parseError instanceof Error ? parseError.message : "Could not read the shapefile. Confirm all parts are together in the ZIP.");
    } finally {
      setParsing(false);
    }
  }

  function changeNameAttribute(attribute: string) {
    setNameAttribute(attribute);
    setFeatures((current) => current.map((feature, index) => {
      const baseName = String(feature.properties[attribute] ?? `Field ${index + 1}`).trim() || `Field ${index + 1}`;
      const matchingField = findField(fields, baseName);
      return { ...feature, name: baseName, action: matchingField ? "update" : "create", targetId: matchingField?.id || "" };
    }));
  }

  const active = useMemo(() => features.filter((feature) => feature.action !== "skip"), [features]);
  const totalArea = active.reduce((sum, feature) => sum + feature.areaHa, 0);
  const warnings = features.filter((feature) => feature.warning).length;
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const feature of features) {
      const value = String(feature.properties[displayAttribute] ?? "Unclassified").trim() || "Unclassified";
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [features, displayAttribute]);

  async function importAsMapLayer() {
    if (!file || !features.length) return;
    if (!displayAttribute) return setError("Choose the attribute to show inside each polygon before importing.");
    if (features.some((feature) => !validCoordinates(feature.geometry))) return setError("Correct the coordinate warning before importing this map.");
    if (!confirm(`Import this ${layerType.toLowerCase()} map as one layer with ${features.length} polygon features? The boundaries and polygon attributes will be kept together.`)) return;
    setImporting(true);
    setError("");
    setResult("");
    const uploadedPaths: string[] = [];
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sign in before importing a map layer.");
      const safeBaseName = file.name.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9._-]/g, "-");
      const basePath = `${userId}/${Date.now()}-${safeBaseName}`;
      const geoJsonPath = `${basePath}.geojson`;
      const sourcePath = `${basePath}.zip`;
      const featureCollection = createFeatureCollection(file.name, features);
      const { error: geoJsonError } = await supabase.storage.from(layerBucket).upload(geoJsonPath, new Blob([JSON.stringify(featureCollection)], { type: "application/geo+json" }), { contentType: "application/geo+json", upsert: false });
      if (geoJsonError) throw geoJsonError;
      uploadedPaths.push(geoJsonPath);
      const { error: sourceError } = await supabase.storage.from(layerBucket).upload(sourcePath, file, { contentType: "application/zip", upsert: false });
      if (sourceError) throw sourceError;
      uploadedPaths.push(sourcePath);
      const { error: layerError } = await supabase.from("map_layers").insert({
        user_id: userId,
        farm_name: farmName.trim() || null,
        season: selectedSeason.trim() || null,
        layer_type: layerType,
        source: "Shapefile import",
        captured_date: null,
        file_name: file.name,
        storage_path: geoJsonPath,
        file_format: "GEOJSON",
        status: "Imported",
        metadata: {
          import_mode: "thematic_map",
          geojson_path: geoJsonPath,
          source_archive_path: sourcePath,
          feature_count: features.length,
          geometry_types: Array.from(new Set(features.map((feature) => feature.geometry.type))),
          display_attribute: displayAttribute,
          category_counts: Object.fromEntries(categories.map(({ value, count }) => [value, count])),
        },
      });
      if (layerError) throw layerError;
      setResult(`Imported ${file.name} as one ${layerType.toLowerCase()} map layer with ${features.length} polygon features. The source ZIP and full polygon data were saved.`);
      setFeatures([]);
      setFile(null);
    } catch (importError) {
      if (uploadedPaths.length) await supabase.storage.from(layerBucket).remove(uploadedPaths);
      setError(importError instanceof Error ? importError.message : "The map layer could not be saved.");
    } finally {
      setImporting(false);
    }
  }

  async function importAsFieldBoundaries() {
    const selected = features.filter((feature) => feature.action !== "skip");
    if (!selected.length) return setError("Select at least one field boundary to import.");
    if (selected.some((feature) => !feature.name.trim() || !validCoordinates(feature.geometry) || feature.warning)) {
      return setError("This import has invalid coordinates or multipart shapes. Use the map-layer option to preserve complex geometry, or skip those features.");
    }
    const creates = selected.filter((feature) => feature.action === "create");
    const updates = selected.filter((feature) => feature.action === "update");
    if (!confirm(`Import ${selected.length} field boundaries? This will create ${creates.length} fields and update ${updates.length} existing fields.`)) return;
    setImporting(true);
    setError("");
    setResult("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sign in before importing boundaries.");
      for (const feature of selected) {
        const outerRing = geometryPolygons(feature.geometry)[0]?.[0] || [];
        const payload = {
          field_name: feature.name.trim(),
          farm_name: farmName.trim() || null,
          crop: crop.trim() || null,
          season: selectedSeason.trim() || null,
          cultivar: cultivar.trim() || null,
          area_ha: Number(feature.areaHa.toFixed(2)),
          boundary: outerRing,
          status: "Active",
          notes: `Boundary imported from ${file?.name || "shapefile"}`,
        };
        if (feature.action === "update") {
          if (!feature.targetId) throw new Error(`Choose the existing field for ${feature.name}.`);
          const { error: updateError } = await supabase.from("fields").update(payload).eq("id", feature.targetId);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from("fields").insert({ user_id: userId, ...payload });
          if (insertError) throw insertError;
        }
      }
      setResult(`${selected.length} field boundaries imported: ${creates.length} created and ${updates.length} updated.`);
      await loadFields();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Boundary import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--brand-forest)] p-4 text-white md:p-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ag-kicker">Planning · Spatial data</p>
          <h1 className="mt-1 text-3xl font-extrabold">Map Import</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/65">Review the complete shape and the attributes inside its polygons before importing.</p>
        </div>
        <div className="flex gap-2"><Link href="/planning" className="rounded-xl border border-white/15 px-4 py-2 text-sm">Back to Planning</Link><Link href="/farm-map" className="rounded-xl bg-[var(--brand-leaf)] px-4 py-2 text-sm font-bold text-[var(--brand-forest)]">Open Farm Map</Link></div>
      </header>

      {error && <div role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{error}</div>}
      {result && <div role="status" className="mb-4 rounded-xl border border-[var(--brand-leaf)]/30 bg-[var(--brand-leaf)]/10 p-4 text-sm text-white">{result}</div>}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Polygon features" value={String(features.length)} />
        <Metric label="Map area" value={`${totalArea.toFixed(2)} ha`} />
        <Metric label="Attribute classes" value={String(new Set(features.map((feature) => String(feature.properties[displayAttribute] ?? "Unclassified"))).size)} />
        <Metric label="Review flags" value={String(warnings)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <aside className="space-y-5">
          <Panel title="1 · Choose how to import">
            <label className="field-label">Import mode<select className="field-input" value={mode} onChange={(event) => setMode(event.target.value as ImportMode)}><option value="map-layer">One map layer · best for soil classes</option><option value="field-boundaries">Create or update field boundaries</option></select></label>
            {mode === "map-layer" ? <><label className="field-label">Map layer type<select className="field-input" value={layerType} onChange={(event) => setLayerType(event.target.value)}>{mapLayerTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label className="field-label">Show this value inside each polygon<select className="field-input" value={displayAttribute} onChange={(event) => setDisplayAttribute(event.target.value)}><option value="">Choose an attribute</option>{attributes.map((attribute) => <option key={attribute} value={attribute}>{attribute}</option>)}</select></label><p className="mt-2 text-xs leading-5 text-white/60">All polygon features and their inside rings remain together in one map layer. The original ZIP is also retained.</p></> : <><label className="field-label">Field-name column<select className="field-input" value={nameAttribute} onChange={(event) => changeNameAttribute(event.target.value)}>{attributes.map((attribute) => <option key={attribute} value={attribute}>{attribute}</option>)}</select></label><Input label="Farm name" value={farmName} set={setFarmName} placeholder="Farm name"/><Input label="Crop (optional)" value={crop} set={setCrop} placeholder="Crop"/><Input label="Cultivar (optional)" value={cultivar} set={setCultivar} placeholder="Cultivar"/><p className="mt-2 text-xs leading-5 text-white/60">Each simple polygon feature becomes one field. Multipart shapes or interior rings must be imported as a map layer to preserve their full shape.</p></>}
          </Panel>

          <Panel title="2 · Select and preview a ZIP">
            <label className="field-label">Shapefile ZIP<input type="file" accept=".zip" className="field-input file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand-leaf)] file:px-3 file:py-2 file:font-bold file:text-[var(--brand-forest)]" onChange={(event) => { setFile(event.target.files?.[0] || null); setFeatures([]); setAttributes([]); setError(""); setResult(""); }}/></label>
            <p className="mt-2 text-xs leading-5 text-white/60">Include the matching .shp, .shx, .dbf and .prj files in the same ZIP. Maximum 30 MB.</p>
            <button type="button" onClick={parseFile} disabled={!file || parsing} className="mt-4 w-full rounded-xl bg-[var(--brand-leaf)] py-3 text-sm font-bold text-[var(--brand-forest)] disabled:opacity-40">{parsing ? "Reading the map…" : "Preview complete map"}</button>
          </Panel>

          {features.length > 0 && <Panel title="3 · Confirm import">
            {mode === "map-layer" ? <><div className="rounded-xl bg-white/5 p-4 text-sm"><b>{features.length} polygons · {totalArea.toFixed(2)} ha total</b><p className="mt-1 text-white/60">Import destination: one {layerType.toLowerCase()} layer for {farmName.trim() || "the whole farm"} · {selectedSeason || "no season selected"}.</p><p className="mt-2 text-white/60">Label and colours use: <b className="text-white">{displayAttribute || "choose a property"}</b></p></div><div className="mt-3 max-h-44 space-y-2 overflow-auto">{categories.map(({ value, count }) => <div key={value} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-2"><i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: categoryColor(value) }}/><span className="truncate">{value}</span></span><b>{count}</b></div>)}</div><button type="button" onClick={importAsMapLayer} disabled={importing || !displayAttribute || features.some((feature) => !validCoordinates(feature.geometry))} className="mt-4 w-full rounded-xl bg-[var(--brand-leaf)] py-3 text-sm font-bold text-[var(--brand-forest)] disabled:opacity-40">{importing ? "Saving whole map…" : `Import one ${layerType.toLowerCase()} map`}</button></> : <><Input label="Farm name" value={farmName} set={setFarmName} placeholder="Farm name"/><Input label="Season" value={selectedSeason} set={setSeason}/><div className="rounded-xl bg-white/5 p-4 text-sm"><b>{active.length} selected fields · {totalArea.toFixed(2)} ha</b><p className="mt-1 text-white/60">Skipped features will not be changed.</p></div><button type="button" onClick={importAsFieldBoundaries} disabled={importing || !active.length} className="mt-4 w-full rounded-xl bg-[var(--brand-leaf)] py-3 text-sm font-bold text-[var(--brand-forest)] disabled:opacity-40">{importing ? "Saving fields…" : "Import field boundaries"}</button></>}
          </Panel>}
        </aside>

        <section className="space-y-4">
          {features.length ? <><MapPreview features={features.filter((feature) => mode === "map-layer" || feature.action !== "skip")} attribute={mode === "map-layer" ? displayAttribute : nameAttribute}/>
            {mode === "field-boundaries" && <div className="space-y-3">{features.map((feature, index) => <article key={feature.key} className={`ag-panel rounded-2xl p-4 ${feature.action === "skip" ? "opacity-55" : ""}`}><div className="grid gap-3 lg:grid-cols-[48px_1fr_150px_1fr_auto]"><div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--brand-leaf)]/15 text-sm font-bold text-[var(--brand-leaf)]">{index + 1}</div><Input label="Field name" value={feature.name} set={(value) => setFeatures((list) => list.map((item) => item.key === feature.key ? { ...item, name: value } : item))}/><label className="field-label">Action<select className="field-input" value={feature.action} onChange={(event) => setFeatures((list) => list.map((item) => item.key === feature.key ? { ...item, action: event.target.value as ImportAction } : item))}><option value="create">Create field</option><option value="update">Update existing</option><option value="skip">Skip</option></select></label><label className="field-label">Existing field<select disabled={feature.action !== "update"} className="field-input disabled:opacity-40" value={feature.targetId} onChange={(event) => setFeatures((list) => list.map((item) => item.key === feature.key ? { ...item, targetId: event.target.value } : item))}><option value="">Choose field</option>{fields.map((field) => <option key={field.id} value={field.id}>{field.farm_name || "Farm"} · {field.field_name}</option>)}</select></label><div className="self-end pb-3 text-right"><b className="text-[var(--brand-leaf)]">{feature.areaHa.toFixed(2)} ha</b><p className="text-[10px] text-white/55">{geometryPoints(feature.geometry).length} points</p></div></div>{feature.warning && <p className="mt-2 rounded-lg bg-amber-300/10 p-2 text-xs text-amber-100">{feature.warning}</p>}</article>)}</div>}
          </> : <div className="ag-panel rounded-2xl p-12 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--brand-leaf)]/15 text-2xl text-[var(--brand-leaf)]">◫</div><h2 className="mt-4 text-xl font-bold">Preview the complete shapefile</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">The app will draw every polygon, show the selected inside value and flag geometry issues before saving anything.</p></div>}
        </section>
      </div>
    </main>
  );
}

function findField(fields: Field[], name: string) {
  const normal = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return fields.find((field) => normal(field.field_name) === normal(name));
}

function MapPreview({ features, attribute }: { features: PreviewFeature[]; attribute: string }) {
  const points = features.flatMap((feature) => geometryPoints(feature.geometry));
  if (!points.length) return null;
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const width = Math.max(maxLng - minLng, 0.00001);
  const height = Math.max(maxLat - minLat, 0.00001);
  const project = (point: MapPoint) => ({ x: ((point.lng - minLng) / width) * 760 + 20, y: ((maxLat - point.lat) / height) * 300 + 20 });
  const polygonPath = (rings: MapPoint[][]) => rings.map((ring) => ring.map((point, index) => { const { x, y } = project(point); return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ") + " Z").join(" ");
  const hasAttribute = Boolean(attribute);
  return <div className="ag-panel overflow-hidden rounded-2xl p-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="ag-kicker">Whole-map preview</p><h2 className="mt-1 text-lg font-bold">{features.length} polygon features · interiors preserved</h2></div><span className="text-xs text-white/55">North ↑</span></div><svg viewBox="0 0 800 340" role="img" aria-label={`Preview of ${features.length} polygon features`} className="h-[min(52vh,420px)] min-h-[280px] w-full rounded-xl bg-[var(--brand-forest)]">{features.map((feature) => { const polygons = geometryPolygons(feature.geometry); const value = feature.properties[attribute] ?? "Unclassified"; const centroid = geometryPoints(feature.geometry).reduce((sum, point) => { const p = project(point); return { x: sum.x + p.x / geometryPoints(feature.geometry).length, y: sum.y + p.y / geometryPoints(feature.geometry).length }; }, { x: 0, y: 0 }); return <g key={feature.key}>{polygons.map((rings, index) => <path key={`${feature.key}-${index}`} d={polygonPath(rings)} fill={categoryColor(value)} fillOpacity=".72" fillRule="evenodd" stroke="#f5f2e8" strokeOpacity=".9" strokeWidth="1.4"/>)}{hasAttribute && <text x={centroid.x} y={centroid.y} fill="white" stroke="#18251d" strokeWidth="3" paintOrder="stroke" fontSize="10" fontWeight="700" textAnchor="middle">{String(value).slice(0, 24)}</text>}</g>; })}</svg><p className="mt-3 text-xs text-white/55">Polygon holes are shown as openings. Review the map and category summary before importing.</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="ag-panel rounded-2xl p-5"><p className="ag-kicker">{title}</p><div className="mt-3">{children}</div></section>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="ag-panel rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-white/60">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>; }
function Input({ label, value, set, placeholder = "" }: { label: string; value: string; set: (value: string) => void; placeholder?: string }) { return <label className="field-label">{label}<input className="field-input" value={value} placeholder={placeholder} onChange={(event) => set(event.target.value)}/></label>; }
