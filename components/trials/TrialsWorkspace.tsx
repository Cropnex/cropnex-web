"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSeason } from "@/components/season/SeasonProvider";
import { useAccess } from "@/components/auth/AccessProvider";
import type { Field } from "@/types/field";
import type { Trial, TrialDetails, TrialInput, TrialPhoto, TrialStrip, TrialVisit } from "@/types/trial";
import { calculateStripResults, initialTrialWorkspace, trialWorkspaceReducer } from "@/lib/trial-results";
import { trialRequest } from "@/lib/trial-request";
import StripResults, { money, number } from "@/components/trials/StripResults";
import { TrialForm, StripForm, InputForm, VisitForm, PhotoForm, actionClass, secondaryClass, controlClass } from "@/components/trials/TrialForms";

type Modal = { kind: "trial"; record?: Trial } | { kind: "strip"; record?: TrialStrip } |
  { kind: "input"; stripId: string; record?: TrialInput } | { kind: "visit"; record?: TrialVisit } | { kind: "photo" } | null;
const text = (form: FormData, name: string) => String(form.get(name) || "").trim();
const optional = (form: FormData, name: string) => text(form, name) || null;
function numeric(form: FormData, name: string, minimum = 0) {
  const value = Number(text(form, name) || 0);
  if (!Number.isFinite(value) || value < minimum) throw new Error(`Enter a valid ${name.replaceAll("_", " ")} of at least ${minimum}.`);
  return value;
}
function checkedError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) throw new Error("The Trials database update is not installed yet. Apply 202610290002_trial_strips_and_visits.sql, then try again.");
  throw new Error(error.message);
}
async function fetchDetails(id: string, signal?: AbortSignal): Promise<TrialDetails> {
  return trialRequest(async requestSignal => {
    const [strips, inputs, visits, photos] = await Promise.all([
      supabase.from("trial_strips").select("*").eq("trial_id", id).order("created_at").abortSignal(requestSignal),
      supabase.from("trial_inputs").select("*").eq("trial_id", id).eq("legacy_template", false).order("created_at").abortSignal(requestSignal),
      supabase.from("trial_visits").select("*").eq("trial_id", id).order("visit_date", { ascending: false }).abortSignal(requestSignal),
      supabase.from("trial_photos").select("*").eq("trial_id", id).order("created_at", { ascending: false }).abortSignal(requestSignal),
    ]);
    [strips, inputs, visits, photos].forEach(result => checkedError(result.error));
    let images = (photos.data || []) as TrialPhoto[];
    if (images.length) {
      const { data } = await supabase.storage.from("trial-photos").createSignedUrls(images.map(photo => photo.object_path), 3600);
      images = images.map(photo => ({ ...photo, url: data?.find(row => row.path === photo.object_path)?.signedUrl || undefined }));
    }
    return { strips: (strips.data || []) as TrialStrip[], inputs: (inputs.data || []) as TrialInput[], visits: (visits.data || []) as TrialVisit[], photos: images };
  }, signal);
}

export default function TrialsWorkspace() {
  const season = useSeason();
  if (season.loading) return <Status title="Loading your farm season…" />;
  if (season.error) return <Status title="Couldn’t load your farm season" text={season.error} retry={() => void season.refresh()} />;
  if (!season.currentSeason) return <Status title="Choose a season to start Trials" text="Select a farm season at the top of the page, or add one in Farm Setup."><Link href="/standards" className={secondaryClass}>Open Farm Setup</Link></Status>;
  return <SeasonTrialsWorkspace key={season.currentSeason} />;
}

