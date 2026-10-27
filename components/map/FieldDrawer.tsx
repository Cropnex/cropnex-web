import type { Activity } from "@/types/activity";
import { useEffect, useState } from "react";
import type { Field } from "@/types/field";
import type { ActivityPlan, ActivityPlanProduct } from "@/types/planning";
import type { InventoryItem } from "@/types/inventory";
import ActualiseEditor from "@/components/map/ActualiseEditor";
type PlanOperation={id:string;plan_id:string;operation_id?:string|null;operation_name:string;unit:string;planned_rate_per_ha:number;planned_cost:number;actual_rate_per_ha:number|null;actual_cost:number|null};
type InventoryLocation={id:string;name:string};
type ProductOption={id:string;name:string;category:string;pack_unit:string|null};
type StandardOperationOption={id:string;name:string;unit:string;unit_cost:number};
type NdviLayer={id:string;field_id:string|null;field_name:string|null;captured_date:string|null;metadata:{average_ndvi?:number|null;cloud_cover_percent?:number|null}|null};

type Props = {
  field: Field;
  activities: Activity[];
  loadingActivities: boolean;
  showActivityForm: boolean;
  activityMode: "planned" | "actual";
  activityType: string;
  activityDate: string;
  activityNotes: string;
  savingActivity: boolean;
  plans: ActivityPlan[];
  planProducts: ActivityPlanProduct[];
  planOperations: PlanOperation[];
  catalogueProducts: ProductOption[];
  standardOperations: StandardOperationOption[];
  actualisingPlanId: string | null;
  inventory: InventoryItem[];
  inventoryLocations: InventoryLocation[];
  ndviLayers: NdviLayer[];
  ndviUrls: Record<string,string>;
  selectedNdviId: string;
  ndviOpacity: number;
  onSelectNdvi: (id:string)=>void;
  onNdviOpacityChange: (value:number)=>void;
  onClose: () => void;
  onShowActivityForm: (mode: "planned" | "actual") => void;
  onCancelActivityForm: () => void;
  onActivityModeChange: (mode: "planned" | "actual") => void;
  onActivityTypeChange: (value: string) => void;
  onActivityDateChange: (value: string) => void;
  onActivityNotesChange: (value: string) => void;
  onSaveActivity: () => void;
  onActualisePlan: (plan: ActivityPlan, startDate: string, endDate: string, entries: {plan_id:string;products:{id:string|null;master_product_id:string;product_name:string;unit:string;unit_price:number;inventory_item_id:string|null;location_id:string|null;rate:number}[];operations:{id:string|null;operation_id:string;operation_name:string;unit:string;unit_price:number;rate:number}[]}[]) => void;
  onSaveFieldDetails: (fieldName: string, areaHa: number) => Promise<void>;
  onStartBoundaryEdit: () => void;
  onStartSplit: () => void;
};

