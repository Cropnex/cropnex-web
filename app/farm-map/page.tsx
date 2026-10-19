"use client";

import { GoogleMap, GroundOverlayF, Marker, OverlayViewF, Polygon, useLoadScript } from "@react-google-maps/api";
import type { Libraries } from "@react-google-maps/api";
import { useEffect, useMemo, useState } from "react";
import FieldDrawer from "@/components/map/FieldDrawer";
import MapLegend from "@/components/map/MapLegend";
import { supabase } from "@/lib/supabase";
import type { Activity } from "@/types/activity";
import type { Field, Point } from "@/types/field";
import type { ActivityPlan, ActivityPlanProduct } from "@/types/planning";
import type { InventoryItem } from "@/types/inventory";
import { useSeason } from "@/components/season/SeasonProvider";
type PlanOperation={id:string;plan_id:string;operation_name:string;unit:string;planned_rate_per_ha:number;planned_cost:number;actual_rate_per_ha:number|null;actual_cost:number|null};
type Farmer={id:string;name:string};
type Farm={id:string;name:string;farmer_id:string};
type NdviLayer={id:string;field_id:string|null;field_name:string|null;captured_date:string|null;storage_path:string;file_format:string|null;metadata:{average_ndvi?:number|null;cloud_cover_percent?:number|null}|null};
type RainGauge={id:string;name:string;farm_name:string|null;latitude:number|null;longitude:number|null};

const libraries: Libraries = ["geometry"];
const fallbackCenter = { lat: -26.905, lng: 27.457 };

function cropColor(crop: string | null) {
  const value = crop?.toLowerCase() || "";
  if (value.includes("white maize")) return "#e8eee8";
  if (value.includes("yellow maize") || value.includes("corn")) return "#f3cf3f";
  if (value.includes("maize")) return "#83c341";
  if (value.includes("sunflower")) return "#f28c28";
  if (value.includes("wheat")) return "#d9a441";
  if (value.includes("teff")) return "#b2cf52";
  if (value.includes("soy")) return "#42b99a";
  return "#67a7d8";
}

function cropIcon(crop: string | null) {
  const value = crop?.toLowerCase() || "";
  if (value.includes("maize") || value.includes("corn")) return "🌽";
  if (value.includes("sunflower")) return "🌻";
  if (value.includes("wheat") || value.includes("barley")) return "🌾";
  if (value.includes("soy") || value.includes("bean")) return "🌿";
  if (value.includes("pasture") || value.includes("teff")) return "☘";
  return "◌";
}

