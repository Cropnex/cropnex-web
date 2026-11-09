import type {Field} from '@/types/field';
export default function FieldCard({field,onEdit,canEdit=true}:{field:Field;onEdit:(field:Field)=>void;canEdit?:boolean}){
 return <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26372b]/15 bg-white p-4 text-[#17251c]"><div><p className="text-sm text-[#526254]">{field.farm_name||'Choose farm'}</p><h4 className="mt-1 text-xl font-bold">{field.field_name}</h4></div><strong className="text-lg">{Number(field.area_ha).toFixed(2)} ha</strong>{canEdit&&<button type="button" onClick={()=>onEdit(field)} className="rounded-lg border border-[#26372b]/25 px-3 py-2 text-sm font-semibold">Edit Field</button>}</article>;
}
