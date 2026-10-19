"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import EquipmentCard from "@/components/equipment/EquipmentCard";
import EquipmentForm from "@/components/equipment/EquipmentForm";
import EquipmentServicePanel from "@/components/equipment/EquipmentServicePanel";
import { supabase } from "@/lib/supabase";
import type { Equipment, EquipmentFormValues } from "@/types/equipment";

const emptyForm: EquipmentFormValues = { name:"", category:"Tractor", brand:"", model:"", registration:"", serial_number:"", year:"", purchase_date:"", purchase_price:"", engine_hours:"0", service_interval:"", last_service_hours:"", fuel_type:"Diesel", status:"Active", notes:"",installment_amount:"",installment_frequency:"Monthly",finance_start_date:"",finance_term_seasons:"",finance_notes:"" };

export default function EquipmentPage(){
  const [equipment,setEquipment]=useState<Equipment[]>([]);
  const [form,setForm]=useState<EquipmentFormValues>(emptyForm);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [serviceEquipment,setServiceEquipment]=useState<Equipment|null>(null);

  async function loadEquipment(){
    setLoading(true);
    const {data,error}=await supabase.from("equipment").select("*").order("name",{ascending:true});
    if(error) alert(error.message); else setEquipment((data||[]) as Equipment[]);
    setLoading(false);
  }
  function updateForm(name:keyof EquipmentFormValues,value:string){setForm(c=>({...c,[name]:value}));}
  function resetForm(){setEditingId(null);setForm(emptyForm);}
  function startEdit(item:Equipment){setEditingId(item.id);setForm({name:item.name,category:item.category,brand:item.brand||"",model:item.model||"",registration:item.registration||"",serial_number:item.serial_number||"",year:item.year!==null?String(item.year):"",purchase_date:item.purchase_date||"",purchase_price:item.purchase_price!==null?String(item.purchase_price):"",engine_hours:String(item.engine_hours),service_interval:item.service_interval!==null?String(item.service_interval):"",last_service_hours:item.last_service_hours!==null?String(item.last_service_hours):"",fuel_type:item.fuel_type||"Diesel",status:item.status,notes:item.notes||"",installment_amount:item.installment_amount!==null?String(item.installment_amount):"",installment_frequency:item.installment_frequency||"Monthly",finance_start_date:item.finance_start_date||"",finance_term_seasons:item.finance_term_seasons!==null?String(item.finance_term_seasons):"",finance_notes:item.finance_notes||""});window.scrollTo({top:0,behavior:"smooth"});}
  async function saveEquipment(){
    if(!form.name.trim()){alert("Enter an equipment name.");return;}
    setSaving(true);
    try{
      const {data:userData,error:userError}=await supabase.auth.getUser();
      if(userError||!userData.user){alert("You must be logged in.");return;}
      const payload={user_id:userData.user.id,name:form.name.trim(),category:form.category,brand:form.brand.trim()||null,model:form.model.trim()||null,registration:form.registration.trim()||null,serial_number:form.serial_number.trim()||null,year:form.year?Number(form.year):null,purchase_date:form.purchase_date||null,purchase_price:form.purchase_price?Number(form.purchase_price):null,engine_hours:Number(form.engine_hours||0),service_interval:form.service_interval?Number(form.service_interval):null,last_service_hours:form.last_service_hours?Number(form.last_service_hours):null,fuel_type:form.fuel_type||null,status:form.status,notes:form.notes.trim()||null,installment_amount:form.installment_amount?Number(form.installment_amount):null,installment_frequency:form.installment_frequency||null,finance_start_date:form.finance_start_date||null,finance_term_seasons:form.finance_term_seasons?Number(form.finance_term_seasons):null,finance_notes:form.finance_notes.trim()||null};
      const q=editingId?supabase.from("equipment").update(payload).eq("id",editingId):supabase.from("equipment").insert(payload);
      const {error}=await q;if(error){alert(error.message);return;}resetForm();await loadEquipment();
    }finally{setSaving(false);}
  }
  useEffect(()=>{void loadEquipment();},[]);
  return <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">CropNex</p><h1 className="mt-2 text-4xl font-black">Equipment Management</h1><p className="mt-2 text-gray-400">Track machinery, engine hours and service intervals.</p></div><Link href="/dashboard" className="rounded-xl border border-white/10 px-5 py-3">Back to Dashboard</Link></div>
    <section className="mb-6 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[#83c341]/20 bg-[#83c341]/[.06] p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-[#a4df57]">Current readings</p><h2 className="mt-2 text-lg font-bold">Manual and imported hours</h2><p className="mt-2 text-sm leading-6 text-[#91a198]">Update engine hours from the equipment card. Spreadsheet and telematics-file imports can be added without changing the equipment register.</p></div><div className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-sky-300">Connected equipment</p><h2 className="mt-2 text-lg font-bold">Manufacturer connection required</h2><p className="mt-2 text-sm leading-6 text-[#91a198]">Live hours, locations and alerts require the farmer to authorise CropNex through services such as John Deere Operations Center or CNH FieldOps.</p></div></section>
    <EquipmentForm values={form} saving={saving} onChange={updateForm} onSave={saveEquipment} onCancel={editingId?resetForm:undefined} submitLabel={editingId?"Update Equipment":"Save Equipment"}/>
    <section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-bold">Equipment Register</h2><span className="text-sm text-gray-400">{equipment.length} item{equipment.length===1?"":"s"}</span></div>{loading?<p className="text-gray-400">Loading equipment...</p>:equipment.length===0?<p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-400">No equipment added yet.</p>:<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{equipment.map(item=><EquipmentCard key={item.id} equipment={item} onEdit={startEdit} onOpenServices={setServiceEquipment} />)}</div>}</section>
    {serviceEquipment&&<EquipmentServicePanel equipment={serviceEquipment} onClose={()=>setServiceEquipment(null)} onSaved={loadEquipment}/>} 
  </main>;
}
