"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import FieldsByFarm from '@/components/fields/FieldsByFarm';
import FieldForm from '@/components/fields/FieldForm';
import {DialogForm,FormField,controlClass} from '@/components/trials/TrialForms';
import {useAccess} from '@/components/auth/AccessProvider';
import {supabase} from '@/lib/supabase';
import {trialRequest} from '@/lib/trial-request';
import {farmNameKey,validateFarmName,farmsForField,fieldFarmId,type FarmRecord,type FarmerRecord} from '@/lib/field-farms';
import type {Field,FieldFormValues} from '@/types/field';
import {useSeason} from '@/components/season/SeasonProvider';
import {boundaryHasShape} from '@/lib/field-boundary';
const blankValues:FieldFormValues={field_name:'',farm_name:'',farm_id:'',crop:'',season:'',planting_date:'',cultivar:'',soil_type:'',expected_yield:'',area_ha:'',status:'Active',notes:''};
const errorMessage=(error:unknown)=>error instanceof Error?error.message:typeof error==='object'&&error&&'message' in error?String(error.message):'Could not complete this request. Please try again.';
export default function FieldsPage(){
 const {currentSeason}=useSeason(),access=useAccess(),canEdit=access.canEditModule('fields');
 const [farms,setFarms]=useState<FarmRecord[]>([]),[farmers,setFarmers]=useState<FarmerRecord[]>([]),[fields,setFields]=useState<Field[]>([]),[values,setValues]=useState<FieldFormValues>(blankValues),[editingFieldId,setEditingFieldId]=useState<string|null>(null),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[farmFilter,setFarmFilter]=useState('all'),[businessFilter,setBusinessFilter]=useState('all'),[modal,setModal]=useState(''),[farmParent,setFarmParent]=useState('');
 const loadSequence=useRef(0);
 const loadFields=useCallback(async()=>{
  const request=++loadSequence.current;setLoading(true);setLoadError('');
  try{
   const results=await trialRequest(signal=>Promise.all([
    currentSeason?supabase.from('fields').select('*').eq('season',currentSeason).order('farm_name').order('field_name').abortSignal(signal):Promise.resolve({data:[],error:null}),
    supabase.from('farms').select('id,name,farmer_id,user_id').eq('active',true).order('name').abortSignal(signal),
    supabase.from('farmers').select('id,name,user_id').eq('active',true).order('name').abortSignal(signal)
   ]));
   if(request!==loadSequence.current)return;
   for(const result of results)if(result.error)throw result.error;
   setFields((results[0].data as Field[]||[]).filter(field=>boundaryHasShape(field.boundary)));setFarms(results[1].data||[]);setFarmers(results[2].data||[]);
  }catch(error){if(request===loadSequence.current)setLoadError(errorMessage(error))}finally{if(request===loadSequence.current)setLoading(false)}
 },[currentSeason]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)return loadFields()});return()=>{active=false;loadSequence.current++}},[loadFields]);
 const editedField=fields.find(field=>field.id===editingFieldId),fieldFarms=farmsForField(editedField,farms);
 const visibleFarms=farms.filter(farm=>businessFilter==='all'||farm.farmer_id===businessFilter);
 const filteredFields=fields.filter(field=>{
  const id=fieldFarmId(field,farms),farm=farms.find(item=>item.id===id);
  return (businessFilter==='all'||(farm?.farmer_id||field.farmer_id)===businessFilter)&&(farmFilter==='all'||(farmFilter==='unassigned'?!id:id===farmFilter));
 });
 function startEdit(field:Field){setEditingFieldId(field.id);setValues({farm_id:fieldFarmId(field,farms)||'',field_name:field.field_name,farm_name:field.farm_name||'',crop:field.crop||'',season:field.season||currentSeason,planting_date:field.planting_date||'',cultivar:field.cultivar||'',soil_type:field.soil_type||'',expected_yield:field.expected_yield===null?'':String(field.expected_yield),area_ha:String(field.area_ha),status:field.status||'Active',notes:field.notes||''});window.scrollTo({top:0,behavior:'smooth'})}
 function cancelEdit(){setEditingFieldId(null);setValues(blankValues)}
 function openFarmForm(){
  const owner=editedField?.user_id;
  const parents=farmers.filter(farmer=>!owner||farmer.user_id===owner);
  setFarmParent(editedField?.farmer_id||parents.find(farmer=>farmer.id===businessFilter)?.id||parents[0]?.id||'');setModal('farm');
 }
 async function createBusiness(form:FormData){
  if(!canEdit)throw new Error('Fields editing access is required.');
  const name=String(form.get('name')||'').trim().replace(/\s+/g,' ');
  if(!name)throw new Error('Enter the farming business name.');
  if(farmers.some(farmer=>farmer.user_id===access.userId&&farmNameKey(farmer.name)===farmNameKey(name)))throw new Error('This business already exists. Select it when adding the farm.');
  const result=await trialRequest(signal=>supabase.from('farmers').insert({user_id:access.userId,name,active:true}).select('id,name,user_id').abortSignal(signal).single());
  if(result.error)throw new Error(result.error.message);
  setFarmers(rows=>[...rows,result.data].sort((a,b)=>a.name.localeCompare(b.name)));setFarmParent(result.data.id);setNotice('Farming business saved. You can now add its farms.');
 }
 async function createFarm(form:FormData){
  if(!canEdit)throw new Error('Fields editing access is required.');
  const parent=farmers.find(farmer=>farmer.id===String(form.get('farmer')||''));
  if(!parent)throw new Error('Choose the farming business.');
  if(editedField&&(parent.user_id!==editedField.user_id||editedField.farmer_id&&parent.id!==editedField.farmer_id))throw new Error('Choose the business that owns the field you are editing.');
  const name=validateFarmName(String(form.get('name')||''),parent.id,farms);
  const result=await trialRequest(signal=>supabase.from('farms').insert({user_id:parent.user_id,farmer_id:parent.id,name,active:true}).select('id,name,farmer_id,user_id').abortSignal(signal).single());
  if(result.error)throw new Error(result.error.message);
  const farm=result.data as FarmRecord;setFarms(rows=>[...rows,farm].sort((a,b)=>a.name.localeCompare(b.name)));
  if(editingFieldId)setValues(current=>({...current,farm_id:farm.id,farm_name:farm.name}));
  else{setBusinessFilter(parent.id);setFarmFilter(farm.id)}
  setNotice(editingFieldId?'Farm created and selected. Save field details to assign this field.':'Farm created. Edit an existing field to assign it, or open Farm Map to draw a new field.');
 }
 async function saveField(){
  if(!canEdit||!editingFieldId)return;
  if(!values.field_name.trim())return setLoadError('Enter a field name.');
  if(!Number.isFinite(Number(values.area_ha))||Number(values.area_ha)<=0)return setLoadError('Enter a positive field area.');
  const farm=fieldFarms.find(item=>item.id===values.farm_id);if(!farm)return setLoadError('Choose a saved farm or use Add a farm here.');
  setSaving(true);setLoadError('');try{
   const result=await trialRequest(signal=>supabase.from('fields').update({field_name:values.field_name.trim(),farm_name:farm.name,farm_id:farm.id,farmer_id:farm.farmer_id,crop:values.crop.trim()||null,planting_date:values.planting_date||null,cultivar:values.cultivar.trim()||null,soil_type:values.soil_type.trim()||null,expected_yield:values.expected_yield?Number(values.expected_yield):null,area_ha:Number(values.area_ha),status:values.status||'Active',notes:values.notes.trim()||null}).eq('id',editingFieldId).select('*').abortSignal(signal).single());
   if(result.error)throw result.error;
   setFields(rows=>rows.map(field=>field.id===editingFieldId?result.data as Field:field));setNotice('Field saved under '+farm.name+'. Its boundary and history remain attached.');cancelEdit();
  }catch(error){setLoadError(errorMessage(error))}finally{setSaving(false)}
 }
 const modalParents=editedField?farmers.filter(farmer=>farmer.user_id===editedField.user_id&&(!editedField.farmer_id||farmer.id===editedField.farmer_id)):farmers;
 return <main className="ag-fields-workspace min-h-screen p-4 text-[#17251c] sm:p-6">
  <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="ag-kicker">CropNex · {currentSeason||'Farm organisation'}</p><h1 className="mt-2 text-3xl font-black">Fields & Farms</h1><p className="mt-2 max-w-2xl text-sm text-[#59666b]">Farming business → farms → fields. Create farms, assign each field and edit its crop and hectares here.</p></div><Link href="/farm-map" className="rounded-xl bg-[#86cf34] px-5 py-3 font-bold text-[#111516]">Draw / import boundaries</Link></header>
  {loadError&&<div role="alert" className="mb-4 rounded-xl border border-red-800/20 bg-red-100 p-4 text-red-950">{loadError} <button onClick={()=>void loadFields()} className="font-bold underline">Reload records</button></div>}
  {notice&&<p role="status" className="mb-4 rounded-xl bg-[#dcebcf] p-4 text-[#243d21]">{notice}</p>}
  <section className="ag-panel mb-6 rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Your farms</h2><p className="mt-1 text-sm text-[#59666b]">For example: Woranga Agri is the business; Preston and Kalkpan can be farms beneath it.</p></div>{canEdit&&<div className="flex flex-wrap gap-2"><button disabled={loading||!farmers.length} onClick={openFarmForm} className="rounded-xl bg-[#86cf34] px-4 py-2 font-bold text-[#111516] disabled:opacity-40">＋ Add farm</button><button disabled={loading} onClick={()=>setModal('business')} className="rounded-xl border border-[#26372b]/20 px-3 py-2 text-sm font-semibold disabled:opacity-40">Add farming business</button></div>}</div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Farming business<select aria-label="Filter farming business" className="mt-1 w-full rounded-lg border border-[#26372b]/20 bg-white p-3" value={businessFilter} onChange={e=>{setBusinessFilter(e.target.value);setFarmFilter('all')}}><option value="all">All businesses</option>{farmers.map(farmer=><option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label><label className="text-sm font-semibold">Farm<select aria-label="Filter farm" className="mt-1 w-full rounded-lg border border-[#26372b]/20 bg-white p-3" value={farmFilter} onChange={e=>setFarmFilter(e.target.value)}><option value="all">All farms</option><option value="unassigned">Fields needing farm assignment</option>{visibleFarms.map(farm=><option key={farm.id} value={farm.id}>{farm.name} · {farmers.find(farmer=>farmer.id===farm.farmer_id)?.name||'Business'}</option>)}</select></label></div>
   {!loading&&!farmers.length&&<p className="mt-4 text-sm">Add your farming business first, then create its farms.</p>}
   <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleFarms.map(farm=><button key={farm.id} onClick={()=>{setBusinessFilter(farm.farmer_id);setFarmFilter(farm.id)}} className={'rounded-xl border p-3 text-left '+(farmFilter===farm.id?'border-[#51762f] bg-[#e1efd5]':'border-[#26372b]/15 bg-white/60')}><span className="block text-xs text-[#59666b]">{farmers.find(farmer=>farmer.id===farm.farmer_id)?.name||'Farming business'}</span><b className="mt-1 block">{farm.name}</b><span className="mt-1 block text-sm">{fields.filter(field=>fieldFarmId(field,farms)===farm.id).length} fields this season</span></button>)}</div>
   {!canEdit&&<p className="mt-4 text-sm text-[#59666b]">View-only access. Your farmer or organisation administrator manages farm and field assignments.</p>}
  </section>
  {editingFieldId&&canEdit&&<section className="mb-6"><div className="mb-3"><h2 className="text-xl font-bold">Edit {editedField?.field_name}</h2><p className="mt-1 text-sm text-[#59666b]">Choose the farm this field belongs to. Add a farm without leaving this editor; then save the field.</p></div><FieldForm farmOptions={fieldFarms} values={values} saving={saving} onChange={(name,value)=>setValues(current=>({...current,[name]:value}))} onSave={saveField} onCancel={cancelEdit} onCreateFarm={openFarmForm} submitLabel="Save field details"/></section>}
  <section><div className="mb-4 flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-bold">Fields by farm</h2><p className="mt-1 text-sm text-[#59666b]">Create new fields by drawing or importing a boundary on Farm Map. All other field details can be edited here.</p></div><span className="text-sm">{filteredFields.length} mapped fields</span></div>{loading?<p role="status">Loading farms and fields…</p>:!currentSeason?<p className="ag-panel rounded-xl p-5">Your farms can be created now. Create or select a season on Farm Map before adding fields.</p>:!filteredFields.length&&!visibleFarms.length?<p className="ag-panel rounded-xl p-5">No mapped fields in this selection. Choose another farm or create a farm and assign its fields.</p>:<FieldsByFarm fields={filteredFields} farms={farmFilter==='unassigned'?[]:visibleFarms.filter(farm=>farmFilter==='all'||farm.id===farmFilter)} farmers={farmers} canEdit={canEdit} onEdit={startEdit}/>} </section>
  {modal==='farm'&&<DialogForm title="Add farm" onClose={()=>setModal('')} onSave={createFarm}><p className="text-sm text-[#c7d8cc]">A farming business can contain several farms. Each farm can contain several fields.</p><FormField label="Farming business"><select required name="farmer" defaultValue={farmParent} className={controlClass}><option value="">Choose a farming business</option>{modalParents.map(farmer=><option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></FormField><FormField label="Farm name"><input required name="name" autoComplete="off" placeholder="For example, Preston" className={controlClass}/></FormField></DialogForm>}
  {modal==='business'&&<DialogForm title="Add farming business" onClose={()=>setModal('')} onSave={createBusiness}><p className="text-sm text-[#c7d8cc]">Use the existing Woranga Agri record if it is already listed. Create a new business only for a separate farming operation under your account.</p><FormField label="Farmer or business name"><input required name="name" autoComplete="organization" className={controlClass}/></FormField></DialogForm>}
 </main>;
}