function SeasonTrialsWorkspace() {
  const season = useSeason(), access = useAccess(), canEdit = access.canEditModule("trials");
  const [workspace, dispatch] = useReducer(trialWorkspaceReducer, initialTrialWorkspace);
  const [fields, setFields] = useState<Field[]>([]), [listLoading, setListLoading] = useState(true), [listError, setListError] = useState("");
  const [listRevision, setListRevision] = useState(0), [detailRevision, setDetailRevision] = useState(0), [modal, setModal] = useState<Modal>(null);
  const [actionError, setActionError] = useState(""), [busy, setBusy] = useState(false), [search, setSearch] = useState("");
  const requestSequence = useRef(0);
  const selected = workspace.trials.find(trial => trial.id === workspace.selectedId) || null;
  const details = workspace.details;
  useEffect(() => {
    const controller = new AbortController();
    void trialRequest(async signal => {
      const [fieldResult, trialResult] = await Promise.all([
        supabase.from("fields").select("*").eq("season", season.currentSeason).order("farm_name").order("field_name").abortSignal(signal),
        supabase.from("trials").select("*").eq("season", season.currentSeason).order("created_at", { ascending: false }).abortSignal(signal),
      ]);
      checkedError(fieldResult.error); checkedError(trialResult.error);
      return { fields: (fieldResult.data || []) as Field[], trials: (trialResult.data || []) as Trial[] };
    }, controller.signal).then(data => { if (!controller.signal.aborted) { setFields(data.fields); dispatch({ type: "list", trials: data.trials }); } })
      .catch(error => { if (!controller.signal.aborted) setListError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [season.currentSeason, listRevision]);

  useEffect(() => {
    if (!workspace.selectedId) return;
    const id = workspace.selectedId, requestId = ++requestSequence.current, controller = new AbortController();
    dispatch({ type: "loading", id, requestId });
    void fetchDetails(id, controller.signal)
      .then(data => { if (!controller.signal.aborted) dispatch({ type: "loaded", id, requestId, details: data }); })
      .catch(error => { if (!controller.signal.aborted) dispatch({ type: "failed", id, requestId, error: error.message }); });
    return () => controller.abort();
  }, [workspace.selectedId, detailRevision]);

  const filtered = workspace.trials.filter(trial => `${trial.name} ${trial.objective || ""} ${fields.find(field => field.id === trial.field_id)?.field_name || ""}`.toLowerCase().includes(search.toLowerCase()));
  const requireTrial = () => { if (!canEdit || !selected) throw new Error("You need editing access to this trial."); return selected; };
  const refreshDetails = () => setDetailRevision(value => value + 1);
  const closeModal = () => setModal(null);

  async function saveTrial(form: FormData, record?: Trial) {
    if (!canEdit) throw new Error("This account has view-only access.");
    const field = fields.find(row => row.id === (record?.field_id || text(form, "field_id")));
    if (!field || !text(form, "name")) throw new Error("Enter a trial name and choose a field.");
    const start = optional(form, "start_date"), end = optional(form, "end_date");
    if (start && end && end < start) throw new Error("The end date cannot be before the start date.");
    const values = { name: text(form, "name"), objective: optional(form, "objective"), notes: optional(form, "notes"), crop_price_per_tonne: numeric(form, "crop_price_per_tonne"), start_date: start, end_date: end };
    const result = record
      ? await supabase.from("trials").update({ ...values, updated_at: new Date().toISOString() }).eq("id", record.id).select("*").single()
      : await supabase.from("trials").insert({ ...values, user_id: field.user_id || access.userId, field_id: field.id, season: season.currentSeason, crop: field.crop, cultivar: field.cultivar }).select("*").single();
    checkedError(result.error);
    // Insert/update the returned row directly. Reloading the list here used to
    // compete with selection and detail requests when a second trial was added.
    dispatch({ type: "saved", trial: result.data as Trial }); setSearch(""); setActionError("");
  }
  async function saveStrip(form: FormData, record?: TrialStrip) {
    const trial = requireTrial(), harvested = form.get("harvested") === "on";
    if (!text(form, "strip_name")) throw new Error("Name this strip.");
    if (harvested && (!text(form, "record_date") || text(form, "tonnes") === "")) throw new Error("Enter harvest date and tonnes. Enter 0 if the strip produced no harvest.");
    const moisture = text(form, "moisture") ? numeric(form, "moisture") : null;
    if (moisture !== null && moisture > 100) throw new Error("Moisture cannot be more than 100%.");
    const values = { trial_id: trial.id, user_id: trial.user_id, treatment_id: null, strip_name: text(form, "strip_name"), description: optional(form, "description"), area_ha: numeric(form, "area_ha", 0.0001), operation_cost_per_ha: numeric(form, "operation_cost_per_ha"), harvested, yield_source: "Manual", tonnes: harvested ? numeric(form, "tonnes") : 0, record_date: harvested ? optional(form, "record_date") : null, moisture: harvested ? moisture : null, notes: optional(form, "notes") };
    const result = record ? await supabase.from("trial_strips").update(values).eq("id", record.id).eq("trial_id", trial.id).select("id").single() : await supabase.from("trial_strips").insert(values).select("id").single();
    checkedError(result.error); refreshDetails();
  }
  async function saveInput(form: FormData, stripId: string, record?: TrialInput) {
    const trial = requireTrial();
    if (!details?.strips.some(strip => strip.id === stripId)) throw new Error("Choose a strip in this trial.");
    if (!text(form, "product_name")) throw new Error("Enter the product or operation name.");
    const values = { trial_id: trial.id, user_id: trial.user_id, strip_id: stripId, treatment_id: null, input_type: text(form, "input_type"), product_name: text(form, "product_name"), rate: numeric(form, "rate"), rate_unit: text(form, "rate_unit"), unit_price: numeric(form, "unit_price"), notes: optional(form, "notes"), legacy_template: false };
    const result = record ? await supabase.from("trial_inputs").update(values).eq("id", record.id).eq("trial_id", trial.id).select("id").single() : await supabase.from("trial_inputs").insert(values).select("id").single();
    checkedError(result.error); refreshDetails();
  }
  async function saveVisit(form: FormData, record?: TrialVisit) {
    const trial = requireTrial();
    if (!text(form, "visit_date") || !text(form, "title")) throw new Error("Enter a visit date and description.");
    const values = { trial_id: trial.id, user_id: trial.user_id, visit_date: text(form, "visit_date"), title: text(form, "title"), notes: optional(form, "notes") };
    const result = record ? await supabase.from("trial_visits").update(values).eq("id", record.id).eq("trial_id", trial.id).select("id").single() : await supabase.from("trial_visits").insert(values).select("id").single();
    checkedError(result.error); refreshDetails();
  }
  async function savePhotos(form: FormData) {
    const trial = requireTrial(), files = form.getAll("photos").filter((file): file is File => file instanceof File && file.size > 0);
    if (!files.length) throw new Error("Select at least one photograph.");
    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024)) throw new Error("Use JPEG, PNG or WebP photographs smaller than 15 MB.");
    const uploaded: string[] = [];
    try {
      const records = [];
      for (const file of files) {
        const path = `${trial.user_id}/${trial.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "-")}`;
        const { error } = await supabase.storage.from("trial-photos").upload(path, file, { contentType: file.type }); checkedError(error); uploaded.push(path);
        records.push({ trial_id: trial.id, user_id: trial.user_id, object_path: path, caption: optional(form, "caption"), taken_date: optional(form, "taken_date"), strip_id: optional(form, "strip_id"), visit_id: optional(form, "visit_id") });
      }
      const result = await supabase.from("trial_photos").insert(records); checkedError(result.error);
    } catch (error) { if (uploaded.length) await supabase.storage.from("trial-photos").remove(uploaded); throw error; }
    refreshDetails();
  }
  async function removeRecord(table: "trial_strips" | "trial_inputs" | "trial_visits" | "trial_photos", id: string, label: string) {
    if (!canEdit || !selected || !confirm(`Remove ${label}?${table === "trial_strips" ? " Products and harvest records on this strip will also be removed." : ""}`)) return;
    setBusy(true); setActionError("");
    try {
      const result = await supabase.from(table).delete().eq("id", id).eq("trial_id", selected.id).select("id").single(); checkedError(result.error);
      if (table === "trial_photos") { const path = details?.photos.find(photo => photo.id === id)?.object_path; if (path) await supabase.storage.from("trial-photos").remove([path]); }
      refreshDetails();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not remove this record."); }
    finally { setBusy(false); }
  }
  async function assignLegacyInput(input: TrialInput, stripId: string) {
    if (!stripId || !canEdit || !selected) return;
    setBusy(true); setActionError("");
    const result = await supabase.from("trial_inputs").update({ strip_id: stripId, treatment_id: null }).eq("id", input.id).eq("trial_id", selected.id).select("id").single();
    setBusy(false); if (result.error) { setActionError(result.error.message); return; } refreshDetails();
  }
  async function exportTrials(onlySelected = false) {
    const trials = onlySelected && selected ? [selected] : workspace.trials;
    if (!trials.length) return;
    setBusy(true); setActionError("");
    try {
      const records: Record<string, TrialDetails> = {};
      for (const trial of trials) records[trial.id] = await fetchDetails(trial.id);
      const { createTrialsWorkbook } = await import("@/lib/trials-workbook");
      const images: Record<string, string> = {};
      await Promise.all(Object.values(records).flatMap(record => record.photos).map(async photo => {
        if (!photo.url) return;
        try {
          const response = await fetch(photo.url, { signal: AbortSignal.timeout(15000) }); if (!response.ok) return;
          const bitmap = await createImageBitmap(await response.blob()), canvas = document.createElement("canvas");
          const scale = Math.min(1, 800 / bitmap.width, 500 / bitmap.height); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); images[photo.id] = canvas.toDataURL("image/png");
        } catch { /* Photo captions remain in the report when an image cannot be downloaded. */ }
      }));
      const workbook = createTrialsWorkbook({ trials, fields, details: records, photoImages: images });
      const bytes = await workbook.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `CropNex-Trials-${(onlySelected ? selected?.name || "Trial" : season.currentSeason).replace(/[^\w-]/g, "-")}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not export the trial report."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#14261f] p-4 text-[#edf4ee] sm:p-7">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#b3cd9e]">CropNex · {season.currentSeason}</p><h1 className="mt-2 text-3xl font-black">Trials</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#b8cbbf]">Each trial keeps its strips, products, visits, photographs and harvest results together.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void exportTrials()} disabled={busy || !workspace.trials.length} className={secondaryClass}>{busy ? "Working…" : "Export all trials"}</button>{canEdit && <button disabled={listLoading || Boolean(listError)} onClick={() => setModal({ kind: "trial" })} className={actionClass}>＋ New trial</button>}</div></header>
    {actionError && <p role="alert" className="mb-4 rounded-xl border border-red-300/30 bg-red-400/10 p-4 text-sm text-red-100">{actionError}</p>}
    {listError ? <Status title="Couldn’t load trials" text={listError} retry={() => { setListError(""); setListLoading(true); setListRevision(value => value + 1); }} /> : <div className="grid items-start gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-white/15 bg-white/[.04] p-4"><h2 className="font-bold">Trial list <span className="text-[#b8cbbf]">({workspace.trials.length})</span></h2><input aria-label="Search trials" className={`${controlClass} mb-3`} placeholder="Search trials or fields" value={search} onChange={event => setSearch(event.target.value)} /><div className="max-h-[65vh] space-y-2 overflow-y-auto">{listLoading ? <p className="p-3 text-sm text-[#b8cbbf]">Loading trials…</p> : filtered.map(trial => <button key={trial.id} onClick={() => { dispatch({ type: "select", id: trial.id }); setActionError(""); }} className={`w-full rounded-xl border p-3 text-left ${trial.id === selected?.id ? "border-[#91d346] bg-[#91d346]/10" : "border-white/10 hover:bg-white/5"}`}><b className="block break-words">{trial.name}</b><span className="mt-1 block text-xs text-[#b8cbbf]">{fields.find(field => field.id === trial.field_id)?.field_name || "Field"} · {trial.crop || "Crop not set"}</span>{trial.objective && <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[#a3b7a9]">{trial.objective}</span>}</button>)}{!listLoading && !filtered.length && <p className="p-3 text-sm text-[#b8cbbf]">{workspace.trials.length ? "No trials match this search." : "No trials in this season yet. Create your first trial to start."}</p>}</div></aside>
      <section className="min-w-0">{!selected ? <div className="rounded-2xl border border-dashed border-white/25 p-8"><h2 className="text-xl font-bold">Open a trial to view its records</h2><p className="mt-3 text-sm leading-7 text-[#b8cbbf]">Create a trial and enter its average SAFEX price. Add strips, record the products and costs used on each strip, log dated visits and attach photographs. After harvest, enter each strip’s tonnes to compare yields and margins.</p>{canEdit && !listLoading && <button onClick={() => setModal({ kind: "trial" })} className={`${actionClass} mt-5`}>Create a trial</button>}</div> : <TrialRecord key={selected.id} trial={selected} field={fields.find(field => field.id === selected.field_id)} details={details} loading={workspace.detailLoading} error={workspace.detailError} canEdit={canEdit} busy={busy} onModal={setModal} onBack={() => dispatch({ type: "select", id: null })} onRetry={refreshDetails} onRemove={removeRecord} onAssign={assignLegacyInput} onExport={() => void exportTrials(true)} />}</section>
    </div>}
    {modal?.kind === "trial" && <TrialForm trial={modal.record} fields={fields} onClose={closeModal} onSave={form => saveTrial(form, modal.record)} />}
    {selected && modal?.kind === "strip" && <StripForm strip={modal.record} onClose={closeModal} onSave={form => saveStrip(form, modal.record)} />}
    {selected && modal?.kind === "input" && <InputForm input={modal.record} stripName={details?.strips.find(strip => strip.id === modal.stripId)?.strip_name || "Strip"} onClose={closeModal} onSave={form => saveInput(form, modal.stripId, modal.record)} />}
    {selected && modal?.kind === "visit" && <VisitForm visit={modal.record} onClose={closeModal} onSave={form => saveVisit(form, modal.record)} />}
    {selected && details && modal?.kind === "photo" && <PhotoForm strips={details.strips} visits={details.visits} onClose={closeModal} onSave={savePhotos} />}
  </main>;
}

type RecordProps = {
  trial: Trial; field?: Field; details: TrialDetails | null; loading: boolean; error: string | null; canEdit: boolean; busy: boolean;
  onModal: (modal: Modal) => void; onBack: () => void; onRetry: () => void; onExport: () => void;
  onRemove: (table: "trial_strips" | "trial_inputs" | "trial_visits" | "trial_photos", id: string, label: string) => Promise<void>;
  onAssign: (input: TrialInput, stripId: string) => Promise<void>;
};
function TrialRecord({ trial, field, details, loading, error, canEdit, busy, onModal, onBack, onRetry, onRemove, onAssign, onExport }: RecordProps) {
  const [tab, setTab] = useState("Strips & products");
  const results = useMemo(() => calculateStripResults(trial, details?.strips || [], details?.inputs || []), [trial, details]);
  return <div className="space-y-5"><section className="rounded-2xl border border-white/15 bg-white/[.04] p-5"><button onClick={onBack} className="text-xs font-bold text-[#b5d59e]">← Trial list</button><div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-[#b8cbbf]">{field?.farm_name} · {field?.field_name} · {trial.crop} {trial.cultivar}</p><h2 className="mt-1 break-words text-2xl font-black">{trial.name}</h2></div>{canEdit && <button className={secondaryClass} onClick={() => onModal({ kind: "trial", record: trial })}>Edit trial</button>}</div>{trial.objective && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#d2dfd5]">{trial.objective}</p>}<div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>Average SAFEX: <b className="text-[#c3e5a4]">{money(Number(trial.crop_price_per_tonne))}/t</b></span><span className="text-[#b8cbbf]">{trial.start_date || "Start date not set"}{trial.end_date ? ` → ${trial.end_date}` : ""}</span><span>{details?.strips.length || 0} strips · {details?.visits.length || 0} visits · {details?.photos.length || 0} photos</span></div>{trial.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-[#b8cbbf]">{trial.notes}</p>}<div className="mt-4 flex flex-wrap gap-2">{["Strips & products", "Visits", "Photos", "Results"].map(label => <button key={label} onClick={() => setTab(label)} className={tab === label ? actionClass : secondaryClass}>{label}</button>)}<button disabled={busy || loading} onClick={onExport} className={`${secondaryClass} sm:ml-auto`}>Export this trial</button></div></section>
    {loading ? <p role="status" className="rounded-xl border border-white/15 p-5 text-[#c2d3c7]">Loading this trial’s records…</p> : error ? <Status title="Couldn’t load this trial" text={error} retry={onRetry} /> : !details ? null : <>
      {tab === "Strips & products" && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl font-bold">Strips and their input costs</h3>{canEdit && <button onClick={() => onModal({ kind: "strip" })} className={actionClass}>＋ Add strip</button>}</div>{!results.length && <p className="rounded-xl border border-dashed border-white/20 p-6 text-sm leading-6 text-[#b8cbbf]">Add a strip for each treatment you want to compare. Each strip keeps its own area, products, costs and harvested tonnes.</p>}{results.map(row => <article key={row.strip.id} className="overflow-hidden rounded-2xl border border-white/15 bg-white/[.035]"><div className="flex flex-wrap justify-between gap-4 p-4"><div><h4 className="text-lg font-bold">{row.strip.strip_name}</h4><p className="mt-1 text-sm text-[#b8cbbf]">{number(row.area, 4)} ha · {row.harvested ? `${number(row.yieldPerHa, 3)} t/ha harvested` : "Pending harvest"} · <b className="text-[#c3e5a4]">{money(row.costPerHa)}/ha</b></p>{row.strip.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#c4d4c8]">{row.strip.description}</p>}{row.strip.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#aabeb0]">{row.strip.notes}</p>}</div>{canEdit && <div className="flex flex-wrap items-start gap-2"><button onClick={() => onModal({ kind: "strip", record: row.strip })} className={secondaryClass}>Edit / harvest</button><button onClick={() => onModal({ kind: "input", stripId: row.strip.id })} className={actionClass}>＋ Input</button><button disabled={busy} className="p-2 text-xs text-red-200" onClick={() => void onRemove("trial_strips", row.strip.id, row.strip.strip_name)}>Remove strip</button></div>}</div><div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead className="bg-black/20 text-xs text-[#b8cbbf]"><tr>{["Type", "Product / seed / operation", "Rate/ha", "Unit price", "Cost/ha", ""].map((label, index) => <th key={index} className="p-3">{label}</th>)}</tr></thead><tbody>{row.products.map(input => <tr key={input.id} className="border-t border-white/10"><td className="p-3">{input.input_type}</td><td className="p-3"><b>{input.product_name}</b>{input.notes && <p className="mt-1 text-xs text-[#aabeb0]">{input.notes}</p>}</td><td className="p-3">{number(Number(input.rate), 4)} {input.rate_unit}</td><td className="p-3">{money(Number(input.unit_price))}</td><td className="p-3 font-bold">{money(Number(input.rate) * Number(input.unit_price))}</td><td className="p-3">{canEdit && <div className="flex gap-3"><button onClick={() => onModal({ kind: "input", stripId: row.strip.id, record: input })} className="text-xs font-bold text-[#c3e5a4]">Edit</button><button disabled={busy} onClick={() => void onRemove("trial_inputs", input.id, input.product_name)} className="text-xs text-red-200">Remove</button></div>}</td></tr>)}{!row.products.length && <tr><td colSpan={6} className="p-4 text-[#b8cbbf]">No inputs recorded on this strip yet.</td></tr>}</tbody></table></div><div className="flex flex-wrap justify-between gap-2 border-t border-white/10 px-4 py-3 text-sm"><span className="text-[#b8cbbf]">Additional operation costs: {money(Number(row.strip.operation_cost_per_ha || 0))}/ha</span><b>Total strip cost: {money(row.totalCost)}</b></div></article>)}{details.inputs.some(input => !input.strip_id) && <section className="rounded-xl border border-amber-200/30 bg-amber-200/5 p-4"><h4 className="font-bold text-amber-100">Products from the previous layout that need a strip</h4><p className="mt-2 text-xs leading-5 text-[#d0c8a5]">These records were preserved. Choose which strip each belongs to before including it in the results.</p>{details.inputs.filter(input => !input.strip_id).map(input => <div key={input.id} className="mt-3 grid gap-2 sm:grid-cols-2"><span className="py-2 text-sm">{input.product_name} · {money(Number(input.rate) * Number(input.unit_price))}/ha</span>{canEdit ? <select disabled={busy} className={controlClass} defaultValue="" onChange={event => void onAssign(input, event.target.value)}><option value="">Assign to strip</option>{details.strips.map(strip => <option key={strip.id} value={strip.id}>{strip.strip_name}</option>)}</select> : <span className="text-sm">Awaiting strip allocation</span>}</div>)}</section>}</div>}
      {tab === "Visits" && <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="text-xl font-bold">Trial visits</h3>{canEdit && <button onClick={() => onModal({ kind: "visit" })} className={actionClass}>＋ Log visit</button>}</div>{!details.visits.length && <Empty>No visits recorded yet. Log the visit date, description and observations here.</Empty>}{details.visits.map(visit => <article key={visit.id} className="rounded-xl border border-white/15 p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold text-[#b5d59e]">{visit.visit_date}</p><h4 className="mt-1 text-lg font-bold">{visit.title}</h4></div>{canEdit && <div className="flex items-start gap-3"><button className={secondaryClass} onClick={() => onModal({ kind: "visit", record: visit })}>Edit visit</button><button disabled={busy} className="p-2 text-xs text-red-200" onClick={() => void onRemove("trial_visits", visit.id, "this visit")}>Remove</button></div>}</div>{visit.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#c4d4c8]">{visit.notes}</p>}<p className="mt-3 text-xs text-[#aabeb0]">{details.photos.filter(photo => photo.visit_id === visit.id).length} linked photographs · see Photos</p></article>)}</section>}
      {tab === "Photos" && <section><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-xl font-bold">Trial photographs</h3>{canEdit && <button onClick={() => onModal({ kind: "photo" })} className={actionClass}>＋ Add photographs</button>}</div>{!details.photos.length && <Empty>Add photographs and link them to a trial visit or a specific strip.</Empty>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{details.photos.map(photo => <figure key={photo.id} className="overflow-hidden rounded-xl border border-white/15">{photo.url ? <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.caption || "Trial observation"} className="aspect-[4/3] w-full object-cover" /></a> : <div className="p-6 text-sm text-[#b8cbbf]">Photo preview unavailable. Retry loading this trial.</div>}<figcaption className="space-y-1 p-3"><p className="text-xs text-[#aabeb0]">{photo.taken_date || "Date not recorded"}</p><p className="whitespace-pre-wrap text-sm">{photo.caption || "Trial photograph"}</p><p className="text-xs text-[#aabeb0]">{details.strips.find(strip => strip.id === photo.strip_id)?.strip_name || "Whole trial"}</p>{photo.visit_id && <p className="text-xs text-[#b5d59e]">Visit: {details.visits.find(visit => visit.id === photo.visit_id)?.title}</p>}{canEdit && <button disabled={busy} onClick={() => void onRemove("trial_photos", photo.id, "this photograph")} className="pt-2 text-xs text-red-200">Remove photograph</button>}</figcaption></figure>)}</div></section>}
      {tab === "Results" && <StripResults results={results} price={Number(trial.crop_price_per_tonne || 0)} />}
    </>}
  </div>;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded-xl border border-dashed border-white/20 p-6 text-sm leading-6 text-[#b8cbbf]">{children}</p>; }
function Status({ title, text, retry, children }: { title: string; text?: string; retry?: () => void; children?: React.ReactNode }) { return <section role="status" className="rounded-xl border border-white/15 bg-[#14261f] p-6 text-white"><h2 className="text-xl font-bold">{title}</h2>{text && <p className="my-3 text-sm leading-6 text-[#c1d0c5]">{text}</p>}{retry && <button className={`${actionClass} mt-3`} onClick={retry}>Try again</button>}{children}</section>; }
