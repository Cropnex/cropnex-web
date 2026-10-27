"use client";

import { GoogleMap, GroundOverlayF, Marker, OverlayViewF, Polygon, Polyline, useLoadScript } from "@react-google-maps/api";
import Link from "next/link";
import type { Libraries } from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import FieldDrawer from "@/components/map/FieldDrawer";
import MapLegend from "@/components/map/MapLegend";
import { supabase } from "@/lib/supabase";
import type { Activity } from "@/types/activity";
import type { Field, Point } from "@/types/field";
import type { ActivityPlan, ActivityPlanProduct } from "@/types/planning";
import type { InventoryItem } from "@/types/inventory";
import { useSeason } from "@/components/season/SeasonProvider";
import { categoryColor } from "@/lib/geojson-layer";
import { boundaryGeoJson, boundaryHasShape, boundaryPoints, boundaryPolygonPaths } from "@/lib/field-boundary";
import { splitFieldBoundary } from "@/lib/split-field-boundary";
type PlanOperation={id:string;plan_id:string;operation_name:string;unit:string;planned_rate_per_ha:number;planned_cost:number;actual_rate_per_ha:number|null;actual_cost:number|null};
type InventoryLocation={id:string;name:string};
type ProductOption={id:string;name:string;category:string;pack_unit:string|null};
type StandardOperationOption={id:string;name:string;unit:string;unit_cost:number};
type Farmer={id:string;name:string};
type Farm={id:string;name:string;farmer_id:string};
type NdviLayer={id:string;field_id:string|null;field_name:string|null;captured_date:string|null;storage_path:string;file_format:string|null;metadata:{average_ndvi?:number|null;cloud_cover_percent?:number|null}|null};
type ThematicLayer={id:string;file_name:string;layer_type:string;storage_path:string;metadata:{display_attribute?:string;feature_count?:number;category_counts?:Record<string,number>}|null;geojson?:{features:Array<{geometry:{type:string;coordinates:unknown};properties?:Record<string,unknown>}>}};
type RainGauge={id:string;name:string;farm_name:string|null;latitude:number|null;longitude:number|null};
type GeoJsonReadResponse={ok:true;geojson:NonNullable<ThematicLayer["geojson"]>}|{ok:false;error:string};

const libraries: Libraries = ["geometry"];
const fallbackCenter = { lat: -26.905, lng: 27.457 };

function cropColor(crop: string | null) {
  const value = crop?.toLowerCase() || "";
  if (value.includes("white maize")) return "#e8eee8";
  if (value.includes("yellow maize") || value.includes("corn")) return "#f3cf3f";
  if (value.includes("maize")) return "#789B58";
  if (value.includes("sunflower")) return "#f28c28";
  if (value.includes("wheat")) return "#d9a441";
  if (value.includes("teff")) return "#b2cf52";
  if (value.includes("soy")) return "#42b99a";
  return "#67a7d8";
}


