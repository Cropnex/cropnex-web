"use client";

import { useEffect, useMemo, useState } from "react";
import PhotoUploader from "@/components/scouting/PhotoUploader";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { ScoutingObservation } from "@/types/scouting";
import { saveOfflineItem } from "@/lib/offline-db";
import type { OfflineQueueItem } from "@/types/offline";
import { useSeason } from "@/components/season/SeasonProvider";
import {
  getOfflineFields,
  saveFieldsOffline,
} from "@/lib/offline-fields";


const PHOTO_BUCKET = "scouting-photos";
const LAYER_BUCKET = "agcore-layers";
type NdviMetadata = { purpose?:string; display_ready?:boolean; average_ndvi?:number|null; minimum_ndvi?:number|null; maximum_ndvi?:number|null; cloud_cover_percent?:number|null; scene_reference?:string|null };
type NdviLayer = { id:string; field_id:string|null; field_name:string|null; captured_date:string|null; file_name:string; storage_path:string; file_format:string|null; status:string; created_at:string; metadata:NdviMetadata|null };
type CopernicusScene={id:string;date:string;cloudCover:number;platform:string};
type AiDiagnosis={issue_name:string;category:string;severity:string;confidence:number;possible_causes:string[];recommendation:string;active_ingredients:string[];warning_signs:string[]};
async function readApiResponse(response:Response){const text=await response.text();try{return JSON.parse(text);}catch{const hint=response.status===404?"The automatic-imagery API route was not included in this deployment.":`The server returned an HTML error page (${response.status}).`;throw new Error(`${hint} Redeploy the complete CropNex package and check the Vercel Function logs.`);}}
function satelliteBoundary(points:NonNullable<Field["boundary"]>,maximum=350){if(points.length<=maximum)return points;const step=Math.ceil(points.length/maximum);const reduced=points.filter((_,index)=>index%step===0);const last=points[points.length-1];if(reduced[reduced.length-1]!==last)reduced.push(last);return reduced;}

const emptyForm = {
  field_id: "",
  source_layer_id: "",
  observation_date: "",
  observation_time: "",
  category: "Pest",
  issue_name: "",
  severity: "Low",
  latitude: "",
  longitude: "",
  crop_stage: "",
  affected_area_ha: "",
  recommendation: "",
  follow_up_date: "",
  status: "Open",
  photo_url: "",
  notes: "",
};

