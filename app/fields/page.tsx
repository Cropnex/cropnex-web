'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import FieldsByFarm from '@/components/fields/FieldsByFarm';
import FieldForm from '@/components/fields/FieldForm';
import {DialogForm,FormField,controlClass} from '@/components/trials/TrialForms';
import {useAccess} from '@/components/auth/AccessProvider';
import {supabase} from '@/lib/supabase';
import {trialRequest} from '@/lib/trial-request';
import {farmsForField,fieldFarmId,type FarmRecord,type FarmerRecord} from '@/lib/field-farms';
import type {Field,FieldFormValues} from '@/types/field';
import {useSeason} from '@/components/season/SeasonProvider';
const blankValues:FieldFormValues={field_name:'',farm_name:'',farm_id:'',crop:'',season:'',planting_date:'',cultivar:'',soil_type:'',expected_yield:'',area_ha:'',status:'Active',notes:''};
const message=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Could not save the changes.';
export default function FieldsPage(){
 const {currentSeason}=useSeason(),access=useAccess(),canEdit=access.canEditModule('fields');
 const [farms,setFarms]=useState<FarmRecord[]>([]),[farmers,setFarmers]=useState<FarmerRecord[]>([]),[fields,setFields]=useState<Field[]>([]),[values,setValues]=useState<FieldFormValues>(blankValues),[editing,setEditing]=useState(''),[renaming,setRenaming]=useState<FarmRecord|null>(null),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[farmFilter,setFarmFilter]=useState('all');
 const sequence=useRef(0);
 const load=useCallback(async()=>{const request=++sequence.current;setLoading(true);setEditing('');try{const [f,fa,op]=await trialRequest(signal=>Promise.all([currentSeason?supabase.from('fields').select('*').eq('season',currentSeason).order('field_name').abortSignal(signal):Promise.resolve({data:[],error:null}),supabase.from('farms').select('id,name,farmer_id,user_id').eq('active',true).order('name').abortSignal(signal),supabase.from('farmers').select('id,name,user_id').eq('active',true).order('name').abortSignal(signal)]));if(request!==sequence.current)return;if(f.error||fa.error||op.error)throw f.error||fa.error||op.error;setFields(f.data as Field[]||[]);setFarms(fa.data||[]);setFarmers(op.data||[]);setError('')}catch(e){if(request===sequence.current)setError(message(e))}finally{if(request===sequence.current)setLoading(false)}},[currentSeason]);
 // Invalidate the request counter on unmount so old season responses are ignored.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)return load()});return()=>{active=false;sequence.current++}},[load]);
 const editedField=fields.find(f=>f.id===editing),fieldFarms=farmsForField(editedField,farms),filteredFields=fields.filter(f=>farmFilter==='all'||fieldFarmId(f,farms)===farmFilter),visibleFarms=farms.filter(f=>farmFilter==='all'||f.id===farmFilter);
 function startEdit(field:Field){setEditing(field.id);setValues({...blankValues,farm_id:fieldFarmId(field,farms)||'',farm_name:field.farm_name||'',field_name:field.field_name,area_ha:String(field.area_ha)});setError('');window.scrollTo({top:0,behavior:'smooth'})}
 async function saveField(){
  if(!canEdit||!editedField)return;
  const farm=fieldFarms.find(f=>f.id===values.farm_id);if(!farm){setError('Choose a saved farm. New farms are named while drawing a boundary on Farm Map.');return;}
  if(!values.field_name.trim()||!Number.isFinite(Number(values.area_ha))||Number(values.area_ha)<=0){setError('Enter a field name and positive hectares.');return;}
  setSaving(true);try{const result=await trialRequest(signal=>supabase.rpc('edit_mapped_field',{p_field:editedField.id,p_farm:farm.id,p_name:values.field_name.trim(),p_area:Number(values.area_ha)}).abortSignal(signal));if(result.error)throw result.error;setFields(rows=>rows.map(f=>f.id===editedField.id?result.data as Field:f));setEditing('');setError('');setNotice('Field details saved.');}catch(e){setError(message(e))}finally{setSaving(false)}
 }
 return <main className="ag-fields-workspace min-h-screen p-4 text-[#17251c] sm:p-6"><header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="ag-kicker">CropNex · {currentSeason||'Fields register'}</p><h1 className="mt-2 text-3xl font-black">Fields & Farms</h1><p className="mt-2 text-sm text-[#526254]">Your farms, fields and hectares. Edit names, farm assignments and areas here.</p></div><Link href="/farm-map" className="rounded-xl bg-[#86cf34] px-5 py-3 font-bold text-[#17251c]">Open Farm Map</Link></header>
 {error&&<div role="alert" className="mb-4 rounded-xl bg-red-100 p-4 text-red-950">{error} <button onClick={()=>void load()} className="font-bold underline">Reload records</button></div>}{notice&&<p role="status" className="mb-4 rounded-xl bg-[#dcebcf] p-4 text-[#243d21]">{notice}</p>}
 <div className="mb-5 flex flex-wrap items-end gap-4"><label className="text-sm font-semibold">Farm<select className="mt-1 block rounded-xl border border-[#8c9e91] bg-white p-3" value={farmFilter} onChange={e=>setFarmFilter(e.target.value)}><option value="all">All farms</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}{farmers.length>1?' · '+(farmers.find(op=>op.id===f.farmer_id)?.name||''):''}</option>)}</select></label><p className="py-3 text-sm">{filteredFields.length} fields · {filteredFields.reduce((n,f)=>n+Number(f.area_ha),0).toFixed(2)} ha</p></div>
 {editing&&canEdit&&<section className="mb-6"><h2 className="mb-3 text-xl font-bold">Edit {editedField?.field_name}</h2><FieldForm farmOptions={fieldFarms} values={values} saving={saving} onChange={(key,value)=>setValues(v=>({...v,[key]:value}))} onSave={saveField} onCancel={()=>setEditing('')}/></section>}
 {loading?<p role="status">Loading farms and fields…</p>:!currentSeason?<p>Create your first season to begin drawing fields.</p>:<FieldsByFarm fields={filteredFields} farms={visibleFarms} farmers={farmers} canEdit={canEdit} onEdit={startEdit} onEditFarm={setRenaming}/>}
 {!loading&&!farms.length&&<p className="rounded-xl border border-[#26372b]/20 bg-white p-5">Draw your first field on Farm Map and name its farm there. Your saved farms will appear here automatically.</p>}
 {!canEdit&&<p className="mt-4 text-sm text-[#526254]">View-only access. Your farmer manages these field and farm details.</p>}
 {renaming&&canEdit&&<DialogForm title="Edit farm name" onClose={()=>setRenaming(null)} onSave={async form=>{if(!canEdit)throw new Error('Fields editing access required.');const result=await trialRequest(signal=>supabase.rpc('rename_field_farm',{p_farm:renaming.id,p_name:String(form.get('name')||'').trim()}).abortSignal(signal));if(result.error)throw new Error(result.error.message);await load();setNotice('Farm name updated across its fields and linked activity plans.');}}><p className="text-sm text-[#c7d8cc]">This renames the farm across all its seasons. Boundaries and existing records remain linked.</p><FormField label="Farm name"><input required maxLength={200} name="name" defaultValue={renaming.name} className={controlClass}/></FormField></DialogForm>}
 </main>;
}