export default function FarmMapPage() {
  const {currentSeason,seasons:availableSeasons,refresh:refreshSeasons}=useSeason();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [calculatedAreaHa, setCalculatedAreaHa] = useState<number | null>(null);
  const [fieldActivities, setFieldActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityMode, setActivityMode] = useState<"planned" | "actual">("planned");
  const [activityType, setActivityType] = useState("Spraying");
  const [activityDate, setActivityDate] = useState("");
  const [activityNotes, setActivityNotes] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [query, setQuery] = useState("");
  const [farmFilter, setFarmFilter] = useState("All farms");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [farmPin, setFarmPin] = useState<Point | null>(null);
  const [placingFarmPin, setPlacingFarmPin] = useState(false);
  const [plans, setPlans] = useState<ActivityPlan[]>([]);
  const [planProducts, setPlanProducts] = useState<ActivityPlanProduct[]>([]);
  const [planOperations,setPlanOperations]=useState<PlanOperation[]>([]);
  const [actualisingPlanId, setActualisingPlanId] = useState<string | null>(null);
  const [inventory,setInventory]=useState<InventoryItem[]>([]);
  const [farmers,setFarmers]=useState<Farmer[]>([]);
  const [farms,setFarms]=useState<Farm[]>([]);
  const [showNewField,setShowNewField]=useState(false);
  const [newField,setNewField]=useState({farmer_id:"",farm_id:"",new_farm_name:"",field_name:"",area_mode:"calculated" as "calculated"|"manual",manual_area:""});
  const [savingField,setSavingField]=useState(false);
  const [ndviLayers,setNdviLayers]=useState<NdviLayer[]>([]);
  const [ndviUrls,setNdviUrls]=useState<Record<string,string>>({});
  const [selectedNdviId,setSelectedNdviId]=useState("");
  const [ndviOpacity,setNdviOpacity]=useState(70);
  const [rainGauges,setRainGauges]=useState<RainGauge[]>([]);

  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "", libraries });

  async function loadFields() {
    if(!currentSeason)return;
    const [{ data, error }, planResult, productResult,operationResult,inventoryResult,farmerResult,farmResult,ndviResult] = await Promise.all([
      supabase.from("fields").select("*").eq("season",currentSeason).order("field_name", { ascending: true }),
      supabase.from("activity_plans").select("*").eq("season",currentSeason).order("planned_date"),
      supabase.from("activity_plan_products").select("*").order("created_at"),
      supabase.from("activity_plan_operations").select("*").order("created_at"),
      supabase.from("inventory_items").select("*").eq("status","Active").eq("season",currentSeason).order("name"),
      supabase.from("farmers").select("id,name").eq("active",true).order("name"),
      supabase.from("farms").select("id,name,farmer_id").eq("active",true).order("name"),
      supabase.from("map_layers").select("id,field_id,field_name,captured_date,storage_path,file_format,metadata").eq("layer_type","NDVI").eq("season",currentSeason).in("file_format",["PNG","JPG","JPEG"]).order("captured_date",{ascending:false}),
    ]);
    if (error) return console.error("Could not load fields:", error);
    setFields((data || []) as Field[]);
    setPlans((planResult.data || []) as ActivityPlan[]);
    setPlanProducts((productResult.data || []) as ActivityPlanProduct[]);
    setPlanOperations((operationResult.data||[]) as PlanOperation[]);
    setInventory((inventoryResult.data||[]) as InventoryItem[]);
    const loadedFarmers=(farmerResult.data||[]) as Farmer[];
    const standardFarms=(farmResult.data||[]) as Farm[];
    const legacyFarms=((data||[]) as Field[]).reduce<Farm[]>((rows,field)=>{const name=field.farm_name?.trim();const farmer_id=field.farmer_id||loadedFarmers[0]?.id;if(!name||!farmer_id||standardFarms.some(item=>item.name.toLowerCase()===name.toLowerCase()&&item.farmer_id===farmer_id)||rows.some(item=>item.name.toLowerCase()===name.toLowerCase()&&item.farmer_id===farmer_id))return rows;rows.push({id:`legacy:${farmer_id}:${name}`,name,farmer_id});return rows},[]);
    const loadedFarms=[...standardFarms,...legacyFarms];
    setFarmers(loadedFarmers); setFarms(loadedFarms);
    if(!ndviResult.error){const layers=(ndviResult.data||[]) as NdviLayer[];setNdviLayers(layers);const pairs=await Promise.all(layers.map(async layer=>{const{data:url}=await supabase.storage.from("agcore-layers").createSignedUrl(layer.storage_path,3600);return[layer.id,url?.signedUrl||""] as const;}));setNdviUrls(Object.fromEntries(pairs));}
    setNewField(current=>({
      ...current,
      farmer_id:current.farmer_id||loadedFarmers[0]?.id||"",
      farm_id:current.farm_id||loadedFarms.find(item=>item.farmer_id===(current.farmer_id||loadedFarmers[0]?.id))?.id||"",
    }));
  }

  async function loadFarmPin() {
    const { data } = await supabase.from("farm_settings").select("latitude, longitude").maybeSingle();
    if (data && data.latitude !== null && data.longitude !== null) {
      setFarmPin({ lat: Number(data.latitude), lng: Number(data.longitude) });
    }
  }

  async function loadRainGauges(){
    const{data}=await supabase.from("rain_gauges").select("id,name,farm_name,latitude,longitude").eq("active",true).order("name");
    setRainGauges((data||[]) as RainGauge[]);
  }

  async function loadFieldActivities(fieldName: string) {
    setLoadingActivities(true);
    const { data, error } = await supabase.from("activities").select("id, activity_type, field_name, date, notes, created_at").eq("field_name", fieldName).eq("season",currentSeason).order("date", { ascending: false }).limit(12);
    setFieldActivities(error ? [] : (data || []) as Activity[]);
    setLoadingActivities(false);
  }

  function fitField(field: Field) {
    if (!map || !field.boundary?.length) return;
    const bounds = new google.maps.LatLngBounds();
    field.boundary.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 70);
  }

  function selectField(field: Field, openDetails = true) {
    setSelectedFieldId(field.id);
    setSelectedField(field);
    setShowActivityForm(false);
    setListOpen(false);
    void loadFieldActivities(field.field_name);
    fitField(field);
    if (!openDetails) setSelectedField(null);
  }

  function fitAll() {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    fields.forEach((field) => field.boundary?.forEach((point) => { bounds.extend(point); count += 1; }));
    if (count) map.fitBounds(bounds, 45);
  }

  function calculateAreaHa(boundary: Point[]) {
    if (boundary.length < 3) return 0;
    return google.maps.geometry.spherical.computeArea(boundary.map((point) => new google.maps.LatLng(point.lat, point.lng))) / 10_000;
  }

  function handleMapClick(event: google.maps.MapMouseEvent) {
    if (placingFarmPin && event.latLng) {
      void saveFarmPin({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      return;
    }
    if (!drawing || !event.latLng) return;
    const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
    setPoints((current) => { const next = [...current, point]; setCalculatedAreaHa(next.length >= 3 ? calculateAreaHa(next) : null); return next; });
  }

  async function saveFarmPin(pin: Point) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return alert("Sign in before saving the main farm pin.");
    const { error } = await supabase.from("farm_settings").upsert({ user_id: data.session.user.id, latitude: pin.lat, longitude: pin.lng, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return alert(error.message);
    setFarmPin(pin); setPlacingFarmPin(false); map?.panTo(pin); map?.setZoom(14); alert("Main farm pin saved.");
  }

  async function saveBoundary() {
    if (!selectedFieldId) return alert("Select a field first.");
    if (points.length < 3) return alert("Tap at least three points to create a boundary.");
    const area = calculateAreaHa(points);
    const { error } = await supabase.from("fields").update({ boundary: points, area_ha: Number(area.toFixed(2)) }).eq("id", selectedFieldId);
    if (error) return alert(error.message);
    setDrawing(false); setPoints([]); setCalculatedAreaHa(null); await loadFields(); alert("Boundary saved.");
  }

  function beginNewField(){
    if(!farmers.length||!farms.length){alert("Add a farmer and farm in Standards first.");return;}
    setSelectedField(null); setSelectedFieldId(""); setPoints([]); setCalculatedAreaHa(null); setShowNewField(true); setDrawing(false);
  }

  async function saveNewField(){
    const farmer=farmers.find(item=>item.id===newField.farmer_id);
    let farm=farms.find(item=>item.id===newField.farm_id);
    const requestedFarmName=newField.farm_id==="__new__"?newField.new_farm_name.trim():farm?.name;
    if(!farmer||!requestedFarmName||!newField.field_name.trim())return alert("Select the farmer and farm, then enter the field name.");
    if(points.length<3)return alert("Select Start drawing, then place at least three boundary points on the map.");
    if(newField.area_mode==="manual"&&Number(newField.manual_area)<=0)return alert("Enter a valid official hectare value.");
    setSavingField(true);
    try{
      const {data}=await supabase.auth.getSession(); const userId=data.session?.user.id;
      if(!userId)return alert("You must be logged in.");
      const calculatedArea=calculateAreaHa(points);
      const area=newField.area_mode==="manual"?Number(newField.manual_area):calculatedArea;
      if(newField.farm_id==="__new__"||newField.farm_id.startsWith("legacy:")){
        const {data:existing}=await supabase.from("farms").select("id,name,farmer_id").eq("farmer_id",farmer.id).ilike("name",requestedFarmName).maybeSingle();
        if(existing)farm=existing as Farm;else{const{data:createdFarm,error:farmError}=await supabase.from("farms").insert({user_id:userId,farmer_id:farmer.id,name:requestedFarmName,active:true}).select("id,name,farmer_id").single();if(farmError)return alert(farmError.message);farm=createdFarm as Farm}
      }
      if(!farm)return alert("The farm could not be created.");
      const {data:created,error}=await supabase.from("fields").insert({
        user_id:userId,farmer_id:farmer.id,farm_id:farm.id,field_name:newField.field_name.trim(),farm_name:farm.name,
        area_ha:Number(area.toFixed(2)),boundary:points,status:"Unplanned",season:currentSeason,crop:null,cultivar:null,cultivar_id:null,
      }).select("*").single();
      if(error)return alert(error.message);
      setShowNewField(false);setDrawing(false);setPoints([]);setCalculatedAreaHa(null);setNewField(value=>({...value,field_name:"",new_farm_name:"",manual_area:"",area_mode:"calculated"}));
      await loadFields(); if(created)selectField(created as Field); alert(`${newField.field_name.trim()} created · ${area.toFixed(2)} ha${newField.area_mode==="manual"?` (drawn area ${calculatedArea.toFixed(2)} ha)`:""}.`);
    }finally{setSavingField(false)}
  }

  async function saveFieldActivity() {
    if (!selectedField || !activityDate) return alert("Choose an activity date.");
    setSavingActivity(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return alert("You must be logged in.");
      const statusLabel = activityMode === "planned" ? "Planned" : "Actual";
      const { error } = await supabase.from("activities").insert({ user_id: data.session.user.id, activity_type: activityType, field_name: selectedField.field_name, crop: selectedField.crop, season:currentSeason, date: activityDate, area_ha: selectedField.area_ha, notes: `${statusLabel}${activityNotes.trim() ? ` · ${activityNotes.trim()}` : ""}` });
      if (error) return alert(error.message);
      await loadFieldActivities(selectedField.field_name);
      setShowActivityForm(false); setActivityNotes(""); alert(`${statusLabel} activity saved.`);
    } finally { setSavingActivity(false); }
  }

  async function actualisePlan(plan: ActivityPlan,actualDate:string,lines:{id:string;inventory_item_id:string;rate:number}[]) {
    if (!actualDate||lines.some(x=>!x.inventory_item_id||x.rate<0)) return alert("Confirm the date, products and rates.");
    if (!window.confirm(`Post ${plan.activity_type} as actual for ${actualDate}? Shed quantities will be deducted.`)) return;
    setActualisingPlanId(plan.id);
    try {
      const { error } = await supabase.rpc("actualise_activity_plan_v2", { p_plan_id: plan.id, p_actual_date: actualDate, p_lines: lines, p_actual_notes: "Confirmed from Farm Map" });
      if (error) return alert(error.message);
      await loadFields(); await loadFieldActivities(plan.field_name); alert("Activity actualised. Stock and actual costs were updated.");
    } finally { setActualisingPlanId(null); }
  }

  useEffect(() => {if(!currentSeason)return;setSeasonFilter(currentSeason);void loadFields(); void loadFarmPin(); void loadRainGauges();}, [currentSeason]);
  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(google.maps.MapTypeId.SATELLITE);
    if (farmPin) { map.panTo(farmPin); map.setZoom(14); return; }
    if (fields.some((field) => field.boundary?.length)) fitAll();
  }, [map, farmPin, fields]);

  const farmFilters = useMemo(() => ["All farms", ...Array.from(new Set(fields.map((field) => field.farm_name).filter(Boolean) as string[]))], [fields]);
  const seasons = useMemo(() => availableSeasons, [availableSeasons]);
  const filteredFields = useMemo(() => fields.filter((field) => {
    const matchesQuery = `${field.field_name} ${field.crop || ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (farmFilter === "All farms" || field.farm_name === farmFilter) && field.season === seasonFilter;
  }), [fields, query, farmFilter, seasonFilter]);
  const filteredArea = filteredFields.reduce((sum, field) => sum + Number(field.area_ha || 0), 0);
  const selectedNdvi=ndviLayers.find(layer=>layer.id===selectedNdviId)||null;
  const selectedNdviField=selectedNdvi?.field_id?fields.find(field=>field.id===selectedNdvi.field_id)||null:null;
  const selectedNdviBounds=useMemo(()=>{const boundary=selectedNdviField?.boundary;if(!boundary?.length)return null;return{north:Math.max(...boundary.map(point=>point.lat)),south:Math.min(...boundary.map(point=>point.lat)),east:Math.max(...boundary.map(point=>point.lng)),west:Math.min(...boundary.map(point=>point.lng))};},[selectedNdviField]);

  function chooseNdvi(id:string){setSelectedNdviId(id);if(!id)return;const layer=ndviLayers.find(item=>item.id===id),field=fields.find(item=>item.id===layer?.field_id);if(field){setSelectedFieldId(field.id);fitField(field);}}

  async function createSeason(){
    const name=prompt("New season name, for example 2027/2028");if(!name?.trim())return;
    const source=seasonFilter||currentSeason;
    const copy=source?confirm(`Use ${source}'s field boundaries?\n\nOK = copy the previous fields without crop plans.\nCancel = start this season with no fields.`):false;
    const{data,error}=await supabase.rpc("create_farm_season",{p_name:name.trim(),p_source_season:copy?source:null,p_copy_fields:copy});if(error)return alert(error.message);
    await refreshSeasons();const result=data as {fields_copied?:number};alert(`Season ${name.trim()} created. ${result?.fields_copied||0} field boundaries copied. Crop and activity templates remain available, but no plans, prices, stock or harvest data were copied.`);
  }

  if (loadError) return <main className="p-8 text-white">Google Maps could not load. Check the browser API key and its allowed domains.</main>;
  if (!isLoaded) return <main className="p-8 text-white">Opening your farm workspace…</main>;

  return (
    <main className="ag-map-workspace relative h-[calc(100dvh-5rem)] min-h-[620px] overflow-hidden bg-[#07110d] text-white">
      <GoogleMap
        center={fallbackCenter}
        zoom={13}
        onLoad={(loadedMap) => { loadedMap.setMapTypeId(google.maps.MapTypeId.SATELLITE); setMap(loadedMap); }}
        onClick={handleMapClick}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        mapTypeId="satellite"
        options={{ mapTypeId: google.maps.MapTypeId.SATELLITE, fullscreenControl: true, streetViewControl: false, mapTypeControl: true, zoomControl: true, clickableIcons: false, gestureHandling: "greedy", mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT } }}
      >
        {selectedNdvi&&selectedNdviBounds&&ndviUrls[selectedNdvi.id]&&<GroundOverlayF key={selectedNdvi.id} url={ndviUrls[selectedNdvi.id]} bounds={selectedNdviBounds} options={{opacity:ndviOpacity/100}}/>}
        {farmPin && <Marker position={farmPin} title="Main farm" label={{ text: "F", color: "#07130e", fontWeight: "800" }} />}
        {rainGauges.filter(g=>g.latitude!==null&&g.longitude!==null).map(g=><Marker key={`rain-${g.id}`} position={{lat:Number(g.latitude),lng:Number(g.longitude)}} title={`Rain gauge · ${g.name}`} label={{text:"R",color:"#07130e",fontWeight:"900"}} icon={{path:google.maps.SymbolPath.CIRCLE,fillColor:"#52b9e9",fillOpacity:1,strokeColor:"#ffffff",strokeWeight:2,scale:13}}/>)}
        {filteredFields.map((field) => field.boundary && field.boundary.length >= 3 && <Polygon key={field.id} paths={field.boundary} onClick={() => selectField(field)} options={{ fillColor: cropColor(field.crop), fillOpacity: selectedFieldId === field.id ? 0.58 : 0.34, strokeColor: selectedFieldId === field.id ? "#ffffff" : cropColor(field.crop), strokeWeight: selectedFieldId === field.id ? 4 : 2, clickable: true, zIndex: selectedFieldId === field.id ? 3 : 1 }} />)}
        {filteredFields.map((field) => {
          if (!field.boundary?.length) return null;
          const position = field.boundary.reduce((value, point) => ({ lat: value.lat + point.lat / field.boundary!.length, lng: value.lng + point.lng / field.boundary!.length }), { lat: 0, lng: 0 });
          return <OverlayViewF key={`label-${field.id}`} position={position} mapPaneName="overlayMouseTarget"><button type="button" onClick={() => selectField(field)} className="ag-crop-marker"><span className="ag-crop-marker__icon" aria-hidden="true">{cropIcon(field.crop)}</span><span className="text-left"><span className="block text-[10px] font-black text-white">{field.field_name}</span><span className="block text-[9px] text-[#dfc796]">{field.cultivar || field.crop || "Unplanned"}</span></span></button></OverlayViewF>;
        })}
        {points.map((point, index) => <Marker key={`${point.lat}-${point.lng}-${index}`} position={point} label={(index + 1).toString()} />)}
        {points.length >= 3 && <Polygon paths={points} options={{ fillColor: "#a4df57", fillOpacity: 0.32, strokeColor: "#ffffff", strokeWeight: 3, clickable: false }} />}
      </GoogleMap>

      <section className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2 lg:left-[336px] lg:right-4">
        <button type="button" onClick={() => setListOpen(true)} className="rounded-xl border border-white/15 bg-[#07130e]/95 px-4 py-3 text-sm font-bold shadow-xl backdrop-blur lg:hidden">☰ Fields</button>
        <div className="flex flex-1 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#07130e]/92 p-2 shadow-2xl backdrop-blur-xl">
          <div className="hidden px-2 sm:block"><p className="ag-kicker">Map workspace</p><p className="font-display text-sm font-bold">{filteredFields.length} fields · {filteredArea.toFixed(1)} ha</p></div>
          <div className="hidden h-8 w-px bg-white/10 sm:block" />
          <button type="button" onClick={fitAll} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Fit all</button>
          <button type="button" onClick={() => setPlacingFarmPin((value) => !value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${placingFarmPin ? "bg-amber-400 text-black" : "bg-white/[0.06]"}`}>{placingFarmPin ? "Tap farm location" : farmPin ? "Move farm pin" : "Set farm pin"}</button>
          <button type="button" onClick={beginNewField} className="rounded-lg bg-[#83c341] px-3 py-2 text-xs font-bold text-[#07130e]">+ Create new field</button>
          <button type="button" onClick={createSeason} className="rounded-lg border border-[#83c341]/35 bg-[#83c341]/10 px-3 py-2 text-xs font-bold text-[#b8e77d]">+ New season</button>
          {selectedFieldId&&<button type="button" onClick={() => { setShowNewField(false);setDrawing((value) => !value); setPoints([]); setCalculatedAreaHa(null); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${drawing ? "bg-amber-400 text-black" : "bg-white/[0.06]"}`}>{drawing ? "Cancel boundary edit" : "Redraw boundary"}</button>}
          {drawing&&!showNewField && <><button type="button" onClick={saveBoundary} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black">Save boundary</button><button type="button" onClick={() => { setPoints([]); setCalculatedAreaHa(null); }} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Clear</button></>}
        </div>
      </section>

      <aside className={`${listOpen ? "translate-x-0" : "-translate-x-[110%]"} absolute bottom-3 left-3 top-3 z-20 flex w-[calc(100%-1.5rem)] max-w-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#07130e]/95 shadow-2xl backdrop-blur-xl transition-transform lg:translate-x-0`}>
        <div className="border-b border-white/[0.07] p-4"><div className="flex items-center justify-between"><div><p className="ag-kicker">Farm map</p><h1 className="mt-1 text-xl font-extrabold">Fields</h1></div><button type="button" onClick={() => setListOpen(false)} className="rounded-lg p-2 text-gray-400 lg:hidden">✕</button></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fields or crops…" className="mt-4 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[#83c341]/50" /><div className="mt-2 grid grid-cols-2 gap-2"><select value={farmFilter} onChange={(event) => setFarmFilter(event.target.value)} className="min-w-0 rounded-lg border border-white/[0.08] bg-[#0b1a13] px-2 py-2 text-xs">{farmFilters.map((farm) => <option key={farm}>{farm}</option>)}</select><select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)} className="min-w-0 rounded-lg border border-white/[0.08] bg-[#0b1a13] px-2 py-2 text-xs">{seasons.map((season) => <option key={season}>{season}</option>)}</select></div></div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">{filteredFields.map((field) => <button key={field.id} type="button" onClick={() => selectField(field)} className={`w-full rounded-xl border p-3 text-left transition ${selectedFieldId === field.id ? "border-[#83c341]/45 bg-[#83c341]/10" : "border-transparent hover:bg-white/[0.045]"}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cropColor(field.crop) }} /><div className="min-w-0"><p className="truncate text-sm font-bold">{field.field_name}</p><p className="mt-1 truncate text-xs text-[#77887e]">{field.crop || "Crop unassigned"} · {field.season || "No season"}</p></div></div><span className="shrink-0 text-xs font-bold text-[#a4df57]">{Number(field.area_ha).toFixed(1)} ha</span></div></button>)}{filteredFields.length === 0 && <p className="p-6 text-center text-sm text-[#77887e]">No fields match these filters.</p>}</div>
        <MapLegend />
      </aside>

      {calculatedAreaHa !== null && <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-[#83c341]/30 bg-[#07130e]/95 px-5 py-3 text-center shadow-xl"><p className="text-[10px] uppercase tracking-widest text-[#77887e]">Measured area</p><p className="font-display text-xl font-black text-[#a4df57]">{calculatedAreaHa.toFixed(2)} ha</p></div>}

      {showNewField&&<section className="absolute right-3 top-20 z-30 max-h-[calc(100%-6rem)] w-[calc(100%-1.5rem)] max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#07130e]/95 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between"><div><p className="ag-kicker">Map field creator</p><h2 className="mt-1 text-xl font-extrabold">Create new field</h2></div><button type="button" onClick={()=>{setShowNewField(false);setDrawing(false);setPoints([]);setCalculatedAreaHa(null)}} className="rounded-lg p-2 text-gray-400">✕</button></div>
        <label className="field-label">Farmer<select className="field-input" value={newField.farmer_id} onChange={event=>{const farmer_id=event.target.value;setNewField(value=>({...value,farmer_id,farm_id:farms.find(item=>item.farmer_id===farmer_id)?.id||"",new_farm_name:""}))}}><option value="">Select farmer</option>{farmers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field-label">Existing farm or new farm<select className="field-input" value={newField.farm_id} onChange={event=>setNewField(value=>({...value,farm_id:event.target.value,new_farm_name:event.target.value==="__new__"?value.new_farm_name:""}))}><option value="">Select farm</option>{farms.filter(item=>item.farmer_id===newField.farmer_id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new__">+ Create new farm</option></select></label>
        {newField.farm_id==="__new__"&&<label className="field-label">New farm name<input className="field-input" value={newField.new_farm_name} onChange={event=>setNewField(value=>({...value,new_farm_name:event.target.value}))} placeholder="Preston"/></label>}
        <label className="field-label">Field name<input className="field-input" value={newField.field_name} onChange={event=>setNewField(value=>({...value,field_name:event.target.value}))} placeholder="WO1" /></label>
        <div className="mt-4 rounded-xl bg-white/[0.04] p-3 text-sm"><div className="flex justify-between"><span className="text-[#8d9d94]">Boundary points</span><strong>{points.length}</strong></div><div className="mt-1 flex justify-between"><span className="text-[#8d9d94]">Map-calculated area</span><strong className="text-[#a4df57]">{calculatedAreaHa?.toFixed(2)||"0.00"} ha</strong></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setNewField(value=>({...value,area_mode:"calculated"}))} className={`rounded-xl border px-3 py-2 text-xs font-bold ${newField.area_mode==="calculated"?"border-[#83c341]/40 bg-[#83c341]/15 text-[#a4df57]":"border-white/10"}`}>Use map hectares</button><button type="button" onClick={()=>setNewField(value=>({...value,area_mode:"manual"}))} className={`rounded-xl border px-3 py-2 text-xs font-bold ${newField.area_mode==="manual"?"border-[#83c341]/40 bg-[#83c341]/15 text-[#a4df57]":"border-white/10"}`}>Use own hectares</button></div>
        {newField.area_mode==="manual"&&<label className="field-label">Official hectares<input className="field-input" type="number" min="0.01" step="0.01" value={newField.manual_area} onChange={event=>setNewField(value=>({...value,manual_area:event.target.value}))} placeholder="61.26"/></label>}
        <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>{setDrawing(true);setPoints([]);setCalculatedAreaHa(null)}} className="rounded-xl border border-[#83c341]/30 bg-[#83c341]/10 px-3 py-3 text-sm font-bold text-[#a4df57]">{drawing?"Drawing active":"Start drawing"}</button><button type="button" onClick={()=>{setPoints([]);setCalculatedAreaHa(null)}} className="rounded-xl border border-white/10 px-3 py-3 text-sm font-bold">Clear</button></div>
        <p className="mt-3 text-xs leading-5 text-[#77887e]">Tap around the field boundary. Keep the measured hectares or enter the official registered area.</p><button type="button" disabled={savingField||points.length<3} onClick={saveNewField} className="mt-4 w-full rounded-xl bg-[#83c341] py-3.5 font-extrabold text-[#07130e] disabled:opacity-40">{savingField?"Creating…":"Create field"}</button>
      </section>}

      {selectedField && <FieldDrawer field={selectedField} activities={fieldActivities} loadingActivities={loadingActivities} showActivityForm={showActivityForm} activityMode={activityMode} activityType={activityType} activityDate={activityDate} activityNotes={activityNotes} savingActivity={savingActivity} plans={plans.filter((plan) => plan.field_id === selectedField.id)} planProducts={planProducts} planOperations={planOperations} actualisingPlanId={actualisingPlanId} inventory={inventory} ndviLayers={ndviLayers} ndviUrls={ndviUrls} selectedNdviId={selectedNdviId} ndviOpacity={ndviOpacity} onSelectNdvi={chooseNdvi} onNdviOpacityChange={setNdviOpacity} onClose={() => { setSelectedField(null); setShowActivityForm(false); }} onShowActivityForm={(mode) => { setActivityMode(mode); setShowActivityForm(true); }} onCancelActivityForm={() => setShowActivityForm(false)} onActivityModeChange={setActivityMode} onActivityTypeChange={setActivityType} onActivityDateChange={setActivityDate} onActivityNotesChange={setActivityNotes} onSaveActivity={saveFieldActivity} onActualisePlan={actualisePlan} />}
    </main>
  );
}
