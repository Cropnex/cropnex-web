"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

import {trialRequest} from '@/lib/trial-request';
import {groupFieldCosts,allReportRows,type PlanReportRow} from '@/lib/reporting';
const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 });

export default function PlanningReportPage() {
  const [rows, setRows] = useState<PlanReportRow[]>([]);
  const [season, setSeason] = useState("All seasons");
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  async function load(){setLoading(true);setLoadError('');try{const data=await trialRequest(signal=>allReportRows<PlanReportRow>((from,to)=>supabase.from('activity_plan_report').select('*').order('plan_id').range(from,to).abortSignal(signal)),undefined,60000);setRows(data);}catch(e){setLoadError(e instanceof Error?e.message:String((e as {message?:string})?.message||e));}finally{setLoading(false);}}
  useEffect(() => {
 // eslint-disable-next-line react-hooks/set-state-in-effect
 void load(); }, []);
  const seasons = ["All seasons", ...Array.from(new Set(rows.map((row) => row.season)))];
  const filtered = rows.filter((row) => season === "All seasons" || row.season === season);
  const fieldRows=useMemo(()=>groupFieldCosts(filtered),[filtered]);
  const totals = useMemo(() => fieldRows.reduce((value, row) => ({ planned: value.planned + Number(row.planned_cost), actual: value.actual + Number(row.actual_cost), area: value.area + Number(row.planned_area_ha) }), { planned: 0, actual: 0, area: 0 }), [fieldRows]);
  if(loading||loadError)return <main className="p-6"><h1 className="text-3xl font-bold">Field Cost Report</h1><p role="status">{loadError||'Loading all field costs…'}</p>{loadError&&<button onClick={()=>void load()} className="primary">Retry</button>}</main>;
  return <main className="min-h-screen bg-[#14261F] p-5 text-white md:p-8"><header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="ag-kicker">Planning & actuals</p><h1 className="mt-2 text-3xl font-extrabold">Field Cost Report</h1><p className="mt-2 text-sm text-[#8d9d94]">One row per field with all activity costs combined.</p></div><div className="flex gap-2 print:hidden"><select className="rounded-xl border border-white/10 bg-[#203A31] px-4 py-2.5 text-sm" value={season} onChange={(event) => setSeason(event.target.value)}>{seasons.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => window.print()} className="rounded-xl bg-[#789B58] px-4 py-2.5 text-sm font-black text-[#17382E]">Print / PDF</button><Link href="/reports" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Back</Link></div></header><section className="mb-5 grid gap-3 sm:grid-cols-4"><Metric label="Fields" value={String(fieldRows.length)} /><Metric label="Area" value={`${totals.area.toFixed(1)} ha`} /><Metric label="Planned" value={money.format(totals.planned)} /><Metric label="Actual" value={money.format(totals.actual)} /></section><section className="ag-panel overflow-hidden rounded-2xl"><div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-xs"><thead className="bg-black/20 uppercase tracking-wider text-[#718278]"><tr><th className="p-4">Farmer / Farm</th><th>Field</th><th>Activities</th><th>Crop / Hybrid</th><th>Season</th><th>Dates</th><th>Area</th><th>Products</th><th>Planned</th><th>Actual</th><th>Variance</th><th>Status</th></tr></thead><tbody>{fieldRows.map((row) => <tr key={row.plan_id} className="border-t border-white/[0.06]"><td className="p-4"><strong>{row.farmer_name}</strong><br/><span className="text-[#77887e]">{row.farm_name}</span></td><td className="font-bold text-[#B6CB8D]">{row.field_name}</td><td>{row.activities.join(", ")}<span className="block text-[#b6cb8d]">{row.activity_count} activities</span></td><td>{row.crop || "—"}<br/><span className="text-[#77887e]">{row.cultivar || "—"}</span></td><td>{row.season}</td><td>{row.planned_date}<br/><span className="text-[#77887e]">{row.actual_date || "Not actualised"}</span></td><td>{Number(row.planned_area_ha).toFixed(2)} ha</td><td>{row.product_count}</td><td>{money.format(Number(row.planned_cost))}</td><td>{money.format(Number(row.actual_cost))}</td><td className={Number(row.variance) > 0 ? "text-red-400" : "text-[#B6CB8D]"}>{money.format(Number(row.variance))}</td><td>{row.status}</td></tr>)}</tbody></table></div>{!fieldRows.length && <p className="p-10 text-center text-[#77887e]">No planning records for this season.</p>}</section></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="ag-panel rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-[#718278]">{label}</p><p className="mt-2 text-lg font-black">{value}</p></div>; }
