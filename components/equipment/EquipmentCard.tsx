import type { Equipment } from "@/types/equipment";

type Props = { equipment: Equipment; onEdit: (equipment: Equipment) => void; onOpenServices: (equipment: Equipment) => void; };

export default function EquipmentCard({ equipment, onEdit, onOpenServices }: Props) {
  const hoursSinceService = equipment.last_service_hours !== null ? equipment.engine_hours - equipment.last_service_hours : null;
  const serviceDue = equipment.service_interval !== null && hoursSinceService !== null && hoursSinceService >= equipment.service_interval;
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm text-gray-500">{equipment.category}</p><h2 className="mt-1 text-2xl font-bold text-green-400">{equipment.name}</h2><p className="mt-1 text-sm text-gray-400">{[equipment.brand,equipment.model].filter(Boolean).join(" ") || "No make/model"}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs ${serviceDue || equipment.status === "Service Due" ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"}`}>{serviceDue ? "Service Due" : equipment.status}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Detail label="Engine hours" value={`${equipment.engine_hours} h`} />
        <Detail label="Fuel" value={equipment.fuel_type || "Not set"} />
        <Detail label="Year" value={equipment.year?.toString() || "Not set"} />
        <Detail label="Registration" value={equipment.registration || "Not set"} />
      </div>
      {equipment.service_interval !== null && <div className="mt-4 rounded-xl bg-black/20 p-3 text-sm"><p className="text-gray-500">Service interval</p><p className="mt-1 font-medium text-gray-200">Every {equipment.service_interval} hours</p>{hoursSinceService !== null && <p className={`mt-1 ${serviceDue ? "text-amber-400" : "text-gray-400"}`}>{hoursSinceService.toFixed(1)} hours since last service</p>}</div>}
      {equipment.installment_amount!==null&&equipment.installment_amount>0&&<div className="mt-4 rounded-xl border border-sky-300/15 bg-sky-300/[.05] p-3 text-sm"><p className="text-sky-300">Equipment finance</p><p className="mt-1 font-bold">R{Number(equipment.installment_amount).toLocaleString("en-ZA")} · {equipment.installment_frequency||"Monthly"}</p><p className="mt-1 text-xs text-gray-500">{equipment.finance_term_seasons||0} season{equipment.finance_term_seasons===1?"":"s"} financed</p></div>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={()=>onEdit(equipment)} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Edit</button><button type="button" onClick={()=>onOpenServices(equipment)} className="rounded-xl bg-green-500 px-4 py-2 text-sm font-bold text-black">Service</button></div>
    </article>
  );
}
function Detail({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 font-medium text-gray-200">{value}</p></div>}