export default function FieldDrawer(props: Props) {
  const { field } = props;
  const [actualPlan,setActualPlan]=useState<ActivityPlan|null>(null);
  const [editingDetails,setEditingDetails]=useState(false);
  const [fieldName,setFieldName]=useState(field.field_name);
  const [areaHa,setAreaHa]=useState(String(field.area_ha));
  const [savingDetails,setSavingDetails]=useState(false);
  useEffect(()=>{setFieldName(field.field_name);setAreaHa(String(field.area_ha));setEditingDetails(false)},[field.id,field.field_name,field.area_ha]);
  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#17382E]/98 text-white shadow-[0_-25px_80px_rgba(0,0,0,.55)] backdrop-blur-xl sm:inset-y-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-[410px] sm:rounded-2xl">
      <div className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#17382E]/95 p-5 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4"><div><p className="ag-kicker">Field workspace</p><h2 className="mt-1 text-2xl font-extrabold">{field.field_name}</h2><p className="mt-1 text-sm text-[#8d9d94]">{field.farm_name || "Farm"} · {field.crop || "No crop"}</p></div><button type="button" onClick={props.onClose} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm" aria-label="Close field details">✕</button></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><Fact label="Area" value={`${Number(field.area_ha).toFixed(1)} ha`} /><Fact label="Season" value={field.season || "—"} /><Fact label="Status" value={field.status || "Active"} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setEditingDetails(value=>!value)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold">{editingDetails?"Close field editor":"Edit field name / area"}</button><button type="button" onClick={props.onStartBoundaryEdit} className="rounded-xl bg-[#86CF34] px-3 py-2 text-xs font-extrabold text-[#111516]">Redraw boundary</button></div>
      </div>

      <div className="space-y-5 p-5">
        {editingDetails&&<section className="rounded-2xl border border-white/10 bg-black/15 p-4"><p className="ag-kicker">Field identity & area</p><label className="field-label">Field name<input className="field-input" value={fieldName} onChange={event=>setFieldName(event.target.value)} /></label><label className="field-label">Hectares · keep the current value or enter your registered area<input className="field-input" type="number" min="0.01" step="0.01" value={areaHa} onChange={event=>setAreaHa(event.target.value)} /></label><p className="mt-2 text-xs leading-5 text-white/55">Saving these details will not move or reshape the field. Redrawing the boundary updates the hectares to the measured map area.</p><button type="button" disabled={savingDetails||!fieldName.trim()||Number(areaHa)<=0} onClick={async()=>{setSavingDetails(true);try{await props.onSaveFieldDetails(fieldName,Number(areaHa));setEditingDetails(false)}catch(error){alert(error instanceof Error?error.message:"Field details could not be saved.")}finally{setSavingDetails(false)}}} className="mt-3 w-full rounded-xl bg-[#86CF34] py-2.5 text-sm font-extrabold text-[#111516] disabled:opacity-40">{savingDetails?"Saving…":"Save field details"}</button></section>}
        <section className="rounded-2xl border border-white/10 bg-black/15 p-4"><p className="ag-kicker">Boundary tools</p><p className="mt-2 text-xs leading-5 text-white/65">Redraw replaces the current outline with the points you tap on the map. Splitting creates two named fields from one simple boundary.</p><button type="button" onClick={props.onStartSplit} className="mt-3 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold">Split this field</button></section>
        {props.plans.some(plan=>plan.field_id===field.id) && <section><div className="mb-3"><p className="ag-kicker">Season programme</p><h3 className="mt-1 text-lg font-bold">All field activities</h3><p className="mt-1 text-xs text-white/65">Open a planned activity to record it here, including on other fields.</p></div><div className="space-y-2">{props.plans.filter(plan=>plan.field_id===field.id).map((plan) => { const lines = props.planProducts.filter((product) => product.plan_id === plan.id); const pending=plan.status==="Planned"; return <article key={plan.id} className={`rounded-xl border p-4 ${pending?"border-amber-300/25 bg-[#223c32]":"border-[#789B58]/25 bg-[#1b342a]"}`}><button type="button" onClick={()=>setActualPlan(actualPlan?.id===plan.id?null:plan)} className="w-full text-left text-[#f4f7f2]"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-white">{plan.activity_type}</p><p className="mt-1 text-xs text-[#c0cdc5]">{pending?"Plan due":"Actualised"} {pending?plan.planned_date:(plan.actual_date||plan.planned_date)} · {plan.season}</p><p className="mt-1 text-xs text-[#c0cdc5]">{plan.field_name} · {plan.crop||"No crop"}</p></div><div className="text-right"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${pending?"bg-amber-300/15 text-amber-200":"bg-[#789B58]/20 text-[#d2e8b8]"}`}>{pending?"PLANNED":"ACTUAL"}</span><p className={`mt-2 text-sm font-black ${pending?"text-amber-200":"text-[#d2e8b8]"}`}>R {Number(pending?plan.planned_total:(plan.actual_total||0)).toLocaleString("en-ZA")}</p></div></div><p className="mt-3 text-xs font-bold text-[#cce6ae]">{actualPlan?.id===plan.id?"Hide details ↑":"View details and record actual ↓"}</p></button>{actualPlan?.id===plan.id&&<div className="mt-3 border-t border-white/15 pt-3"><div className="space-y-2">{lines.map(line=><div key={line.id} className="flex justify-between rounded-lg bg-black/20 p-2 text-xs text-white"><strong>{line.product_name}</strong><span>{Number(pending?line.planned_rate_per_ha:(line.actual_rate_per_ha??line.planned_rate_per_ha))} {line.unit}/ha</span></div>)}</div>{pending&&<ActualiseEditor plan={plan} plans={props.plans} products={lines} allProducts={props.planProducts} operations={props.planOperations} inventory={props.inventory} locations={props.inventoryLocations} catalogueProducts={props.catalogueProducts} standardOperations={props.standardOperations} saving={props.actualisingPlanId===plan.id} onCancel={()=>setActualPlan(null)} onSubmit={(start,end,entries)=>props.onActualisePlan(plan,start,end,entries)}/>}</div>}</article>; })}</div></section>}
        <section className="grid grid-cols-2 gap-2"><button type="button" onClick={() => props.onShowActivityForm("planned")} className="rounded-xl bg-[#789B58] px-4 py-3 text-sm font-extrabold text-[#17382E]">+ Plan activity</button><button type="button" onClick={() => props.onShowActivityForm("actual")} className="rounded-xl border border-[#789B58]/30 bg-[#789B58]/10 px-4 py-3 text-sm font-bold text-[#B6CB8D]">Record actual</button></section>

        {props.showActivityForm && <section className="rounded-2xl border border-[#789B58]/20 bg-[#789B58]/[0.055] p-4"><div className="flex rounded-xl bg-black/20 p-1"><ModeButton active={props.activityMode === "planned"} onClick={() => props.onActivityModeChange("planned")}>Planned</ModeButton><ModeButton active={props.activityMode === "actual"} onClick={() => props.onActivityModeChange("actual")}>Actual</ModeButton></div><div className="mt-4 space-y-3"><Label text="Activity"><select value={props.activityType} onChange={(event) => props.onActivityTypeChange(event.target.value)} className="field-input"><option>Spraying</option><option>Planting</option><option>Fertilising</option><option>Harvesting</option><option>Scouting</option><option>Cultivation</option><option>Irrigation</option></select></Label><Label text={props.activityMode === "planned" ? "Planned date" : "Completion date"}><input type="date" value={props.activityDate} onChange={(event) => props.onActivityDateChange(event.target.value)} className="field-input" /></Label><Label text="Instructions / actual notes"><textarea value={props.activityNotes} onChange={(event) => props.onActivityNotesChange(event.target.value)} rows={3} placeholder={props.activityMode === "planned" ? "Products, rate and team instructions…" : "Work completed, product used and outcome…"} className="field-input" /></Label><div className="flex gap-2"><button type="button" onClick={props.onSaveActivity} disabled={props.savingActivity} className="flex-1 rounded-xl bg-[#789B58] py-3 text-sm font-extrabold text-[#17382E] disabled:opacity-50">{props.savingActivity ? "Saving…" : props.activityMode === "planned" ? "Save plan" : "Save actual"}</button><button type="button" onClick={props.onCancelActivityForm} className="rounded-xl border border-white/10 px-4 text-sm">Cancel</button></div></div></section>}

        <section><div className="mb-3 flex items-end justify-between"><div><p className="ag-kicker">Timeline</p><h3 className="mt-1 text-lg font-bold">Planned & actual work</h3></div><span className="rounded-full bg-white/[0.055] px-3 py-1 text-xs text-[#8d9d94]">{props.activities.length}</span></div>{props.loadingActivities ? <p className="text-sm text-[#8d9d94]">Loading field history…</p> : props.activities.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-[#718278]">No work recorded for this field yet.</p> : <div className="space-y-2">{props.activities.map((activity) => { const planned = activity.notes?.startsWith("Planned"); return <article key={activity.id} className="rounded-xl border border-white/[0.065] bg-white/[0.025] p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${planned ? "bg-amber-400" : "bg-[#789B58]"}`} /><div><p className="text-sm font-bold">{activity.activity_type}</p><p className="mt-1 text-xs text-[#77887e]">{activity.notes || (planned ? "Planned" : "Actual")}</p></div></div><div className="text-right"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${planned ? "bg-amber-400/10 text-amber-300" : "bg-[#789B58]/10 text-[#B6CB8D]"}`}>{planned ? "PLANNED" : "ACTUAL"}</span><p className="mt-2 text-[10px] text-[#718278]">{activity.date}</p></div></div></article>; })}</div>}</section>

        <section className="rounded-2xl border border-sky-300/15 bg-sky-300/[.035] p-4"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-300">Scouting & imagery</p><h3 className="mt-1 text-lg font-bold">NDVI history</h3></div><span className="rounded-full bg-sky-300/10 px-2 py-1 text-xs font-bold text-sky-200">{props.ndviLayers.filter(layer=>layer.field_id===field.id).length}</span></div>{props.ndviLayers.filter(layer=>layer.field_id===field.id).length?<div className="mt-3 space-y-2">{props.ndviLayers.filter(layer=>layer.field_id===field.id).map(layer=><article key={layer.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20"><div className="flex items-center justify-between gap-3 p-3"><div><b className="text-sm">{layer.captured_date||"Undated image"}</b><p className="mt-1 text-xs text-[#829087]">Average NDVI {typeof layer.metadata?.average_ndvi==="number"?layer.metadata.average_ndvi.toFixed(2):"not calculated"}{typeof layer.metadata?.cloud_cover_percent==="number"?` · ${layer.metadata.cloud_cover_percent.toFixed(1)}% cloud`:""}</p></div><button type="button" onClick={()=>props.onSelectNdvi(props.selectedNdviId===layer.id?"":layer.id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${props.selectedNdviId===layer.id?"bg-sky-300 text-[#17382E]":"border border-sky-300/25 text-sky-200"}`}>{props.selectedNdviId===layer.id?"Hide from map":"View on map"}</button></div>{props.ndviUrls[layer.id]&&<img src={props.ndviUrls[layer.id]} alt={`NDVI for ${field.field_name}`} className="max-h-40 w-full object-cover"/>}</article>)}{props.selectedNdviId&&props.ndviLayers.some(layer=>layer.id===props.selectedNdviId&&layer.field_id===field.id)&&<label className="mt-3 flex items-center gap-3 text-xs text-[#8d9d94]">Map opacity<input type="range" min="10" max="100" value={props.ndviOpacity} onChange={event=>props.onNdviOpacityChange(Number(event.target.value))} className="min-w-0 flex-1 accent-[#789B58]"/><b>{props.ndviOpacity}%</b></label>}</div>:<p className="mt-3 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-[#718278]">No NDVI imagery has been saved for this field yet.</p>}</section>

        <section className="rounded-2xl border border-white/[0.065] bg-white/[0.025] p-4"><p className="ag-kicker">Field details</p><dl className="mt-3 grid grid-cols-2 gap-4 text-sm"><Detail label="Cultivar" value={field.cultivar} /><Detail label="Soil" value={field.soil_type} /><Detail label="Planting date" value={field.planting_date} /><Detail label="Yield target" value={field.expected_yield ? `${field.expected_yield} t/ha` : null} /></dl></section>
      </div>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-[9px] uppercase tracking-wider text-[#718278]">{label}</p><p className="mt-1 truncate text-xs font-bold text-white">{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string | null }) { return <div><dt className="text-xs text-[#718278]">{label}</dt><dd className="mt-1 font-semibold text-[#c6d0ca]">{value || "Not set"}</dd></div>; }
function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-[#91a198]">{text}{children}</label>; }
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`flex-1 rounded-lg py-2 text-xs font-bold ${active ? "bg-[#789B58] text-[#17382E]" : "text-[#8d9d94]"}`}>{children}</button>; }