export default function FarmMapPage() {
  const {currentSeason,seasons:availableSeasons,refresh:refreshSeasons}=useSeason();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [splitPoints, setSplitPoints] = useState<Point[]>([]);
  const [splitNames, setSplitNames] = useState({ first: "", second: "" });
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
  const [inventoryLocations,setInventoryLocations]=useState<InventoryLocation[]>([]);
  const [catalogueProducts,setCatalogueProducts]=useState<ProductOption[]>([]);
  const [standardOperations,setStandardOperations]=useState<StandardOperationOption[]>([]);
  const [farmers,setFarmers]=useState<Farmer[]>([]);
  const [farms,setFarms]=useState<Farm[]>([]);
  const [showNewField,setShowNewField]=useState(false);
  const [newField,setNewField]=useState({farmer_id:"",farm_id:"",new_farm_name:"",field_name:"",area_mode:"calculated" as "calculated"|"manual",manual_area:""});
  const [savingField,setSavingField]=useState(false);
  const [ndviLayers,setNdviLayers]=useState<NdviLayer[]>([]);
  const [ndviUrls,setNdviUrls]=useState<Record<string,string>>({});
  const [selectedNdviId,setSelectedNdviId]=useState("");
  const [ndviOpacity,setNdviOpacity]=useState(70);
  const [thematicLayers,setThematicLayers]=useState<ThematicLayer[]>([]);
  const [visibleThematicIds,setVisibleThematicIds]=useState<string[]>([]);
  const [loadingThematicIds,setLoadingThematicIds]=useState<string[]>([]);
  const [rainGauges,setRainGauges]=useState<RainGauge[]>([]);

  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "", libraries });

  async function loadFields() {
    if(!currentSeason)return;
    const [{ data, error }, planResult, productResult,operationResult,inventoryResult,locationResult,catalogueResult,standardOperationResult,farmerResult,farmResult,ndviResult,thematicResult] = await Promise.all([
      supabase.from("fields").select("*").eq("season",currentSeason).order("field_name", { ascending: true }),
      supabase.from("activity_plans").select("*").eq("season",currentSeason).order("planned_date"),
      supabase.from("activity_plan_products").select("*").order("created_at"),
      supabase.from("activity_plan_operations").select("*").order("created_at"),
      supabase.from("inventory_items").select("*").eq("status","Active").eq("season",currentSeason).order("name"),
      supabase.from("inventory_locations").select("id,name").eq("active",true).order("name"),
      supabase.from("master_products").select("id,name,category,pack_unit").eq("status","Approved").order("name"),
      supabase.from("standard_operations").select("id,name,unit,unit_cost").eq("active",true).order("name"),
      supabase.from("farmers").select("id,name").eq("active",true).order("name"),
      supabase.from("farms").select("id,name,farmer_id").eq("active",true).order("name"),
      supabase.from("map_layers").select("id,field_id,field_name,captured_date,storage_path,file_format,metadata").eq("layer_type","NDVI").eq("season",currentSeason).in("file_format",["PNG","JPG","JPEG"]).order("captured_date",{ascending:false}),
      supabase.from("map_layers").select("id,file_name,layer_type,storage_path,metadata").eq("season",currentSeason).order("created_at",{ascending:false}),
    ]);
    if (error) return console.error("Could not load fields:", error);
    setFields((data || []) as Field[]);
    setPlans((planResult.data || []) as ActivityPlan[]);
    setPlanProducts((productResult.data || []) as ActivityPlanProduct[]);
    setPlanOperations((operationResult.data||[]) as PlanOperation[]);
    setInventory((inventoryResult.data||[]) as InventoryItem[]);
    setInventoryLocations((locationResult.data||[]) as InventoryLocation[]);
    setCatalogueProducts((catalogueResult.data||[]) as ProductOption[]);
    setStandardOperations((standardOperationResult.data||[]) as StandardOperationOption[]);
    const loadedFarmers=(farmerResult.data||[]) as Farmer[];
    const standardFarms=(farmResult.data||[]) as Farm[];
    const legacyFarms=((data||[]) as Field[]).reduce<Farm[]>((rows,field)=>{const name=field.farm_name?.trim();const farmer_id=field.farmer_id||loadedFarmers[0]?.id;if(!name||!farmer_id||standardFarms.some(item=>item.name.toLowerCase()===name.toLowerCase()&&item.farmer_id===farmer_id)||rows.some(item=>item.name.toLowerCase()===name.toLowerCase()&&item.farmer_id===farmer_id))return rows;rows.push({id:`legacy:${farmer_id}:${name}`,name,farmer_id});return rows},[]);
    const loadedFarms=[...standardFarms,...legacyFarms];
    setFarmers(loadedFarmers); setFarms(loadedFarms);
    if(!ndviResult.error){const layers=(ndviResult.data||[]) as NdviLayer[];setNdviLayers(layers);const pairs=await Promise.all(layers.map(async layer=>{const{data:url}=await supabase.storage.from("cropnex-layers").createSignedUrl(layer.storage_path,3600);return[layer.id,url?.signedUrl||""] as const;}));setNdviUrls(Object.fromEntries(pairs));}
    if(!thematicResult.error){
      const rows=(thematicResult.data||[]).filter((row)=>((row.metadata as Record<string,unknown>|null)?.import_mode)==="thematic_map");
      setThematicLayers(rows.map(row=>({id:row.id,file_name:row.file_name,layer_type:row.layer_type,storage_path:row.storage_path,metadata:row.metadata as ThematicLayer["metadata"]})));
    }
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
    if (!map || !boundaryHasShape(field.boundary)) return;
    const bounds = new google.maps.LatLngBounds();
    boundaryPoints(field.boundary).forEach((point) => bounds.extend(point));
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

  const fitAll = useCallback(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    fields.forEach((field) => boundaryPoints(field.boundary).forEach((point) => { bounds.extend(point); count += 1; }));
    if (count) map.fitBounds(bounds, 45);
  }, [map, fields]);

  function calculateAreaHa(boundary: Point[]) {
    if (boundary.length < 3) return 0;
    return google.maps.geometry.spherical.computeArea(boundary.map((point) => new google.maps.LatLng(point.lat, point.lng))) / 10_000;
  }

  function handleMapClick(event: google.maps.MapMouseEvent) {
    if (placingFarmPin && event.latLng) {
      void saveFarmPin({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      return;
    }
    if (!event.latLng) return;
    const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
    if (splitting) { setSplitPoints((current) => current.length < 2 ? [...current, point] : current); return; }
    if (!drawing) return;
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
    const { data: updated, error } = await supabase.from("fields").update({ boundary: points, area_ha: Number(area.toFixed(2)) }).eq("id", selectedFieldId).select("*").single();
    if (error) return alert(error.message);
    setDrawing(false); setPoints([]); setCalculatedAreaHa(null); if(updated)setSelectedField(updated as Field); await loadFields(); alert("Boundary saved. The field area now matches the measured outline.");
  }

  function beginBoundaryEdit() {
    setShowNewField(false); setSplitting(false); setSplitPoints([]); setPlacingFarmPin(false); setPoints([]); setCalculatedAreaHa(null); setDrawing(true);
  }

  async function saveSelectedFieldDetails(fieldName: string, areaHa: number) {
    if (!selectedField) return;
    const name = fieldName.trim();
    if (!name || !Number.isFinite(areaHa) || areaHa <= 0) throw new Error("Enter a field name and a positive hectare value.");
    const { data, error } = await supabase.from("fields").update({ field_name: name, area_ha: Number(areaHa.toFixed(2)) }).eq("id", selectedField.id).select("*").single();
    if (error) throw error;
    const updated = data as Field;
    setSelectedField(updated);
    await loadFields();
  }

  function beginSplit() {
    if (!selectedField) return;
    setDrawing(false); setPlacingFarmPin(false); setPoints([]); setCalculatedAreaHa(null); setSplitPoints([]); setSplitting(true);
    setSplitNames({ first: `${selectedField.field_name} A`, second: `${selectedField.field_name} B` });
  }

  function cancelSplit() { setSplitting(false); setSplitPoints([]); }

  async function confirmSplit() {
    if (!selectedField || splitPoints.length !== 2) return alert("Tap two points across the field to draw the split line.");
    const firstName = splitNames.first.trim(); const secondName = splitNames.second.trim();
    if (!firstName || !secondName || firstName.toLowerCase() === secondName.toLowerCase()) return alert("Enter two different field names.");
    if (fields.some((field) => field.id !== selectedField.id && [firstName, secondName].some((name) => name.toLowerCase() === field.field_name.trim().toLowerCase()))) return alert("Those names are already used by another field in this season. Choose two unique names.");
    setSavingField(true);
    let createdId = "";
    try {
      const [firstPart, secondPart] = splitFieldBoundary(selectedField.boundary, splitPoints[0], splitPoints[1]);
      const firstArea = Number(calculateAreaHa(firstPart).toFixed(2));
      const secondArea = Number(calculateAreaHa(secondPart).toFixed(2));
      if (firstArea <= 0 || secondArea <= 0) throw new Error("The split did not create two positive field areas.");
      const { data: auth } = await supabase.auth.getSession();
      const ownerId = selectedField.user_id || auth.session?.user.id;
      if (!ownerId) throw new Error("Your sign-in session has expired. Sign in again before splitting the field.");
      const common = { user_id: ownerId, farmer_id: selectedField.farmer_id || null, farm_id: selectedField.farm_id || null, farm_name: selectedField.farm_name, crop: selectedField.crop, season: selectedField.season, planting_date: selectedField.planting_date, cultivar: selectedField.cultivar, cultivar_id: selectedField.cultivar_id || null, soil_type: selectedField.soil_type, expected_yield: selectedField.expected_yield, status: selectedField.status || "Unplanned", notes: selectedField.notes };
      const { data: created, error: insertError } = await supabase.from("fields").insert({ ...common, field_name: secondName, area_ha: secondArea, boundary: boundaryGeoJson(secondPart) }).select("id").single();
      if (insertError) throw insertError;
      createdId = created.id as string;
      const { data: updated, error: updateError } = await supabase.from("fields").update({ field_name: firstName, area_ha: firstArea, boundary: boundaryGeoJson(firstPart) }).eq("id", selectedField.id).select("*").single();
      if (updateError) {
        await supabase.from("fields").delete().eq("id", createdId);
        createdId = "";
        throw updateError;
      }
      setSplitting(false); setSplitPoints([]); await loadFields(); selectField(updated as Field);
      alert(`Field split into ${firstName} (${firstArea.toFixed(2)} ha) and ${secondName} (${secondArea.toFixed(2)} ha). Existing plans remain with ${firstName}.`);
    } catch (error) {
      if (createdId) await supabase.from("fields").delete().eq("id", createdId);
      alert(error instanceof Error ? error.message : "The field could not be split.");
    } finally { setSavingField(false); }
  }

  function beginNewField(){
    setSelectedField(null); setSelectedFieldId(""); setPoints([]); setCalculatedAreaHa(null); setShowNewField(true); setDrawing(false); setSplitting(false); setSplitPoints([]); setPlacingFarmPin(false);
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

  async function actualisePlan(plan: ActivityPlan,startDate:string,endDate:string,entries:{plan_id:string;products:{id:string|null;master_product_id:string;product_name:string;unit:string;unit_price:number;inventory_item_id:string|null;location_id:string|null;rate:number}[];operations:{id:string|null;operation_id:string;operation_name:string;unit:string;unit_price:number;rate:number}[]}[]) {
    if (!startDate||!endDate||endDate<startDate||!entries.length||entries.some(entry=>entry.products.some(x=>(!x.inventory_item_id&&!x.location_id)||x.rate<0)||entry.operations.some(x=>x.rate<0))) return alert("Confirm the date range, source sheds and actual rates.");
    setActualisingPlanId(plan.id);
    try {
      const { error } = await supabase.rpc("actualise_activity_group_v1", { p_actual_start_date:startDate,p_actual_end_date:endDate,p_plans:entries,p_actual_notes:`Confirmed from Farm Map · ${entries.length} fields` });
      if (error) return alert(error.message);
      await loadFields(); await loadFieldActivities(plan.field_name); alert(`Activity actualised on ${entries.length} field${entries.length===1?"":"s"}. Shed usage and costs were allocated to each field. Check Inventory alerts for negative balances.`);
    } finally { setActualisingPlanId(null); }
  }

  // These loaders update state only after their Supabase requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {if(!currentSeason)return;void loadFields(); void loadFarmPin(); void loadRainGauges();}, [currentSeason]);
  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(google.maps.MapTypeId.SATELLITE);
    if (farmPin) { map.panTo(farmPin); map.setZoom(14); return; }
    if (fields.some((field) => boundaryHasShape(field.boundary))) fitAll();
  }, [map, farmPin, fields, fitAll]);

  const farmFilters = useMemo(() => ["All farms", ...Array.from(new Set(fields.map((field) => field.farm_name).filter(Boolean) as string[]))], [fields]);
  const seasons = useMemo(() => availableSeasons, [availableSeasons]);
  const filteredFields = useMemo(() => fields.filter((field) => {
    const matchesQuery = `${field.field_name} ${field.crop || ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (farmFilter === "All farms" || field.farm_name === farmFilter) && field.season === (seasonFilter||currentSeason);
  }), [fields, query, farmFilter, seasonFilter,currentSeason]);
  const filteredArea = filteredFields.reduce((sum, field) => sum + Number(field.area_ha || 0), 0);
  const visibleThematicLayers=useMemo(()=>thematicLayers.filter(layer=>visibleThematicIds.includes(layer.id)&&layer.geojson),[thematicLayers,visibleThematicIds]);
  const selectedNdvi=ndviLayers.find(layer=>layer.id===selectedNdviId)||null;
  const layerOverlayVisible=Boolean(selectedNdvi||visibleThematicLayers.length);
  const selectedNdviField=selectedNdvi?.field_id?fields.find(field=>field.id===selectedNdvi.field_id)||null:null;
  const selectedNdviBounds=useMemo(()=>{const boundary=boundaryPoints(selectedNdviField?.boundary);if(!boundary.length)return null;return{north:Math.max(...boundary.map(point=>point.lat)),south:Math.min(...boundary.map(point=>point.lat)),east:Math.max(...boundary.map(point=>point.lng)),west:Math.min(...boundary.map(point=>point.lng))};},[selectedNdviField]);

  function chooseNdvi(id:string){setSelectedNdviId(id);if(!id)return;const layer=ndviLayers.find(item=>item.id===id),field=fields.find(item=>item.id===layer?.field_id);if(field){setSelectedFieldId(field.id);fitField(field);}}

  async function toggleThematicLayer(id:string,visible:boolean){
    if(!visible){setVisibleThematicIds(ids=>ids.filter(item=>item!==id));return;}
    const layer=thematicLayers.find(item=>item.id===id);
    if(!layer)return;
    if(layer.geojson){setVisibleThematicIds(ids=>ids.includes(id)?ids:[...ids,id]);return;}
    setLoadingThematicIds(ids=>[...ids,id]);
    try{
      const{data:file,error}=await supabase.storage.from("cropnex-layers").download(layer.storage_path);
      if(error||!file)throw error||new Error("The map file could not be loaded.");
      const text=await file.text();
      const worker=new Worker(new URL("./geojson.worker.ts",import.meta.url),{type:"module"});
      const response=await new Promise<GeoJsonReadResponse>((resolve,reject)=>{
        const timeout=window.setTimeout(()=>{worker.terminate();reject(new Error("Opening this map took too long. Split the layer into smaller maps and try again."));},120_000);
        const cleanup=()=>{window.clearTimeout(timeout);worker.terminate();};
        worker.onmessage=(event:MessageEvent<GeoJsonReadResponse>)=>{cleanup();resolve(event.data);};
        worker.onerror=(event)=>{cleanup();reject(new Error(event.message||"The map reader stopped unexpectedly."));};
        worker.postMessage({text});
      });
      if(!response.ok)throw new Error(response.error);
      const geojson=response.geojson;
      setThematicLayers(layers=>layers.map(item=>item.id===id?{...item,geojson}:item));
      setVisibleThematicIds(ids=>ids.includes(id)?ids:[...ids,id]);
    }catch(error){alert(error instanceof Error?error.message:"Could not load this map layer.");}
    finally{setLoadingThematicIds(ids=>ids.filter(item=>item!==id));}
  }

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
    <main className="ag-map-workspace relative h-[calc(100dvh-5rem)] min-h-[620px] overflow-hidden bg-[#17382E] text-white">
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
        {visibleThematicLayers.length>0&&<ThematicGeoJsonOverlay map={map} layers={visibleThematicLayers}/>}
        {farmPin && <Marker position={farmPin} title="Main farm" label={{ text: "F", color: "#17382E", fontWeight: "800" }} />}
        {rainGauges.filter(g=>g.latitude!==null&&g.longitude!==null).map(g=><Marker key={`rain-${g.id}`} position={{lat:Number(g.latitude),lng:Number(g.longitude)}} title={`Rain gauge · ${g.name}`} label={{text:"R",color:"#17382E",fontWeight:"900"}} icon={{path:google.maps.SymbolPath.CIRCLE,fillColor:"#52b9e9",fillOpacity:1,strokeColor:"#ffffff",strokeWeight:2,scale:13}}/>)}
        {filteredFields.flatMap((field) => boundaryPolygonPaths(field.boundary).map((polygon, partIndex) => <Polygon key={`${field.id}-${partIndex}`} paths={polygon} onClick={() => selectField(field)} options={{ fillColor: cropColor(field.crop), fillOpacity: layerOverlayVisible ? 0 : selectedFieldId === field.id ? 0.58 : 0.34, strokeColor: layerOverlayVisible ? "#ffffff" : selectedFieldId === field.id ? "#ffffff" : cropColor(field.crop), strokeWeight: selectedFieldId === field.id ? 4 : 2, clickable: !drawing && !splitting, zIndex: selectedFieldId === field.id ? 3 : 1 }} />))}
        {!drawing&&!splitting&&filteredFields.filter((field) => field.id === selectedFieldId).map((field) => {
          const points = boundaryPoints(field.boundary);
          if (!points.length) return null;
          const position = points.reduce((value, point) => ({ lat: value.lat + point.lat / points.length, lng: value.lng + point.lng / points.length }), { lat: 0, lng: 0 });
          return <OverlayViewF key={`label-${field.id}`} position={position} mapPaneName="overlayMouseTarget"><button type="button" onClick={() => selectField(field)} className="ag-crop-marker"><span className="text-left"><span className="block text-[10px] font-black text-white">{field.field_name}</span><span className="block text-[9px] text-[#E6C784]">{field.cultivar || field.crop || "Unplanned"}</span></span></button></OverlayViewF>;
        })}
        {points.map((point, index) => <Marker key={`${point.lat}-${point.lng}-${index}`} position={point} label={(index + 1).toString()} />)}
        {points.length >= 3 && <Polygon paths={points} options={{ fillColor: "#B6CB8D", fillOpacity: 0.32, strokeColor: "#ffffff", strokeWeight: 3, clickable: false }} />}
        {splitPoints.map((point,index)=><Marker key={`split-${index}`} position={point} label={{text:String(index+1),color:"#111516",fontWeight:"900"}} icon={{path:google.maps.SymbolPath.CIRCLE,fillColor:"#A5DE50",fillOpacity:1,strokeColor:"#111516",strokeWeight:2,scale:10}}/>)}
        {splitPoints.length===2&&<Polyline path={splitPoints} options={{strokeColor:"#A5DE50",strokeWeight:4,strokeOpacity:.95,clickable:false}}/>}
      </GoogleMap>

      <section className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2 lg:left-[336px] lg:right-4">
        <button type="button" onClick={() => setListOpen(true)} className="rounded-xl border border-white/15 bg-[#17382E]/95 px-4 py-3 text-sm font-bold shadow-xl backdrop-blur lg:hidden">☰ Fields</button>
        <div className="flex flex-1 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#17382E]/92 p-2 shadow-2xl backdrop-blur-xl">
          <div className="hidden px-2 sm:block"><p className="ag-kicker">Map workspace</p><p className="font-display text-sm font-bold">{filteredFields.length} fields · {filteredArea.toFixed(1)} ha</p></div>
          <div className="hidden h-8 w-px bg-white/10 sm:block" />
          <button type="button" onClick={fitAll} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Fit all</button>
          <button type="button" onClick={() => setPlacingFarmPin((value) => !value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${placingFarmPin ? "bg-amber-400 text-black" : "bg-white/[0.06]"}`}>{placingFarmPin ? "Tap farm location" : farmPin ? "Move farm pin" : "Set farm pin"}</button>
          <button type="button" onClick={beginNewField} className="rounded-lg bg-[#789B58] px-3 py-2 text-xs font-bold text-[#17382E]">+ Create new field</button>
          <button type="button" onClick={createSeason} className="rounded-lg border border-[#789B58]/35 bg-[#789B58]/10 px-3 py-2 text-xs font-bold text-[#b8e77d]">+ New season</button>
          {selectedFieldId&&!drawing&&!splitting&&<button type="button" onClick={beginBoundaryEdit} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Edit boundary</button>}
          {drawing&&!showNewField&&<><span className="rounded-lg bg-black/40 px-3 py-2 text-xs">Tap around the boundary · {points.length} points</span><button type="button" onClick={()=>{setDrawing(false);setPoints([]);setCalculatedAreaHa(null)}} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Cancel</button><button type="button" disabled={points.length<3} onClick={saveBoundary} className="rounded-lg bg-[#86CF34] px-3 py-2 text-xs font-extrabold text-[#111516] disabled:opacity-40">Save edited boundary</button><button type="button" onClick={() => { setPoints([]); setCalculatedAreaHa(null); }} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Clear</button></>}
          {splitting&&<><span className="rounded-lg bg-black/40 px-3 py-2 text-xs">Tap two points across the field · {splitPoints.length}/2</span><button type="button" onClick={cancelSplit} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Cancel split</button><button type="button" onClick={()=>setSplitPoints([])} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-bold">Clear line</button></>}
        </div>
      </section>

      <aside className={`${listOpen ? "translate-x-0" : "-translate-x-[110%]"} absolute bottom-3 left-3 top-3 z-20 flex w-[calc(100%-1.5rem)] max-w-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17382E]/95 shadow-2xl backdrop-blur-xl transition-transform lg:translate-x-0`}>
        <div className="border-b border-white/[0.07] p-4"><div className="flex items-center justify-between"><div><p className="ag-kicker">Farm map</p><h1 className="mt-1 text-xl font-extrabold">Fields</h1></div><button type="button" onClick={() => setListOpen(false)} className="rounded-lg p-2 text-gray-400 lg:hidden">✕</button></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fields or crops…" className="mt-4 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-[#789B58]/50" /><div className="mt-2 grid grid-cols-2 gap-2"><select value={farmFilter} onChange={(event) => setFarmFilter(event.target.value)} className="min-w-0 rounded-lg border border-white/[0.08] bg-[#203A31] px-2 py-2 text-xs">{farmFilters.map((farm) => <option key={farm}>{farm}</option>)}</select><select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)} className="min-w-0 rounded-lg border border-white/[0.08] bg-[#203A31] px-2 py-2 text-xs">{seasons.map((season) => <option key={season}>{season}</option>)}</select></div></div>
        {thematicLayers.length>0&&<section className="mx-2 mt-2 rounded-xl border border-white/10 bg-white/[.035] p-3"><p className="ag-kicker mb-2">Map layers</p>{thematicLayers.map(layer=><div key={layer.id}><label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-xs hover:bg-white/[.04]"><input type="checkbox" checked={visibleThematicIds.includes(layer.id)} disabled={loadingThematicIds.includes(layer.id)} onChange={event=>void toggleThematicLayer(layer.id,event.target.checked)} className="mt-0.5 accent-[#B6CB8D]"/><span><span className="block font-bold">{loadingThematicIds.includes(layer.id)?"Loading map…":layer.layer_type}</span><span className="mt-0.5 block text-white/55">{layer.file_name} · {layer.metadata?.feature_count||layer.geojson?.features.length||0} polygons</span></span></label>{visibleThematicIds.includes(layer.id)&&Object.entries(layer.metadata?.category_counts||{}).slice(0,6).map(([name,count])=><div key={name} className="ml-8 flex items-center gap-2 py-0.5 text-[10px] text-white/60"><i className="h-2.5 w-2.5 rounded-sm" style={{background:categoryColor(name)}}/>{name} <span className="ml-auto">{count}</span></div>)}</div>)}</section>}
        <div className="flex-1 space-y-1 overflow-y-auto p-2">{filteredFields.map((field) => <button key={field.id} type="button" onClick={() => selectField(field)} className={`w-full rounded-xl border p-3 text-left transition ${selectedFieldId === field.id ? "border-[#789B58]/45 bg-[#789B58]/10" : "border-transparent hover:bg-white/[0.045]"}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cropColor(field.crop) }} /><div className="min-w-0"><p className="truncate text-sm font-bold">{field.field_name}</p><p className="mt-1 truncate text-xs text-[#77887e]">{field.crop || "Crop unassigned"} · {field.season || "No season"}</p></div></div><span className="shrink-0 text-xs font-bold text-[#B6CB8D]">{Number(field.area_ha).toFixed(1)} ha</span></div></button>)}{filteredFields.length === 0 && <p className="p-6 text-center text-sm text-[#77887e]">No fields match these filters.</p>}</div>
        <MapLegend />
      </aside>

      {calculatedAreaHa !== null && <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-[#789B58]/30 bg-[#17382E]/95 px-5 py-3 text-center shadow-xl"><p className="text-[10px] uppercase tracking-widest text-[#77887e]">Measured area</p><p className="font-display text-xl font-black text-[#B6CB8D]">{calculatedAreaHa.toFixed(2)} ha</p></div>}

      {showNewField&&<section className="absolute right-3 top-20 z-30 max-h-[calc(100%-6rem)] w-[calc(100%-1.5rem)] max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#17382E]/95 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between"><div><p className="ag-kicker">Map field creator</p><h2 className="mt-1 text-xl font-extrabold">Create new field</h2></div><button type="button" onClick={()=>{setShowNewField(false);setDrawing(false);setPoints([]);setCalculatedAreaHa(null)}} className="rounded-lg p-2 text-gray-400">✕</button></div>
        {(!farmers.length||!farms.length)&&<div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-200/10 p-4"><p className="font-bold text-amber-100">Set up your farm first</p><p className="mt-1 text-sm leading-5 text-white/75">Add your farmer or business, then add a farm under that farmer. You’ll return here to create the field.</p><Link href="/standards" className="mt-3 inline-flex rounded-lg bg-[#D6A64C] px-4 py-2 text-sm font-bold text-[#171812]">Open Farm Setup</Link></div>}
        <label className="field-label">Farmer<select className="field-input" value={newField.farmer_id} onChange={event=>{const farmer_id=event.target.value;setNewField(value=>({...value,farmer_id,farm_id:farms.find(item=>item.farmer_id===farmer_id)?.id||"",new_farm_name:""}))}}><option value="">Select farmer</option>{farmers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field-label">Existing farm or new farm<select className="field-input" value={newField.farm_id} onChange={event=>setNewField(value=>({...value,farm_id:event.target.value,new_farm_name:event.target.value==="__new__"?value.new_farm_name:""}))}><option value="">Select farm</option>{farms.filter(item=>item.farmer_id===newField.farmer_id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new__">+ Create new farm</option></select></label>
        {newField.farm_id==="__new__"&&<label className="field-label">New farm name<input className="field-input" value={newField.new_farm_name} onChange={event=>setNewField(value=>({...value,new_farm_name:event.target.value}))} placeholder="Preston"/></label>}
        <label className="field-label">Field name<input className="field-input" value={newField.field_name} onChange={event=>setNewField(value=>({...value,field_name:event.target.value}))} placeholder="WO1" /></label>
        <div className="mt-4 rounded-xl bg-white/[0.04] p-3 text-sm"><div className="flex justify-between"><span className="text-[#8d9d94]">Boundary points</span><strong>{points.length}</strong></div><div className="mt-1 flex justify-between"><span className="text-[#8d9d94]">Map-calculated area</span><strong className="text-[#B6CB8D]">{calculatedAreaHa?.toFixed(2)||"0.00"} ha</strong></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setNewField(value=>({...value,area_mode:"calculated"}))} className={`rounded-xl border px-3 py-2 text-xs font-bold ${newField.area_mode==="calculated"?"border-[#789B58]/40 bg-[#789B58]/15 text-[#B6CB8D]":"border-white/10"}`}>Use map hectares</button><button type="button" onClick={()=>setNewField(value=>({...value,area_mode:"manual"}))} className={`rounded-xl border px-3 py-2 text-xs font-bold ${newField.area_mode==="manual"?"border-[#789B58]/40 bg-[#789B58]/15 text-[#B6CB8D]":"border-white/10"}`}>Use own hectares</button></div>
        {newField.area_mode==="manual"&&<label className="field-label">Official hectares<input className="field-input" type="number" min="0.01" step="0.01" value={newField.manual_area} onChange={event=>setNewField(value=>({...value,manual_area:event.target.value}))} placeholder="61.26"/></label>}
        <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>{setDrawing(true);setPoints([]);setCalculatedAreaHa(null)}} className="rounded-xl border border-[#789B58]/30 bg-[#789B58]/10 px-3 py-3 text-sm font-bold text-[#B6CB8D]">{drawing?"Drawing active":"Start drawing"}</button><button type="button" onClick={()=>{setPoints([]);setCalculatedAreaHa(null)}} className="rounded-xl border border-white/10 px-3 py-3 text-sm font-bold">Clear</button></div>
        <p className="mt-3 text-xs leading-5 text-[#77887e]">Tap around the field boundary. Keep the measured hectares or enter the official registered area.</p><button type="button" disabled={savingField||points.length<3} onClick={saveNewField} className="mt-4 w-full rounded-xl bg-[#789B58] py-3.5 font-extrabold text-[#17382E] disabled:opacity-40">{savingField?"Creating…":"Create field"}</button>
      </section>}

      {selectedField&&!splitting && <FieldDrawer field={selectedField} activities={fieldActivities} loadingActivities={loadingActivities} showActivityForm={showActivityForm} activityMode={activityMode} activityType={activityType} activityDate={activityDate} activityNotes={activityNotes} savingActivity={savingActivity} plans={plans} planProducts={planProducts} planOperations={planOperations} catalogueProducts={catalogueProducts} standardOperations={standardOperations} actualisingPlanId={actualisingPlanId} inventory={inventory} inventoryLocations={inventoryLocations} ndviLayers={ndviLayers} ndviUrls={ndviUrls} selectedNdviId={selectedNdviId} ndviOpacity={ndviOpacity} onSelectNdvi={chooseNdvi} onNdviOpacityChange={setNdviOpacity} onClose={() => { setSelectedField(null); setShowActivityForm(false); }} onShowActivityForm={(mode) => { setActivityMode(mode); setShowActivityForm(true); }} onCancelActivityForm={() => setShowActivityForm(false)} onActivityModeChange={setActivityMode} onActivityTypeChange={setActivityType} onActivityDateChange={setActivityDate} onActivityNotesChange={setActivityNotes} onSaveActivity={saveFieldActivity} onActualisePlan={actualisePlan} onSaveFieldDetails={saveSelectedFieldDetails} onStartBoundaryEdit={beginBoundaryEdit} onStartSplit={beginSplit} />}
      {splitting&&selectedField&&<section className="absolute right-3 top-20 z-30 w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-white/10 bg-[#15191B]/95 p-5 text-white shadow-2xl backdrop-blur-xl"><p className="ag-kicker">Split boundary</p><h2 className="mt-1 text-lg font-extrabold">Name both field sections</h2><p className="mt-2 text-sm leading-5 text-white/70">Tap two points across the selected field. CropNex will extend the line to the boundary. {splitPoints.length}/2 points placed.</p><label className="field-label">First field name<input className="field-input" value={splitNames.first} onChange={event=>setSplitNames({...splitNames,first:event.target.value})}/></label><label className="field-label">Second field name<input className="field-input" value={splitNames.second} onChange={event=>setSplitNames({...splitNames,second:event.target.value})}/></label><p className="mt-2 text-xs leading-5 text-white/55">Existing plans stay with {splitNames.first || "the first field"}. The new field starts without copied plans or history. Works with a single outline without interior holes.</p><button type="button" disabled={savingField||splitPoints.length!==2||!splitNames.first.trim()||!splitNames.second.trim()||splitNames.first.trim()===splitNames.second.trim()} onClick={confirmSplit} className="mt-3 w-full rounded-xl bg-[#86CF34] py-2.5 text-sm font-extrabold text-[#111516] disabled:opacity-40">{savingField?"Splitting…":"Create both field boundaries"}</button><button type="button" onClick={cancelSplit} className="mt-2 w-full rounded-xl border border-white/10 py-2 text-sm">Cancel split</button></section>}
    </main>
  );
}

function ThematicGeoJsonOverlay({map,layers}:{map:google.maps.Map|null;layers:ThematicLayer[]}){
  useEffect(()=>{
    if(!map||!layers.length)return;
    const features=layers.flatMap(layer=>(layer.geojson?.features||[]).map(feature=>({
      type:"Feature",
      geometry:feature.geometry,
      properties:{...(feature.properties||{}),__cropnex_fill:categoryColor(feature.properties?.[layer.metadata?.display_attribute||""]??"Unclassified")},
    })));
    const dataLayer=(map as unknown as {data:google.maps.Data}).data;
    const added=dataLayer.addGeoJson({type:"FeatureCollection",features});
    dataLayer.setStyle(feature=>({fillColor:String(feature.getProperty("__cropnex_fill")||"#789B58"),fillOpacity:.48,strokeColor:"#fffdf8",strokeOpacity:.9,strokeWeight:1,clickable:false,zIndex:2}));
    return()=>{added.forEach(feature=>dataLayer.remove(feature));};
  },[map,layers]);
  return null;
}
