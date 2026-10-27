import Image from "next/image";
import type { ReactNode } from "react";

export function MapPreview() {
  return <ProductWindow title="Farm map" subtitle="2026/2027 season" active="Farm Map">
    <div className="grid h-full min-h-[300px] md:grid-cols-[1fr_190px]">
      <div className="relative min-h-[280px] overflow-hidden bg-[#d6d3be]">
        <Image src="/marketing/cropnex-field-map-feature.png" alt="CropNex farm map preview showing defined field boundaries" fill sizes="(max-width: 768px) 100vw, 60vw" className="object-cover object-center" />
        <div className="absolute left-3 top-3 rounded-lg bg-[#14261f]/90 px-3 py-2 text-xs font-bold text-white shadow-lg">Field boundaries · Crop view</div>
        <div className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-2 text-xs font-bold text-[#1b3025] shadow-lg">Tap a field to open its details</div>
      </div>
      <aside className="hidden border-l border-slate-200 bg-white p-4 text-left md:block">
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69806d]">Selected field</p>
        <h3 className="mt-2 text-base font-extrabold text-[#17241d]">North Block</h3>
        <div className="mt-4 grid grid-cols-2 gap-2"><MiniStat label="Crop" value="Maize"/><MiniStat label="Season" value="2026/27"/></div>
        <div className="mt-4 rounded-xl bg-[#f2f5ef] p-3"><p className="text-xs font-bold text-[#22352a]">Field information</p><p className="mt-1 text-[11px] leading-5 text-slate-600">Review area, crop, boundary and season details in one place.</p></div>
        <div className="mt-3 h-9 rounded-lg bg-[#82cc35]" />
      </aside>
    </div>
  </ProductWindow>;
}

export function SeasonPreview() {
  const rows = [["Plant", "North Block", "Planned"], ["Fertiliser", "East 2", "Planned"], ["Spray", "West 1", "Ready to review"]];
  return <ProductWindow title="Season programme" subtitle="Field activities" active="Planning">
    <div className="p-4 text-left sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69806d]">Season plan</p><h3 className="mt-1 text-lg font-extrabold text-[#17241d]">Work across your fields</h3></div><span className="rounded-full bg-[#eef6e7] px-3 py-1.5 text-xs font-bold text-[#4a7b24]">Season view</span></div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[1fr_.8fr_.8fr] bg-[#f5f7f3] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Activity</span><span>Field</span><span>Status</span></div>
        {rows.map(([activity,field,status])=><div key={field} className="grid grid-cols-[1fr_.8fr_.8fr] items-center border-t border-slate-100 px-3 py-3 text-xs"><span className="font-bold text-[#203228]">{activity}</span><span className="text-slate-600">{field}</span><span className="text-[10px] font-bold text-[#58832f]">{status}</span></div>)}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Plan field work, then record what was completed.</p>
    </div>
  </ProductWindow>;
}

export function InventoryPreview() {
  return <ProductWindow title="Sheds & inventory" subtitle="Stock overview" active="Inventory">
    <div className="p-4 text-left sm:p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#69806d]">Farm resources</p><h3 className="mt-1 text-lg font-extrabold text-[#17241d]">Know what is in each shed</h3></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6e7] text-lg text-[#54842c]">▣</span></div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><div><p className="text-xs font-extrabold text-[#203228]">Woranga Agri Shed</p><p className="mt-1 text-[10px] text-slate-500">Stock location</p></div><span className="rounded-full bg-[#edf6e5] px-2.5 py-1 text-[10px] font-bold text-[#4f7c2c]">Selected</span></div>
        <div className="mt-3 divide-y divide-slate-100">{[["Seed & crop inputs","Track products by location"],["Movements","Review receipts and usage"],["Stock checks","Reconcile recorded quantities"]].map(([title,detail])=><div key={title} className="flex items-center gap-3 py-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f2f5ef] text-xs text-[#638348]">✓</span><div><p className="text-xs font-bold text-[#28372d]">{title}</p><p className="mt-0.5 text-[10px] text-slate-500">{detail}</p></div></div>)}</div>
      </div>
    </div>
  </ProductWindow>;
}

function ProductWindow({title,subtitle,active,children}:{title:string;subtitle:string;active:string;children:ReactNode}){
  return <div className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_28px_80px_rgba(0,0,0,.3)]">
    <div className="flex items-center gap-2 border-b border-slate-200 bg-[#fafbf9] px-3 py-2.5"><span className="h-2 w-2 rounded-full bg-[#ed8b75]"/><span className="h-2 w-2 rounded-full bg-[#eac95f]"/><span className="h-2 w-2 rounded-full bg-[#7abd49]"/><span className="ml-2 truncate rounded-md bg-white px-3 py-1 text-[10px] text-slate-500 shadow-sm">app.cropnex.com · {title}</span></div>
    <div className="grid min-h-[300px] md:grid-cols-[112px_1fr]"><aside className="hidden border-r border-slate-200 bg-[#18231d] p-3 md:block"><div className="mb-4 text-[11px] font-extrabold text-white">Crop<span className="text-[#9adb49]">Nex</span></div>{["Overview","Farm Map","Fields","Planning","Inventory","Reports"].map(item=><div key={item} className={`mb-1 rounded-md px-2 py-2 text-[9px] font-medium ${active===item?"bg-[#8aca3d] text-[#162219]":"text-white/65"}`}>{item}</div>)}</aside><section className="min-w-0 bg-[#f8f9f6]"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-3 sm:px-4"><div><p className="text-[9px] font-bold uppercase tracking-[.15em] text-slate-400">CropNex workspace</p><p className="mt-0.5 text-xs font-extrabold text-[#18241d]">{title}</p></div><div className="text-right"><p className="text-[9px] text-slate-500">{subtitle}</p><span className="mt-1 inline-block rounded-full bg-[#eef6e7] px-2 py-1 text-[9px] font-bold text-[#4b7a2a]">Synced</span></div></header>{children}</section></div>
    <div className="border-t border-slate-200 bg-[#f8f9f6] px-3 py-2 text-center text-[9px] text-slate-500">Illustrative CropNex screen preview · sample content</div>
  </div>;
}

function MiniStat({label,value}:{label:string;value:string}){return <div className="rounded-lg bg-[#f3f5f1] p-2"><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xs font-bold text-[#26372c]">{value}</p></div>}