export default function ScoutingPage() {
  const { currentSeason } = useSeason();
  const [fields, setFields] = useState<Field[]>([]);
  const [observations, setObservations] =
    useState<ScoutingObservation[]>([]);
  const [signedPhotoUrls, setSignedPhotoUrls] = useState<
    Record<string, string>
  >({});
  const [form, setForm] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [ndviLayers,setNdviLayers]=useState<NdviLayer[]>([]);
  const [layerUrls,setLayerUrls]=useState<Record<string,string>>({});
  const [layerForm,setLayerForm]=useState({field_id:"",captured_date:"",source:"Manual upload",average_ndvi:"",minimum_ndvi:"",maximum_ndvi:"",cloud_cover_percent:"",scene_reference:""});
  const [layerFile,setLayerFile]=useState<File|null>(null);
  const [uploadingLayer,setUploadingLayer]=useState(false);
  const [automaticForm,setAutomaticForm]=useState({field_id:"",from:"",to:"",maxCloud:"30"});
  const [scenes,setScenes]=useState<CopernicusScene[]>([]);
  const [searchingScenes,setSearchingScenes]=useState(false);
  const [generatingScene,setGeneratingScene]=useState("");
  const [createJob,setCreateJob]=useState(false);
  const [diagnosing,setDiagnosing]=useState(false),[diagnosis,setDiagnosis]=useState<AiDiagnosis|null>(null);

async function loadAll() {
  const { data: sessionData } =
    await supabase.auth.getSession();

  const userId = sessionData.session?.user.id;

  if (!userId) {
    alert(
      "No saved login session was found. Connect to the internet and sign in again."
    );
    return;
  }

  const cachedFields = getOfflineFields(userId).filter(field=>field.season===currentSeason);

  if (cachedFields.length > 0) {
    setFields(cachedFields);
  }

  // Offline: use the locally cached field list.
  if (!navigator.onLine) {
    return;
  }

  const [fieldsResult, observationsResult, layersResult] =
    await Promise.all([
      supabase
        .from("fields")
        .select("*")
        .eq("season", currentSeason)
        .order("farm_name")
        .order("field_name"),

      supabase
        .from("scouting_observations")
        .select("*")
        .order("observation_date", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        }),
      supabase.from("map_layers").select("id,field_id,field_name,captured_date,file_name,storage_path,file_format,status,created_at,metadata").eq("layer_type","NDVI").eq("season",currentSeason).order("captured_date",{ascending:false}),
    ]);

  if (fieldsResult.error) {
    console.error(fieldsResult.error);

    if (cachedFields.length === 0) {
      alert(
        "Fields could not be loaded and no offline field cache is available."
      );
    }
  } else {
    const loadedFields =
      (fieldsResult.data || []) as Field[];

    setFields(loadedFields);
    saveFieldsOffline(userId, loadedFields);
  }

  if (observationsResult.error) {
    console.error(observationsResult.error);
  } else {
    const loadedObservations =
      (observationsResult.data ||
        []) as ScoutingObservation[];

    const activeFieldIds=new Set(((fieldsResult.data||[]) as Field[]).map(field=>field.id));
    const seasonObservations=loadedObservations.filter(observation=>activeFieldIds.has(observation.field_id));
    setObservations(seasonObservations);

    await loadSignedPhotoUrls(
      seasonObservations
    );
  }
  if(!layersResult.error){const loaded=(layersResult.data||[]) as NdviLayer[];setNdviLayers(loaded);const pairs=await Promise.all(loaded.map(async layer=>{const{data}=await supabase.storage.from(LAYER_BUCKET).createSignedUrl(layer.storage_path,3600);return[layer.id,data?.signedUrl||""] as const;}));setLayerUrls(Object.fromEntries(pairs));}
}

  async function loadSignedPhotoUrls(
    loaded: ScoutingObservation[]
  ) {
    const pairs = await Promise.all(
      loaded.map(async (observation) => {
        if (!observation.photo_path) {
          return [observation.id, ""] as const;
        }

        const { data, error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(observation.photo_path, 3600);

        if (error) {
          console.error(error);
          return [observation.id, ""] as const;
        }

        return [observation.id, data.signedUrl] as const;
      })
    );

    setSignedPhotoUrls(Object.fromEntries(pairs));
  }

  useEffect(() => {
    setForm(value=>({...value,field_id:"",source_layer_id:""}));
    void loadAll();
  }, [currentSeason]);

  useEffect(() => {
  function handleOnline() {
    void loadAll();
  }

  window.addEventListener("online", handleOnline);

  return () => {
    window.removeEventListener(
      "online",
      handleOnline
    );
  };
}, [currentSeason]);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  function setSelectedPhoto(
    file: File | null,
    previewUrl: string
  ) {
    if (photoPreview && photoPreview !== previewUrl) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoFile(file);
    setPhotoPreview(previewUrl);
    setDiagnosis(null);
  }

  async function diagnosePhoto(){
    if(!photoFile)return alert("Choose a clear crop photo first.");
    const field=fields.find(item=>item.id===form.field_id);if(!field)return alert("Choose the field so CropNex knows the crop.");
    setDiagnosing(true);
    try{const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(photoFile)});const response=await fetch("/api/scouting-diagnosis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image,crop:field.crop,cropStage:form.crop_stage})});const result=await response.json();if(!response.ok)throw new Error(result.error||"The photo could not be assessed.");setDiagnosis(result.data as AiDiagnosis);}catch(error){alert(error instanceof Error?error.message:"The photo could not be assessed.")}finally{setDiagnosing(false)}
  }
  function applyDiagnosis(){if(!diagnosis)return;setForm(current=>({...current,issue_name:diagnosis.issue_name,category:diagnosis.category,severity:diagnosis.severity,recommendation:`${diagnosis.recommendation}${diagnosis.active_ingredients.length?` Suggested active ingredients / treatment classes: ${diagnosis.active_ingredients.join(", ")}.`:""} Confirm with an agronomist and the registered product label before application.`}));}

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported on this device.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }));
        setLocating(false);
      },
      () => {
        alert(
          "Could not read your location. Check browser permissions."
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
      }
    );
  }

  function safeFilename(filename: string) {
    const extension =
      filename.split(".").pop()?.toLowerCase() || "jpg";

    return `${crypto.randomUUID()}.${extension.replace(
      /[^a-z0-9]/g,
      ""
    )}`;
  }

  async function uploadPhoto(userId: string) {
    if (!photoFile) return null;

    const path = `${userId}/${safeFilename(photoFile.name)}`;

    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, photoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: photoFile.type,
      });

    if (error) {
      throw new Error(error.message);
    }

    return path;
  }

  async function uploadNdviLayer(){
    if(!layerForm.field_id||!layerForm.captured_date||!layerFile)return alert("Choose a field, image date and NDVI file.");
    const extension=layerFile.name.split(".").pop()?.toLowerCase()||"";
    if(!["tif","tiff","png","jpg","jpeg","zip","geojson","json"].includes(extension))return alert("Upload GeoTIFF, PNG, JPG, GeoJSON or a ZIP shapefile.");
    setUploadingLayer(true);
    try{
      const{data}=await supabase.auth.getUser();if(!data.user)return alert("You must be logged in.");
      const field=fields.find(item=>item.id===layerForm.field_id),path=`${data.user.id}/${Date.now()}-${layerFile.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;
      const{error:uploadError}=await supabase.storage.from(LAYER_BUCKET).upload(path,layerFile);if(uploadError)throw uploadError;
      const numberOrNull=(value:string)=>value===""?null:Number(value);
      const{error}=await supabase.from("map_layers").insert({user_id:data.user.id,field_id:field?.id||null,farm_name:field?.farm_name||null,field_name:field?.field_name||null,season:field?.season||null,layer_type:"NDVI",source:layerForm.source,captured_date:layerForm.captured_date,file_name:layerFile.name,storage_path:path,file_format:extension.toUpperCase(),status:"Uploaded",metadata:{purpose:"Field scouting",display_ready:["png","jpg","jpeg","geojson","json"].includes(extension),average_ndvi:numberOrNull(layerForm.average_ndvi),minimum_ndvi:numberOrNull(layerForm.minimum_ndvi),maximum_ndvi:numberOrNull(layerForm.maximum_ndvi),cloud_cover_percent:numberOrNull(layerForm.cloud_cover_percent),scene_reference:layerForm.scene_reference.trim()||null}});if(error)throw error;
      setLayerFile(null);setLayerForm({field_id:"",captured_date:"",source:"Manual upload",average_ndvi:"",minimum_ndvi:"",maximum_ndvi:"",cloud_cover_percent:"",scene_reference:""});await loadAll();alert("NDVI layer uploaded. CropNex has added it to the field trend history.");
    }catch(error){alert(error instanceof Error?error.message:"NDVI upload failed.");}finally{setUploadingLayer(false);}
  }

  async function searchAutomaticImagery(){
    const field=fields.find(item=>item.id===automaticForm.field_id);
    if(!field?.boundary?.length)return alert("Choose a field that has a saved boundary.");
    if(!automaticForm.from||!automaticForm.to)return alert("Choose a start and end date.");
    setSearchingScenes(true);setScenes([]);
    try{const{data}=await supabase.auth.getSession();const token=data.session?.access_token;if(!token)throw new Error("Sign in to search satellite imagery.");const response=await fetch("/api/copernicus/search",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({boundary:satelliteBoundary(field.boundary),from:automaticForm.from,to:automaticForm.to,maxCloud:Number(automaticForm.maxCloud)||30})});const result=await readApiResponse(response);if(!response.ok)throw new Error(result.error||"Imagery search failed.");setScenes(result.scenes||[]);}catch(error){alert(error instanceof Error?error.message:"Imagery search failed.");}finally{setSearchingScenes(false);}
  }

  async function generateAutomaticNdvi(scene:CopernicusScene){
    const field=fields.find(item=>item.id===automaticForm.field_id);if(!field?.boundary?.length)return;
    setGeneratingScene(scene.id);
    try{
      const{data:sessionData}=await supabase.auth.getSession();const token=sessionData.session?.access_token;if(!token)throw new Error("Sign in to generate satellite imagery.");const response=await fetch("/api/copernicus/generate",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({boundary:satelliteBoundary(field.boundary),date:scene.date,sceneId:scene.id})});const result=await readApiResponse(response);if(!response.ok)throw new Error(result.error||"NDVI generation failed.");
      const binary=atob(result.image),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);const file=new Blob([bytes],{type:"image/png"});
      const{data}=await supabase.auth.getUser();if(!data.user)throw new Error("You must be logged in.");const fileName=`Sentinel-2-NDVI-${field.field_name}-${scene.date}.png`,path=`${data.user.id}/automatic/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g,"-")}`;
      const{error:uploadError}=await supabase.storage.from(LAYER_BUCKET).upload(path,file,{contentType:"image/png"});if(uploadError)throw uploadError;
      const{error}=await supabase.from("map_layers").insert({user_id:data.user.id,field_id:field.id,farm_name:field.farm_name,field_name:field.field_name,season:field.season,layer_type:"NDVI",source:"Copernicus Sentinel-2",captured_date:scene.date,file_name:fileName,storage_path:path,file_format:"PNG",status:"Processed",metadata:{purpose:"Automatic field scouting",display_ready:true,average_ndvi:result.stats?.mean??null,minimum_ndvi:result.stats?.min??null,maximum_ndvi:result.stats?.max??null,cloud_cover_percent:scene.cloudCover,scene_reference:scene.id,provider:"Copernicus Data Space Ecosystem"}});if(error)throw error;
      await loadAll();alert("Automatic Sentinel-2 NDVI imagery was added to the field history.");
    }catch(error){alert(error instanceof Error?error.message:"NDVI generation failed.");}finally{setGeneratingScene("");}
  }

  const ndviTrends=useMemo(()=>{
    const groups=new Map<string,NdviLayer[]>();
    ndviLayers.forEach(layer=>{if(layer.field_id&&typeof layer.metadata?.average_ndvi==="number"){const list=groups.get(layer.field_id)||[];list.push(layer);groups.set(layer.field_id,list);}});
    return Array.from(groups.entries()).map(([fieldId,layers])=>{
      const ordered=[...layers].sort((a,b)=>(b.captured_date||"").localeCompare(a.captured_date||""));
      const latest=ordered[0],previous=ordered[1];
      const current=latest.metadata?.average_ndvi??null,prior=previous?.metadata?.average_ndvi??null;
      const change=current!==null&&prior!==null?current-prior:null;
      return{fieldId,fieldName:latest.field_name||fields.find(field=>field.id===fieldId)?.field_name||"Field",latest,previous,current,change};
    }).sort((a,b)=>(a.change??1)-(b.change??1));
  },[ndviLayers,fields]);

  async function createNdviScout(layer:NdviLayer,change:number|null){
    if(!layer.field_id)return;
    const{data}=await supabase.auth.getUser();if(!data.user)return alert("You must be logged in.");
    const date=new Date();date.setDate(date.getDate()+2);
    const payload={user_id:data.user.id,field_id:layer.field_id,source_layer_id:layer.id,observation_date:new Date().toISOString().slice(0,10),category:"Unknown NDVI Variation",issue_name:change!==null&&change<0?`NDVI decline (${change.toFixed(2)})`:`NDVI field check`,severity:change!==null&&change<=-0.15?"High":"Medium",recommendation:"Inspect the low-vigour areas shown on the latest NDVI layer and record the likely cause.",follow_up_date:date.toISOString().slice(0,10),status:"Open",notes:`Generated from ${layer.captured_date||"latest"} NDVI layer.`};
    const{error}=await supabase.from("scouting_observations").insert(payload);if(error)return alert(error.message);
    await loadAll();alert("Targeted scouting observation created.");
  }

 async function saveObservation() {
  if (
    !form.field_id ||
    !form.observation_date ||
    !form.issue_name.trim()
  ) {
    alert("Select a field, date and issue.");
    return;
  }

  // Save locally first when offline.
  if (!navigator.onLine) {
    // ArrayBuffer survives iOS PWA/IndexedDB restarts more reliably than File.
    const photoData = photoFile
      ? await photoFile.arrayBuffer()
      : null;
    const item: OfflineQueueItem = {
      id: crypto.randomUUID(),
      status: "pending",
      attempts: 0,
      last_error: null,
      created_at: new Date().toISOString(),
      payload: {
        field_id: form.field_id,
        source_layer_id: form.source_layer_id || null,
        observation_date: form.observation_date,
        observation_time:
          form.observation_time || null,
        category: form.category,
        issue_name: form.issue_name.trim(),
        severity: form.severity,
        latitude: form.latitude
          ? Number(form.latitude)
          : null,
        longitude: form.longitude
          ? Number(form.longitude)
          : null,
        crop_stage:
          form.crop_stage.trim() || null,
        affected_area_ha:
          form.affected_area_ha
            ? Number(form.affected_area_ha)
            : null,
        recommendation:
          form.recommendation.trim() || null,
        follow_up_date:
          form.follow_up_date || null,
        status: form.status,
        photo_url:
          form.photo_url.trim() || null,
        notes: form.notes.trim() || null,
      },
      photo_blob: null,
      photo_data: photoData,
      photo_name: photoFile?.name || null,
      photo_type: photoFile?.type || null,
    };

    await saveOfflineItem(item);

    window.dispatchEvent(
      new CustomEvent("agcore-sync-updated")
    );

    alert(
      "Saved offline. CropNex will sync it when connectivity returns."
    );

    setForm(emptyForm);
    setSelectedPhoto(null, "");
    return;
  }

  // Only validate against Supabase when online.
  const { data } =
    await supabase.auth.getUser();

  if (!data.user) {
    alert("You must be logged in.");
    return;
  }

  setSaving(true);
  try {
    const photoPath = await uploadPhoto(data.user.id);
    const payload = {
      user_id:data.user.id, field_id:form.field_id, source_layer_id:form.source_layer_id||null,
      observation_date:form.observation_date, observation_time:form.observation_time||null,
      category:form.category, issue_name:form.issue_name.trim(), severity:form.severity,
      latitude:form.latitude?Number(form.latitude):null, longitude:form.longitude?Number(form.longitude):null,
      crop_stage:form.crop_stage.trim()||null, affected_area_ha:form.affected_area_ha?Number(form.affected_area_ha):null,
      recommendation:form.recommendation.trim()||null, follow_up_date:form.follow_up_date||null,
      status:form.status, photo_url:form.photo_url.trim()||null, photo_path:photoPath, notes:form.notes.trim()||null,
    };
    const {data:observation,error}=await supabase.from("scouting_observations").insert(payload).select("id").single();
    if(error)throw error;
    if(createJob&&observation){const field=fields.find(item=>item.id===form.field_id);const{error:jobError}=await supabase.from("work_orders").insert({user_id:data.user.id,title:`Scout follow-up: ${form.issue_name.trim()}`,field_id:field?.id||null,field_name:field?.field_name||null,activity_type:"Scouting follow-up",planned_date:form.follow_up_date||form.observation_date,status:"Planned",notes:`Created from scouting observation ${observation.id}${form.recommendation.trim()?` · ${form.recommendation.trim()}`:""}`});if(jobError)throw jobError;}
    setForm(emptyForm);setSelectedPhoto(null,"");setCreateJob(false);await loadAll();alert(createJob?"Observation and follow-up job saved.":"Scouting observation saved.");
  } catch(error) { alert(error instanceof Error?error.message:"Observation could not be saved."); }
  finally { setSaving(false); }
}

  async function updateStatus(
    observation: ScoutingObservation,
    status: string
  ) {
    const { error } = await supabase
      .from("scouting_observations")
      .update({ status })
      .eq("id", observation.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadAll();
  }

  async function deleteObservation(
    observation: ScoutingObservation
  ) {
    const confirmed = window.confirm(
      `Delete "${observation.issue_name}"?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("scouting_observations")
      .delete()
      .eq("id", observation.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (observation.photo_path) {
      await supabase.storage
        .from(PHOTO_BUCKET)
        .remove([observation.photo_path]);
    }

    await loadAll();
  }

  const totals = useMemo(() => {
    const open = observations.filter(
      (item) => item.status === "Open"
    ).length;

    const critical = observations.filter(
      (item) =>
        item.status !== "Resolved" &&
        item.severity === "Critical"
    ).length;

    const photos = observations.filter(
      (item) => item.photo_path || item.photo_url
    ).length;

    return { open, critical, photos };
  }, [observations]);

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
          CropNex
        </p>

        <h1 className="mt-2 text-4xl font-black">
          Mobile Scouting & Photos
        </h1>

        <p className="mt-2 text-gray-400">
          Capture secure field photos directly from your phone.
        </p>
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <Summary
          label="Open observations"
          value={String(totals.open)}
          className="text-amber-400"
        />
        <Summary
          label="Critical issues"
          value={String(totals.critical)}
          className="text-red-400"
        />
        <Summary
          label="Photo records"
          value={String(totals.photos)}
          className="text-green-400"
        />
      </section>

      <section className="mb-8 rounded-2xl border border-sky-400/20 bg-sky-400/[.045] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-sky-300">Stage 3 · Automatic imagery</p><h2 className="mt-1 text-2xl font-bold">Sentinel-2 field imagery</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#91a198]">Search Copernicus satellite scenes using the saved field boundary. CropNex clips the image to the field, calculates NDVI statistics and adds the result to the field history.</p></div><span className="rounded-full bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-300">10 m satellite data</span></div>
        <div className="mt-5 grid gap-3 md:grid-cols-5"><Select label="Field boundary" value={automaticForm.field_id} onChange={value=>{setAutomaticForm({...automaticForm,field_id:value});setScenes([])}}><option value="">Select field</option>{fields.map(field=><option key={field.id} value={field.id} disabled={!field.boundary?.length}>{field.farm_name} · {field.field_name}{!field.boundary?.length?" · no boundary":""}</option>)}</Select><Input label="From" type="date" value={automaticForm.from} onChange={value=>setAutomaticForm({...automaticForm,from:value})}/><Input label="To" type="date" value={automaticForm.to} onChange={value=>setAutomaticForm({...automaticForm,to:value})}/><Input label="Maximum cloud %" type="number" value={automaticForm.maxCloud} onChange={value=>setAutomaticForm({...automaticForm,maxCloud:value})}/><button type="button" onClick={searchAutomaticImagery} disabled={searchingScenes} className="self-end rounded-xl bg-sky-300 px-4 py-3 font-black text-[#06110d] disabled:opacity-40">{searchingScenes?"Searching…":"Find imagery"}</button></div>
        {scenes.length>0&&<div className="mt-5 overflow-hidden rounded-xl border border-white/[.07]"><div className="grid grid-cols-[1fr_110px_120px] bg-black/30 px-4 py-3 text-xs font-black uppercase tracking-wider text-[#829087]"><span>Available scene</span><span>Cloud cover</span><span></span></div>{scenes.map(scene=><div key={scene.id} className="grid grid-cols-[1fr_110px_120px] items-center border-t border-white/[.06] px-4 py-3"><div><strong>{scene.date}</strong><p className="mt-1 truncate text-xs text-[#718278]">{scene.id}</p></div><span className={scene.cloudCover<=10?"text-[#a4df57]":"text-amber-300"}>{scene.cloudCover.toFixed(1)}%</span><button type="button" disabled={Boolean(generatingScene)} onClick={()=>generateAutomaticNdvi(scene)} className="rounded-lg bg-[#83c341] px-3 py-2 text-xs font-black text-[#07130e] disabled:opacity-40">{generatingScene===scene.id?"Processing…":"Add NDVI"}</button></div>)}</div>}
        {!searchingScenes&&automaticForm.field_id&&scenes.length===0&&<p className="mt-4 text-xs text-[#718278]">Choose dates and select Find imagery. Results with the lowest cloud cover appear first.</p>}
      </section>

      <section className="mb-8 rounded-2xl border border-[#83c341]/20 bg-[#83c341]/[.045] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#a4df57]">Imagery & scouting</p><h2 className="mt-1 text-2xl font-bold">NDVI layers</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#91a198]">Upload a dated NDVI map, link it to a field and use it as the source for targeted scouting observations. GeoTIFF remains available for spatial processing; PNG and JPG can be previewed immediately.</p></div><span className="rounded-full bg-black/20 px-3 py-2 text-xs font-bold text-[#a4df57]">{ndviLayers.length} layer{ndviLayers.length===1?"":"s"}</span></div>
        <div className="mt-5 grid gap-3 md:grid-cols-4"><Select label="Field" value={layerForm.field_id} onChange={value=>setLayerForm({...layerForm,field_id:value})}><option value="">Select field</option>{fields.map(field=><option key={field.id} value={field.id}>{field.farm_name} · {field.field_name}</option>)}</Select><Input label="Image date" type="date" value={layerForm.captured_date} onChange={value=>setLayerForm({...layerForm,captured_date:value})}/><Select label="Source" value={layerForm.source} onChange={value=>setLayerForm({...layerForm,source:value})}><option>Manual upload</option><option>Agronomist</option><option>Drone</option><option>Sentinel-2</option><option>Other</option></Select><label className="text-sm text-gray-400">NDVI file<input type="file" accept=".tif,.tiff,.png,.jpg,.jpeg,.zip,.geojson,.json" onChange={event=>setLayerFile(event.target.files?.[0]||null)} className="mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs"/></label></div>
        <div className="mt-3 grid gap-3 md:grid-cols-5"><Input label="Average NDVI" type="number" value={layerForm.average_ndvi} onChange={value=>setLayerForm({...layerForm,average_ndvi:value})}/><Input label="Minimum NDVI" type="number" value={layerForm.minimum_ndvi} onChange={value=>setLayerForm({...layerForm,minimum_ndvi:value})}/><Input label="Maximum NDVI" type="number" value={layerForm.maximum_ndvi} onChange={value=>setLayerForm({...layerForm,maximum_ndvi:value})}/><Input label="Cloud cover %" type="number" value={layerForm.cloud_cover_percent} onChange={value=>setLayerForm({...layerForm,cloud_cover_percent:value})}/><Input label="Scene reference" value={layerForm.scene_reference} onChange={value=>setLayerForm({...layerForm,scene_reference:value})}/></div>
        <p className="mt-2 text-xs text-[#718278]">NDVI values run from -1 to 1. Add the average supplied by your imagery provider so CropNex can compare dates and flag declining fields.</p>
        <button type="button" onClick={uploadNdviLayer} disabled={uploadingLayer} className="mt-4 rounded-xl bg-[#83c341] px-5 py-3 font-black text-[#07130e] disabled:opacity-40">{uploadingLayer?"Uploading…":"Upload NDVI layer"}</button>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ndviLayers.slice(0,9).map(layer=>{const preview=/^(PNG|JPG|JPEG)$/.test(layer.file_format||"");return <article key={layer.id} className="overflow-hidden rounded-xl border border-white/[.07] bg-black/20">{preview&&layerUrls[layer.id]&&<img src={layerUrls[layer.id]} alt={`NDVI ${layer.field_name||"field"}`} className="h-36 w-full object-cover"/>}<div className="p-4"><div className="flex justify-between gap-3"><strong>{layer.field_name||"Unassigned field"}</strong><span className="text-xs text-[#a4df57]">{layer.captured_date||"No date"}</span></div><p className="mt-1 truncate text-xs text-[#829087]">{layer.file_name} · {layer.file_format}</p>{layerUrls[layer.id]&&<a href={layerUrls[layer.id]} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-bold text-[#a4df57]">Open layer file</a>}</div></article>})}{!ndviLayers.length&&<p className="text-sm text-[#718278]">No NDVI imagery uploaded yet.</p>}</div>
      </section>

      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[.035] p-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#a4df57]">Stage 2</p><h2 className="mt-1 text-2xl font-bold">NDVI change monitor</h2><p className="mt-2 text-sm text-[#91a198]">The newest field score is compared with its previous image. A fall of 0.10 or more is highlighted for scouting.</p></div><span className="text-xs font-bold text-[#829087]">Two dated layers are needed per field</span></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{ndviTrends.map(trend=>{const declining=trend.change!==null&&trend.change<=-0.1;return <article key={trend.fieldId} className={`rounded-xl border p-4 ${declining?"border-amber-400/40 bg-amber-400/[.06]":"border-white/[.07] bg-black/20"}`}><div className="flex items-start justify-between gap-3"><div><strong>{trend.fieldName}</strong><p className="mt-1 text-xs text-[#829087]">Latest image {trend.latest.captured_date||"undated"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-black ${declining?"bg-amber-400/15 text-amber-300":"bg-[#83c341]/10 text-[#a4df57]"}`}>{trend.change===null?"Baseline":`${trend.change>=0?"+":""}${trend.change.toFixed(2)}`}</span></div><div className="mt-4 flex items-end justify-between"><div><p className="text-3xl font-black">{trend.current?.toFixed(2)}</p><p className="text-xs text-[#829087]">Average NDVI</p></div><button type="button" onClick={()=>createNdviScout(trend.latest,trend.change)} className="rounded-lg border border-[#83c341]/30 px-3 py-2 text-xs font-black text-[#a4df57]">Create scout task</button></div></article>})}{!ndviTrends.length&&<p className="text-sm text-[#718278]">Upload an NDVI layer with an average value to start the field trend history.</p>}</div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-5 text-2xl font-bold text-green-400">
          New Observation
        </h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select
            label="Field"
            value={form.field_id}
            onChange={(value) =>
              setForm({ ...form, field_id: value })
            }
          >
            <option value="">Select field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.field_name} · {field.crop || "No crop"}
              </option>
            ))}
          </Select>

          <Input
            label="Observation date"
            type="date"
            value={form.observation_date}
            onChange={(value) =>
              setForm({ ...form, observation_date: value })
            }
          />

          <Input
            label="Observation time"
            type="time"
            value={form.observation_time}
            onChange={(value) =>
              setForm({ ...form, observation_time: value })
            }
          />

          <Select
            label="Category"
            value={form.category}
            onChange={(value) =>
              setForm({ ...form, category: value })
            }
          >
            <option>Pest</option>
            <option>Disease</option>
            <option>Weed</option>
            <option>Nutrient Deficiency</option>
            <option>Water Stress</option>
            <option>Waterlogging</option>
            <option>Storm Damage</option>
            <option>Hail or Frost</option>
            <option>Emergence</option>
            <option>Unknown NDVI Variation</option>
            <option>General</option>
          </Select>

          <Select label="NDVI source image (optional)" value={form.source_layer_id} onChange={value=>setForm({...form,source_layer_id:value})}><option value="">No linked image</option>{ndviLayers.filter(layer=>!form.field_id||layer.field_id===form.field_id).map(layer=><option key={layer.id} value={layer.id}>{layer.captured_date||"No date"} · {layer.file_name}</option>)}</Select>

          <Input
            label="Issue"
            value={form.issue_name}
            onChange={(value) =>
              setForm({ ...form, issue_name: value })
            }
          />

          <Select
            label="Severity"
            value={form.severity}
            onChange={(value) =>
              setForm({ ...form, severity: value })
            }
          >
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Critical</option>
          </Select>

          <Input
            label="Crop stage"
            value={form.crop_stage}
            onChange={(value) =>
              setForm({ ...form, crop_stage: value })
            }
          />

          <Input
            label="Affected area (ha)"
            type="number"
            value={form.affected_area_ha}
            onChange={(value) =>
              setForm({ ...form, affected_area_ha: value })
            }
          />

          <Input
            label="Follow-up date"
            type="date"
            value={form.follow_up_date}
            onChange={(value) =>
              setForm({ ...form, follow_up_date: value })
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="rounded-xl border border-white/10 px-5 py-3"
          >
            {locating
              ? "Reading Location..."
              : "Use Current GPS Location"}
          </button>

          <PhotoUploader
            file={photoFile}
            previewUrl={photoPreview}
            onChange={setSelectedPhoto}
          />
          <button type="button" onClick={diagnosePhoto} disabled={!photoFile||diagnosing} className="rounded-xl border border-[#83c341]/30 px-5 py-3 font-bold text-[#a4df57] disabled:opacity-40">{diagnosing?"Assessing symptoms…":"AI assess crop photo"}</button>
        </div>

        {diagnosis&&<div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.055] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-amber-300">Possible diagnosis · {diagnosis.confidence}% confidence</p><h3 className="mt-1 text-lg font-bold">{diagnosis.issue_name}</h3></div><button type="button" onClick={applyDiagnosis} className="rounded-lg bg-[#83c341] px-4 py-2 text-xs font-black text-[#07130e]">Use in observation</button></div><p className="mt-3 text-sm text-[#c0cac4]">{diagnosis.recommendation}</p>{diagnosis.possible_causes.length>0&&<p className="mt-2 text-xs text-[#91a198]"><b>Possible causes:</b> {diagnosis.possible_causes.join(" · ")}</p>}{diagnosis.active_ingredients.length>0&&<p className="mt-2 text-xs text-[#91a198]"><b>Possible treatment classes or active ingredients:</b> {diagnosis.active_ingredients.join(" · ")}</p>}<p className="mt-3 text-xs font-bold text-amber-200">AI is a scouting aid, not a pesticide prescription. Confirm the diagnosis, crop registration, withholding period and label with a qualified agronomist.</p></div>}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <textarea
            rows={4}
            value={form.recommendation}
            onChange={(event) =>
              setForm({
                ...form,
                recommendation: event.target.value,
              })
            }
            placeholder="Recommendation or proposed action"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />

          <textarea
            rows={4}
            value={form.notes}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
            placeholder="Additional notes"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
          />
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm"><input type="checkbox" checked={createJob} onChange={event=>setCreateJob(event.target.checked)} className="h-4 w-4"/><span><b>Create a follow-up job card</b><small className="mt-1 block text-[#819087]">Uses the follow-up date, field, issue and recommendation.</small></span></label>

        <button
          type="button"
          onClick={saveObservation}
          disabled={saving}
          className="mt-5 rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
        >
          {saving ? "Uploading & Saving..." : "Save Observation"}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">
          Observation Register
        </h2>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {observations.map((observation) => {
            const field = fields.find(
              (item) => item.id === observation.field_id
            );

            const displayPhoto =
              signedPhotoUrls[observation.id] ||
              observation.photo_url ||
              "";

            return (
              <article
                key={observation.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                {displayPhoto && (
                  <a
                    href={displayPhoto}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={displayPhoto}
                      alt={observation.issue_name}
                      className="h-52 w-full object-cover"
                    />
                  </a>
                )}

                <div className="p-5">
                  <p className="text-sm text-gray-500">
                    {observation.category}
                  </p>

                  <h3 className="text-xl font-bold text-green-400">
                    {observation.issue_name}
                  </h3>

                  <p className="mt-1 text-sm text-gray-400">
                    {field?.field_name || "Unknown field"} ·{" "}
                    {observation.observation_date}
                  </p>

                  {observation.recommendation && (
                    <p className="mt-4 text-sm text-gray-300">
                      {observation.recommendation}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    {observation.status !== "Resolved" && (
                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(observation, "Resolved")
                        }
                        className="rounded-xl bg-green-500 px-4 py-2 font-bold text-black"
                      >
                        Mark Resolved
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        deleteObservation(observation)
                      }
                      className="rounded-xl border border-red-500/30 px-4 py-2 text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Summary({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-black ${className}`}>
        {value}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">
        {label}
      </label>
      <input
        type={type}
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
      >
        {children}
      </select>
    </div>
  );
}
export type NavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

const navigationItems: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", description: "Farm command centre", icon: "⌂" },
  { href: "/assistant", label: "Smart Assistant", description: "Ask questions about your farm data", icon: "AI" },
  { href: "/reports", label: "Reports", description: "Performance and management exports", icon: "▥" },
  { href: "/alerts", label: "Smart Alerts", description: "Daily priorities and risks", icon: "!" },
  { href: "/offline-sync", label: "Offline Sync", description: "Pending offline records", icon: "↻" },
  { href: "/scouting", label: "Scouting", description: "Field observations and photos", icon: "◎" },
  { href: "/farm-map", label: "Farm Map", description: "Field boundaries and map", icon: "◫" },
  { href: "/fields", label: "Fields", description: "Crops, seasons and cultivars", icon: "▦" },
  { href: "/activities", label: "Activities", description: "Field work and history", icon: "✓" },
  { href: "/jobs", label: "Job Cards", description: "Plan and complete work", icon: "☑" },
  { href: "/equipment", label: "Equipment", description: "Machinery and services", icon: "⚙" },
  { href: "/inventory", label: "Inventory", description: "Stock and movements", icon: "▣" },
  { href: "/labour", label: "Labour", description: "Employees and hours", icon: "♟" },
  { href: "/weather", label: "Weather", description: "Forecasts and modelled spray guidance", icon: "☁" },
  { href: "/harvest", label: "Harvest", description: "Tonnes, moisture and yield", icon: "◆" },
  { href: "/financials", label: "Business & Finance", description: "Cash flow, costs and margins", icon: "R" },
  { href: "/grain-marketing", label: "Grain Marketing", description: "Contracts and hedging", icon: "↗" },
  { href: "/reports", label: "Reports", description: "Analytics and alerts", icon: "▥" },
];
