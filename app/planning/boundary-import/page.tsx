"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { categoryColor, createFeatureCollection, geometryPoints, geometryPolygons } from "@/lib/geojson-layer";
import type { GeoJsonGeometry, MapPoint } from "@/lib/geojson-layer";
import { useSeason } from "@/components/season/SeasonProvider";
import type { Field } from "@/types/field";

type ImportMode = "map-layer" | "field-boundaries";
type ImportAction = "create" | "update" | "skip";
type PreviewFeature = {
  key: string;
  geometry: GeoJsonGeometry;
  previewGeometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
  areaHa: number;
  vertexCount: number;
  valid: boolean;
  name: string;
  action: ImportAction;
  targetId: string;
  warning: string | null;
};

const mapLayerTypes = ["Soil classification", "NDVI", "Elevation", "Yield", "Planting", "Field boundary", "Other"];
const layerBucket = "cropnex-layers";
const maxPreviewFeatures = 48;
const fieldReviewPageSize = 50;

type WorkerParsedFeature = { geometry: GeoJsonGeometry; previewGeometry: GeoJsonGeometry; properties: Record<string, unknown>; areaHa: number; vertexCount: number; valid: boolean; warning: string | null };
type WorkerParseResponse =
  | { ok: true; attributes: string[]; nameAttribute: string; displayAttribute: string; features: WorkerParsedFeature[] }
  | { ok: false; error: string };

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
  const [importProgress, setImportProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [reviewPage, setReviewPage] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const selectedSeason = season || currentSeason;

  useEffect(() => () => workerRef.current?.terminate(), []);

  async function loadFields() {
    if (!currentSeason) return;
    // The import review only needs names and IDs; boundary GeoJSON can be large.
    const { data, error: loadError } = await supabase.from("fields").select("id,field_name,farm_name,season").eq("season", currentSeason).order("farm_name").order("field_name");
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
      const buffer = await file.arrayBuffer();
      const worker = new Worker(new URL("./shapefile.worker.ts", import.meta.url), { type: "module" });
      workerRef.current?.terminate();
      workerRef.current = worker;
      const parsed = await new Promise<WorkerParseResponse>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Map reading took too long. Try exporting fewer polygons or splitting the ZIP into smaller farm groups.")), 120_000);
        const cleanup = () => { window.clearTimeout(timeout); worker.terminate(); if (workerRef.current === worker) workerRef.current = null; };
        worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => { cleanup(); resolve(event.data); };
        worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "The background map reader stopped unexpectedly.")); };
        worker.postMessage({ buffer }, [buffer]);
      });
      if (!parsed.ok) throw new Error(parsed.error);
      const keys = parsed.attributes;
      setAttributes(keys);
      setNameAttribute(parsed.nameAttribute);
      setDisplayAttribute(parsed.displayAttribute);
      const fieldLookup = new Map(fields.map((field) => [normalizeFieldName(field.field_name), field]));
      setFeatures(parsed.features.map((feature, index) => {
        const baseName = String(feature.properties[parsed.nameAttribute] ?? `Field ${index + 1}`).trim() || `Field ${index + 1}`;
        const matchingField = fieldLookup.get(normalizeFieldName(baseName));
        return { key: `${index}`, ...feature, name: baseName, action: matchingField ? "update" : "create", targetId: matchingField?.id || "" };
      }));
      setReviewPage(0);
    } catch (parseError) {
      setFeatures([]);
      setError(parseError instanceof Error ? parseError.message : "Could not read the shapefile. Confirm all parts are together in the ZIP.");
    } finally {
      workerRef.current?.terminate();
      workerRef.current = null;
      setParsing(false);
    }
  }

  function changeNameAttribute(attribute: string) {
    setNameAttribute(attribute);
    const fieldLookup = new Map(fields.map((field) => [normalizeFieldName(field.field_name), field]));
    setFeatures((current) => current.map((feature, index) => {
      const baseName = String(feature.properties[attribute] ?? `Field ${index + 1}`).trim() || `Field ${index + 1}`;
      const matchingField = fieldLookup.get(normalizeFieldName(baseName));
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
  const classCount = useMemo(() => new Set(features.map((feature) => String(feature.properties[displayAttribute] ?? "Unclassified"))).size, [features, displayAttribute]);
  const invalidFeatureCount = useMemo(() => features.filter((feature) => !feature.valid).length, [features]);
  const reviewPageCount = Math.max(1, Math.ceil(features.length / fieldReviewPageSize));
  const reviewFeatures = features.slice(reviewPage * fieldReviewPageSize, (reviewPage + 1) * fieldReviewPageSize);

  async function importAsMapLayer() {
    if (!file || !features.length) return;
    if (!selectedSeason) return setError("Create a farm season in the Farm Map before importing. This keeps the map layer attached to the season you are setting up.");
    if (!displayAttribute) return setError("Choose the attribute to show inside each polygon before importing.");
    if (features.some((feature) => !feature.valid)) return setError("Correct the coordinate warning before importing this map.");
    if (!confirm(`Import this ${layerType.toLowerCase()} map as one layer with ${features.length} polygon features? The boundaries and polygon attributes will be kept together.`)) return;
    setImporting(true);
    setImportProgress("");
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
    if (!selectedSeason) return setError("Create a farm season in the Farm Map before importing field boundaries.");
    if (!selected.length) return setError("Select at least one field boundary to import.");
    if (selected.some((feature) => !feature.name.trim() || !feature.valid)) {
      return setError("This import has invalid coordinates or a missing field name. Correct those rows or skip them before importing.");
    }
    const creates = selected.filter((feature) => feature.action === "create");
    const updates = selected.filter((feature) => feature.action === "update");
    if (!confirm(`Import ${selected.length} field boundaries? This will create ${creates.length} fields and update ${updates.length} existing fields.`)) return;
    setImporting(true);
    setImportProgress("");
    setError("");
    setResult("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sign in before importing boundaries.");
      const payloadFor = (feature: PreviewFeature) => {
        return {
          field_name: feature.name.trim(),
          farm_name: farmName.trim() || null,
          crop: crop.trim() || null,
          season: selectedSeason.trim() || null,
          cultivar: cultivar.trim() || null,
          area_ha: Number(feature.areaHa.toFixed(2)),
          // Keep the complete Polygon/MultiPolygon geometry, including islands and holes.
          boundary: feature.geometry,
          status: "Active",
          notes: `Boundary imported from ${file?.name || "shapefile"}`,
        };
      };
      const createRows = selected.filter((feature) => feature.action === "create");
      const updateRows = selected.filter((feature) => feature.action === "update");
      let completed = 0;
      for (let offset = 0; offset < createRows.length; offset += 25) {
        const batch = createRows.slice(offset, offset + 25).map((feature) => ({ user_id: userId, ...payloadFor(feature) }));
        const { error: insertError } = await supabase.from("fields").insert(batch);
        if (insertError) throw new Error(`Saved ${completed} of ${selected.length} boundaries before the database rejected a batch: ${insertError.message}`);
        completed += batch.length;
        setImportProgress(`${completed} of ${selected.length} boundaries saved`);
      }
      for (const feature of updateRows) {
          if (!feature.targetId) throw new Error(`Choose the existing field for ${feature.name}.`);
          const { data: updated, error: updateError } = await supabase.from("fields").update(payloadFor(feature)).eq("id", feature.targetId).select("id").maybeSingle();
          if (updateError) throw new Error(`Saved ${completed} of ${selected.length} boundaries before the database rejected an update: ${updateError.message}`);
          if (!updated) throw new Error(`Saved ${completed} of ${selected.length} boundaries, but ${feature.name} was not updated. Check that it belongs to your account and season.`);
          completed += 1;
          setImportProgress(`${completed} of ${selected.length} boundaries saved`);
      }
      setResult(`${selected.length} field boundaries imported: ${creates.length} created and ${updates.length} updated.`);
      await loadFields();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Boundary import failed.");
    } finally {
      setImporting(false);
      setImportProgress("");
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
        <Metric label="Attribute classes" value={String(classCount)} />
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
            <p className="mt-2 text-xs leading-5 text-white/60">Include the matching .shp, .shx, .dbf and .prj files in the same ZIP. Maximum 30 MB and 25,000 polygons / 1,000,000 boundary points. Large maps are read in the background so the page remains responsive.</p>
            <button type="button" onClick={parseFile} disabled={!file || parsing} className="mt-4 w-full rounded-xl bg-[var(--brand-leaf)] py-3 text-sm font-bold text-[var(--brand-forest)] disabled:opacity-40">{parsing ? "Reading map in background…" : "Preview complete map"}</button>
          </Panel>

          {features.length > 0 && <Panel title="3 · Confirm import">
            {mode === "map-layer" ? <><div className="rounded-xl bg-white/5 p-4 text-sm"><b>{features.length} polygons · {totalArea.toFixed(2)} ha total</b><p className="mt-1 text-white/60">Import destination: one {layerType.toLowerCase()} layer for {farmName.trim() || "the whole farm"} · {selectedSeason || "no season selected"}.</p><p className="mt-2 text-white/60">Label and colours use: <b className="text-white">{displayAttribute || "choose a property"}</b></p></div><div className="mt-3 max-h-44 space-y-2 overflow-auto">{categories.map(({ value, count }) => <div key={value} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-2"><i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: categoryColor(value) }}/><span className="truncate">{value}</span></span><b>{count}</b></div>)}</div><button type="button" onClick={importAsMapLayer} disabled={importing || !displayAttribute || invalidFeatureCount > 0} className="mt-4 w-full rounded-xl bg-[var(--brand-leaf)] py-3 text-sm font-bold text-[var(--brand-forest)] disabled:opacity-40">{importing ? "Saving whole map…" : `Import one ${layerType.toLowerCase()} map`}</button></> : <><Input label="Farm name" value={farmName} set={setFarmName} placeholder="Farm name"/><Input label="Crop (optional)" value={crop} set={setCrop} placeholder="Crop"/><Input label="Cultivar (optional)" value={cultivar} set={setCultivar} placeholder="Cultivar"/><div className="rounded-xl bg-white/5 p-4 text-sm"><b>{active.length} selected fields · {totalArea.toFixed(2)} ha</b><p className="mt-1 text-white/60">Skipped features will not be changed.</p></div><button type="button" onClick={importAsFieldBoundaries} disabled={importing || !active.length} className="mt-4 w-full rounded-xl bg-[var(--brand-leaf)] py-3 text-sm font-bold text-[var(--brand-forest)] disabled:opacity-40">{importing ? "Saving fields…" : "Import field boundaries"}</button></>}
          </Panel>}
        </aside>

        <section className="space-y-4">
          {features.length ? <><MapPreview features={features.filter((feature) => mode === "map-layer" || feature.action !== "skip")} attribute={mode === "map-layer" ? displayAttribute : nameAttribute}/>
            {mode === "field-boundaries" && <div className="space-y-3"><div className="flex items-center justify-between gap-3 rounded-xl bg-black/15 p-3 text-sm"><span>Showing {Math.min(features.length, reviewPage * fieldReviewPageSize + 1)}–{Math.min(features.length, (reviewPage + 1) * fieldReviewPageSize)} of {features.length} fields</span><div className="flex gap-2"><button type="button" className="secondary" disabled={reviewPage === 0} onClick={() => setReviewPage((page) => Math.max(0, page - 1))}>Previous</button><button type="button" className="secondary" disabled={reviewPage + 1 >= reviewPageCount} onClick={() => setReviewPage((page) => Math.min(reviewPageCount - 1, page + 1))}>Next</button></div></div>{importProgress && <p role="status" className="rounded-lg bg-[var(--brand-leaf)]/10 p-3 text-sm">{importProgress}</p>}{reviewFeatures.map((feature, offset) => { const index = reviewPage * fieldReviewPageSize + offset; return <article key={feature.key} className={`ag-panel rounded-2xl p-4 ${feature.action === "skip" ? "opacity-55" : ""}`}><div className="grid gap-3 lg:grid-cols-[48px_1fr_150px_1fr_auto]"><div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--brand-leaf)]/15 text-sm font-bold text-[var(--brand-leaf)]">{index + 1}</div><Input label="Field name" value={feature.name} set={(value) => setFeatures((list) => list.map((item) => item.key === feature.key ? { ...item, name: value } : item))}/><label className="field-label">Action<select className="field-input" value={feature.action} onChange={(event) => setFeatures((list) => list.map((item) => item.key === feature.key ? { ...item, action: event.target.value as ImportAction } : item))}><option value="create">Create field</option><option value="update">Update existing</option><option value="skip">Skip</option></select></label><label className="field-label">Existing field<select disabled={feature.action !== "update"} className="field-input disabled:opacity-40" value={feature.targetId} onChange={(event) => setFeatures((list) => list.map((item) => item.key === feature.key ? { ...item, targetId: event.target.value } : item))}><option value="">Choose field</option>{fields.map((field) => <option key={field.id} value={field.id}>{field.farm_name || "Farm"} · {field.field_name}</option>)}</select></label><div className="self-end pb-3 text-right"><b className="text-[var(--brand-leaf)]">{feature.areaHa.toFixed(2)} ha</b><p className="text-[10px] text-white/55">{feature.vertexCount.toLocaleString()} points</p></div></div>{feature.warning && <p className="mt-2 rounded-lg bg-amber-300/10 p-2 text-xs text-amber-100">{feature.warning}</p>}</article>; })}</div>}
          </> : <div className="ag-panel rounded-2xl p-12 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--brand-leaf)]/15 text-2xl text-[var(--brand-leaf)]">◫</div><h2 className="mt-4 text-xl font-bold">Preview the complete shapefile</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/60">The app will draw every polygon, show the selected inside value and flag geometry issues before saving anything.</p></div>}
        </section>
      </div>
    </main>
  );
}

function normalizeFieldName(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }

function MapPreview({ features, attribute }: { features: PreviewFeature[]; attribute: string }) {
  const stride = Math.max(1, Math.ceil(features.length / maxPreviewFeatures));
  const preview = features.filter((_, index) => index % stride === 0).slice(0, maxPreviewFeatures).map((feature) => ({
    feature,
    polygons: geometryPolygons(feature.previewGeometry),
    points: geometryPoints(feature.previewGeometry),
  }));
  const points = preview.flatMap((item) => item.points);
  if (!points.length) return null;
  const bounds = points.reduce((value, point) => ({
    minLng: Math.min(value.minLng, point.lng), maxLng: Math.max(value.maxLng, point.lng),
    minLat: Math.min(value.minLat, point.lat), maxLat: Math.max(value.maxLat, point.lat),
  }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
  const { minLng, maxLng, minLat, maxLat } = bounds;
  const width = Math.max(maxLng - minLng, 0.00001);
  const height = Math.max(maxLat - minLat, 0.00001);
  const project = (point: MapPoint) => ({ x: ((point.lng - minLng) / width) * 760 + 20, y: ((maxLat - point.lat) / height) * 300 + 20 });
  const polygonPath = (rings: MapPoint[][]) => rings.map((ring) => ring.map((point, index) => { const { x, y } = project(point); return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ") + " Z").join(" ");
  const hasAttribute = Boolean(attribute);
  const showLabels = hasAttribute && features.length <= 50;
  return <div className="ag-panel overflow-hidden rounded-2xl p-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="ag-kicker">Whole-map preview</p><h2 className="mt-1 text-lg font-bold">{features.length} polygon features · interiors preserved</h2>{preview.length < features.length && <p className="mt-1 text-xs text-white/55">Showing a representative {preview.length}-polygon preview. Every polygon and attribute will be retained on import.</p>}</div><span className="text-xs text-white/55">North ↑</span></div><svg viewBox="0 0 800 340" role="img" aria-label={`Preview of ${preview.length} of ${features.length} polygon features`} className="h-[min(52vh,420px)] min-h-[280px] w-full rounded-xl bg-[var(--brand-forest)]">{preview.map(({ feature, polygons, points: featurePoints }) => { const value = feature.properties[attribute] ?? "Unclassified"; const centroid = featurePoints.reduce((sum, point) => { const p = project(point); return { x: sum.x + p.x / featurePoints.length, y: sum.y + p.y / featurePoints.length }; }, { x: 0, y: 0 }); return <g key={feature.key}>{polygons.map((rings, index) => <path key={`${feature.key}-${index}`} d={polygonPath(rings)} fill={categoryColor(value)} fillOpacity=".72" fillRule="evenodd" stroke="#f5f2e8" strokeOpacity=".9" strokeWidth="1.4"/>)}{showLabels && <text x={centroid.x} y={centroid.y} fill="white" stroke="#18251d" strokeWidth="3" paintOrder="stroke" fontSize="10" fontWeight="700" textAnchor="middle">{String(value).slice(0, 24)}</text>}</g>; })}</svg><p className="mt-3 text-xs text-white/55">Polygon holes are shown as openings. Review the map and category summary before importing.</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="ag-panel rounded-2xl p-5"><p className="ag-kicker">{title}</p><div className="mt-3">{children}</div></section>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="ag-panel rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-white/60">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>; }
function Input({ label, value, set, placeholder = "" }: { label: string; value: string; set: (value: string) => void; placeholder?: string }) { return <label className="field-label">{label}<input className="field-input" value={value} placeholder={placeholder} onChange={(event) => set(event.target.value)}/></label>; }
