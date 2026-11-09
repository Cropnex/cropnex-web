"use client";
import {useState} from 'react';
import {DialogForm,FormField,controlClass,secondaryClass} from '@/components/trials/TrialForms';
import {boundaryHasShape} from '@/lib/field-boundary';
import {advisoryServices} from '@/lib/advisory';
import type {AdvisoryField,AdvisoryLink} from '@/types/advisory';
export default function MultiFieldRequestForm({field,fields,links,onClose,onSave}:{field:AdvisoryField;fields:AdvisoryField[];links:AdvisoryLink[];onClose:()=>void;onSave:(data:FormData)=>Promise<void>}){
 const choices=fields.filter(f=>f.owner_id===field.owner_id&&f.season===field.season&&f.can_manage);
 const valid=choices.filter(f=>boundaryHasShape(f.boundary)&&Number(f.area_ha)>0);
 const [selected,setSelected]=useState<string[]>(valid.some(f=>f.id===field.id)?[field.id]:[]);
 const [advisor,setAdvisor]=useState('');
 const advisers=links.filter(l=>l.status==='Active'&&selected.includes(l.field_id)).filter((l,i,rows)=>rows.findIndex(r=>r.advisor_id===l.advisor_id)===i&&selected.every(id=>links.some(r=>r.field_id===id&&r.advisor_id===l.advisor_id&&r.status==='Active')));
 return <DialogForm title="Request a service for selected fields" onClose={onClose} onSave={async data=>{if(!selected.length)throw new Error('Select at least one field with a saved boundary.');await onSave(data)}}>
 <p>{field.client_name} · {field.season||'No season'} — choose all fields for this job.</p>
 <FormField label="Service"><select name="service" className={controlClass}>{advisoryServices.map(s=><option key={s}>{s}</option>)}</select></FormField>
 <div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} onClick={()=>{setSelected(valid.map(f=>f.id));setAdvisor('')}}>Select all eligible fields</button><button type="button" className={secondaryClass} onClick={()=>{setSelected([]);setAdvisor('')}}>Clear</button></div>
 <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-white/20 p-3">{choices.map(f=>{const eligible=valid.some(v=>v.id===f.id);return <label key={f.id} className="flex gap-3 text-sm"><input type="checkbox" name="fields" value={f.id} disabled={!eligible} checked={selected.includes(f.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,f.id]:ids.filter(id=>id!==f.id));setAdvisor('')}}/><span><b>{f.field_name}</b> · {f.farm_name} · {Number(f.area_ha).toFixed(2)} ha{!eligible&&<span className="block text-[#ffdda5]">Save a boundary and positive hectares in Farm Map first.</span>}</span></label>})}</div>
 <p role="status" className="font-bold">{selected.length} fields · {choices.filter(f=>selected.includes(f.id)).reduce((n,f)=>n+Number(f.area_ha),0).toFixed(2)} ha requested</p>
 <FormField label="Assigned adviser"><select name="advisor" value={advisor} onChange={e=>setAdvisor(e.target.value)} className={controlClass}><option value="">Unassigned — assign after connecting an adviser</option>{advisers.map(a=><option key={a.advisor_id} value={a.advisor_id}>{a.advisor_name} · {a.advisor_email}</option>)}</select></FormField>
 <p className="text-sm text-[#b8cbbf]">An assigned adviser must have accepted access to every selected field. This request does not share additional fields automatically. Each field’s boundary and hectares are captured with the request.</p>
 <FormField label="Preferred visit / sampling date"><input name="date" type="date" className={controlClass}/></FormField>
 <FormField label="Instructions / sampling requirements"><textarea name="notes" rows={4} className={controlClass}/></FormField>
 </DialogForm>;
}
