"use client";

import {allReportRows,reportEconomics,type PerformanceRow,type CommitmentRow} from '@/lib/reporting';
import {trialRequest} from '@/lib/trial-request';
import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { FinancialTransaction } from "@/types/financial";
import type { InventoryItem } from "@/types/inventory";
import type { Equipment } from "@/types/equipment";
import type { WorkOrder } from "@/types/work-order";
import type { Activity } from "@/types/activity";
import { useSeason } from "@/components/season/SeasonProvider";

const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

export default function DashboardPage() {
  const{currentSeason}=useSeason();
  const [performance,setPerformance]=useState<PerformanceRow[]>([]);const [commitments,setCommitments]=useState<CommitmentRow[]>([]);const sequence=useRef(0);
  const [fields, setFields] = useState<Field[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function loadDashboard(){const request=++sequence.current;setLoading(true);setLoadError('');if(!currentSeason){setFields([]);setLoading(false);return;}
    try{const result=await trialRequest(()=>Promise.all([
      allReportRows<Field>((a,b)=>supabase.from('fields').select('id,user_id,field_name,farm_name,season,area_ha,crop').eq('season',currentSeason).order('id').range(a,b).returns<Field[]>()),
      allReportRows<FinancialTransaction>((a,b)=>supabase.from('financial_transactions').select('*').order('id').range(a,b)),
      allReportRows<InventoryItem>((a,b)=>supabase.from('inventory_items').select('*').eq('season',currentSeason).neq('status','Inactive').order('id').range(a,b)),
      allReportRows<Equipment>((a,b)=>supabase.from('equipment').select('*').order('id').range(a,b)),
      allReportRows<WorkOrder>((a,b)=>supabase.from('work_orders').select('*').order('planned_date').order('id').range(a,b)),
      supabase.from('activities').select('*').eq('season',currentSeason).order('date',{ascending:false}).limit(8).then(result=>{if(result.error)throw result.error;return result.data as Activity[];}),
      allReportRows<PerformanceRow>((a,b)=>supabase.from('field_performance_report').select('*').eq('season',currentSeason).order('field_id').range(a,b)),
      allReportRows<CommitmentRow>((a,b)=>supabase.from('business_commitment_summary').select('*').order('source_id').order('source').range(a,b))
    ]),undefined,60000);if(request!==sequence.current)return;
    reportEconomics(result[0],result[6],result[1],result[7],currentSeason);setFields(result[0]);setTransactions(result[1]);setInventory(result[2]);setEquipment(result[3]);setJobs(result[4]);setActivities(result[5]);setPerformance(result[6]);setCommitments(result[7]);
    }catch(e){if(request===sequence.current)setLoadError(e instanceof Error?e.message:String((e as {message?:string})?.message||e));}finally{if(request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{
 // eslint-disable-next-line react-hooks/set-state-in-effect
 void loadDashboard();return()=>{sequence.current++;};},[currentSeason]);
  const economics=useMemo(()=>fields.length&&performance.length?reportEconomics(fields,performance,transactions,commitments,currentSeason||''):null,[fields,performance,transactions,commitments,currentSeason]);
  const totals = useMemo(() => {
    const area = fields.reduce((sum, field) => sum + Number(field.area_ha || 0), 0);
    const income = transactions.filter((row) => row.transaction_type === "Income").reduce((sum, row) => sum + Number(row.amount), 0);
    const expenses = transactions.filter((row) => row.transaction_type === "Expense").reduce((sum, row) => sum + Number(row.amount), 0);
    const inventoryValue = inventory.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost || 0), 0);
    const lowStock = inventory.filter((item) => Number(item.quantity)<0 || (item.minimum_quantity !== null && Number(item.quantity) <= Number(item.minimum_quantity))).length;
    const serviceDue = equipment.filter((item) => item.status === "Service Due" || (item.service_interval !== null && item.last_service_hours !== null && item.engine_hours - item.last_service_hours >= item.service_interval)).length;
    const openJobs = jobs.filter((job) => job.status !== "Completed").length;
    return { area, income, expenses, margin: economics?.businessMargin??0, inventoryValue, lowStock, serviceDue, openJobs };
  }, [fields, transactions, inventory, equipment, jobs, economics]);

  const crops = useMemo(() => {
    const groups = new Map<string, number>();
    fields.forEach((field) => groups.set(field.crop || "Unassigned", (groups.get(field.crop || "Unassigned") || 0) + Number(field.area_ha || 0)));
    return Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
  }, [fields]);

  const date = new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const upcomingJobs = jobs.filter((job) => job.status !== "Completed").slice(0, 4);

  return (
    <main className="ag-grid-glow min-h-screen px-4 py-6 text-white sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="ag-kicker">Farm overview · {currentSeason||"Choose season"} · {date}</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-[2.65rem]">Good day. Your farm at a glance.</h1>
          <p className="mt-2 text-sm text-[#8b9b92]">Live operating data, priorities and performance in one calm view.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={loadDashboard} className="rounded-xl border border-black/10 bg-white/45 px-4 py-2.5 text-sm font-semibold text-[#554f43]">Refresh</button>
          <Link href="/jobs" className="rounded-xl bg-[#52704B] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(75,87,50,.18)]">+ New job</Link>
        </div>
      </header>

      {!loading && loadError && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[.08] p-4 text-sm text-amber-100"><span>{loadError}</span><button type="button" onClick={loadDashboard} className="rounded-lg border border-amber-200/25 px-3 py-2 font-bold">Retry</button></div>}
      {!loading && !currentSeason ? <section className="ag-panel rounded-2xl p-8"><p className="ag-kicker">Your workspace is ready</p><h2 className="mt-2 text-2xl font-bold">Start with your first farm season</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b9b92]">There is no season or farm data in this CropNex workspace yet. Create a season in the Farm Map, then add or import your field boundaries.</p><Link href="/farm-map" className="mt-5 inline-flex rounded-xl bg-[#789B58] px-4 py-3 text-sm font-extrabold text-[#17382E]">Open Farm Map</Link></section> : loading || loadError ? <div className="ag-panel rounded-2xl p-8 text-[#8b9b92]">{loadError?'Farm totals are unavailable until all report sources load.':'Preparing your farm overview…'}</div> : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Farmed area" value={`${totals.area.toFixed(1)} ha`} note={`${fields.length} registered fields`} tone="lime" />
          <Metric label="Projected business margin" value={money.format(totals.margin)} note={`${money.format(economics?.income??0)} projected field income`} tone="white" />
          <Metric label="Inventory value" value={money.format(totals.inventoryValue)} note={`${totals.lowStock} items need attention`} tone="white" />
          <Metric label="Outstanding jobs" value={String(totals.openJobs)} note={`${totals.serviceDue} machines require service`} tone="amber" />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
          <Link href="/farm-map" className="ag-panel group relative min-h-[330px] overflow-hidden rounded-2xl p-6">
            <div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_30%_35%,rgba(131,195,65,.25),transparent_22%),radial-gradient(circle_at_68%_62%,rgba(77,120,48,.18),transparent_28%)]" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 opacity-25 [background-image:linear-gradient(35deg,transparent_45%,#789B58_46%,#789B58_47%,transparent_48%),linear-gradient(145deg,transparent_45%,#789B58_46%,#789B58_47%,transparent_48%)] [background-size:80px_80px]" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-start justify-between"><div><p className="ag-kicker">Farm map</p><h2 className="mt-2 text-2xl font-bold">Fields & crop allocation</h2></div><span className="rounded-full border border-[#789B58]/25 bg-[#789B58]/10 px-3 py-1 text-xs font-bold text-[#B6CB8D]">Open workspace ↗</span></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{crops.slice(0, 6).map(([crop, area], index) => <div key={crop} className="rounded-xl border border-black/10 bg-white/60 p-3 shadow-sm backdrop-blur"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${index % 3 === 0 ? "bg-[#52704B]" : index % 3 === 1 ? "bg-amber-500" : "bg-teal-600"}`} /><p className="text-xs text-[#706c61]">{crop}</p></div><p className="mt-1 font-display text-lg font-bold text-[#24251f]">{area.toFixed(1)} ha</p></div>)}</div>
            </div>
          </Link>

          <section className="ag-panel rounded-2xl p-5"><div className="flex items-center justify-between"><div><p className="ag-kicker">Priority queue</p><h2 className="mt-2 text-xl font-bold">Needs attention</h2></div><Link href="/alerts" className="text-xs font-bold text-[#B6CB8D]">View alerts</Link></div><div className="mt-5 space-y-2"><Priority label="Low stock items" value={totals.lowStock} href="/inventory" /><Priority label="Equipment service" value={totals.serviceDue} href="/equipment" /><Priority label="Open job cards" value={totals.openJobs} href="/jobs" /></div><div className="mt-5 rounded-xl bg-[#789B58]/[0.07] p-4"><p className="text-xs font-bold text-[#B6CB8D]">CropNex recommendation</p><p className="mt-2 text-sm leading-6 text-[#a9b6ae]">Review urgent work and service requirements before allocating today’s field teams.</p></div></section>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <section className="ag-panel rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><div><p className="ag-kicker">Operations</p><h2 className="mt-2 text-xl font-bold">Upcoming work</h2></div><Link href="/jobs" className="text-xs font-bold text-[#B6CB8D]">All jobs</Link></div>{upcomingJobs.length ? <div className="grid gap-2 sm:grid-cols-2">{upcomingJobs.map((job) => <Link key={job.id} href="/jobs" className="rounded-xl border border-white/[0.06] bg-black/15 p-4 transition hover:border-[#789B58]/30"><div className="flex items-start justify-between gap-3"><p className="font-semibold">{job.title}</p><span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-300">{job.status}</span></div><p className="mt-3 text-xs text-[#77887e]">{job.field_name || "No field"} · {job.planned_date || "Unscheduled"}</p></Link>)}</div> : <Empty text="No outstanding job cards." />}</section>
          <section className="ag-panel rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><div><p className="ag-kicker">Field record</p><h2 className="mt-2 text-xl font-bold">Recent actuals</h2></div><Link href="/activities" className="text-xs font-bold text-[#B6CB8D]">Activity register</Link></div>{activities.length ? <div className="space-y-1">{activities.slice(0, 5).map((activity) => <div key={activity.id} className="flex items-center justify-between gap-4 border-b border-white/[0.055] py-3 last:border-0"><div><p className="text-sm font-semibold">{activity.activity_type}</p><p className="mt-1 text-xs text-[#77887e]">{activity.field_name}</p></div><p className="text-xs font-medium text-[#91a198]">{activity.date}</p></div>)}</div> : <Empty text="No field activities recorded." />}</section>
        </section>
      </>}
    </main>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: "lime" | "white" | "amber" }) { const color = tone === "lime" ? "text-[#B6CB8D]" : tone === "amber" ? "text-amber-300" : "text-white"; return <article className="ag-panel rounded-2xl p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#718278]">{label}</p><p className={`mt-3 font-display text-2xl font-extrabold ${color}`}>{value}</p><p className="mt-2 text-xs text-[#718278]">{note}</p></article>; }
function Priority({ label, value, href }: { label: string; value: number; href: string }) { return <Link href={href} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/15 p-3.5 hover:border-[#789B58]/25"><span className="text-sm text-[#b3bfb7]">{label}</span><span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-xs font-black ${value ? "bg-amber-400/15 text-amber-300" : "bg-[#789B58]/15 text-[#B6CB8D]"}`}>{value}</span></Link>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-[#718278]">{text}</p>; }
