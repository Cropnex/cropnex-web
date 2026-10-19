"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { InventoryItem } from "@/types/inventory";
import type { ActivityPlan, ActivityPlanProduct } from "@/types/planning";
import { useSeason } from "@/components/season/SeasonProvider";

type Operation = { id:string; name:string; category:string; unit:string; unit_cost:number; supplier:string|null };
type StandardActivity = { id:string; name:string; category:string };
type Farmer = { id:string; name:string };
type Farm = { id:string; name:string; farmer_id:string };
type FarmOption = Farm & { filterKey:string };
type MasterProduct = { id:string; catalogue_code:string; name:string; category:string; pack_unit:string|null; manufacturer:string|null; status:string };
type PlanOperation = { id:string; plan_id:string; operation_id:string|null; operation_name:string; unit:string; planned_rate_per_ha:number; planned_quantity:number; planned_unit_price:number; planned_cost:number; actual_rate_per_ha:number|null; actual_cost:number|null };
type DraftLine = { key:string; type:"Product"|"Operation"; itemId:string; rate:string; price:string };

const money = new Intl.NumberFormat("en-ZA", { style:"currency", currency:"ZAR", maximumFractionDigits:2 });
const today = () => new Date().toISOString().slice(0,10);

export default function OnePagePlanner(){
  const{currentSeason,seasons:availableSeasons,setCurrentSeason}=useSeason();
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [fields,setFields]=useState<Field[]>([]),[inventory,setInventory]=useState<InventoryItem[]>([]),[masterProducts,setMasterProducts]=useState<MasterProduct[]>([]),[operations,setOperations]=useState<Operation[]>([]),[standards,setStandards]=useState<StandardActivity[]>([]),[plans,setPlans]=useState<ActivityPlan[]>([]),[products,setProducts]=useState<ActivityPlanProduct[]>([]),[planOps,setPlanOps]=useState<PlanOperation[]>([]),[farmers,setFarmers]=useState<Farmer[]>([]),[farms,setFarms]=useState<Farm[]>([]);
  const [season,setSeason]=useState(""),[farmerId,setFarmerId]=useState("all"),[farmId,setFarmId]=useState("all"),[search,setSearch]=useState(""),[selectedFields,setSelectedFields]=useState<string[]>([]),[expanded,setExpanded]=useState<string|null>(null);
  const [showCreate,setShowCreate]=useState(false),[activityId,setActivityId]=useState(""),[activityName,setActivityName]=useState(""),[activityDate,setActivityDate]=useState(today()),[notes,setNotes]=useState(""),[draftLines,setDraftLines]=useState<DraftLine[]>([{key:crypto.randomUUID(),type:"Product",itemId:"",rate:"",price:""}]);
  const [actualPlan,setActualPlan]=useState<ActivityPlan|null>(null),[actualDate,setActualDate]=useState(today()),[actualRates,setActualRates]=useState<Record<string,string>>({}),[actualItems,setActualItems]=useState<Record<string,string>>({}),[actualPlanIds,setActualPlanIds]=useState<string[]>([]);

  async function load(){
    if(!currentSeason)return;
    setLoading(true);
    const q=await Promise.all([
      supabase.from("fields").select("*").eq("season",currentSeason).order("farm_name").order("field_name"),
      supabase.from("inventory_items").select("*").eq("season",currentSeason).eq("status","Active").order("name"),
      supabase.from("standard_operations").select("*").eq("active",true).order("name"),
      supabase.from("activity_templates").select("*").eq("active",true).order("category").order("name"),
      supabase.from("activity_plans").select("*").eq("season",currentSeason).order("planned_date"),
      supabase.from("activity_plan_products").select("*").order("created_at"),
      supabase.from("activity_plan_operations").select("*").order("created_at"),
      supabase.from("farmers").select("*").eq("active",true).order("name"),
      supabase.from("farms").select("*").eq("active",true).order("name"),
      supabase.from("master_products").select("id,catalogue_code,name,category,pack_unit,manufacturer,status").eq("status","Approved").order("category").order("name"),
    ]);
    setFields((q[0].data||[]) as Field[]); setInventory((q[1].data||[]) as InventoryItem[]); setOperations((q[2].data||[]) as Operation[]); setStandards((q[3].data||[]) as StandardActivity[]); setPlans((q[4].data||[]) as ActivityPlan[]); setProducts((q[5].data||[]) as ActivityPlanProduct[]); setPlanOps((q[6].data||[]) as PlanOperation[]); setFarmers((q[7].data||[]) as Farmer[]); setFarms((q[8].data||[]) as Farm[]); setMasterProducts((q[9].data||[]) as MasterProduct[]);
    setLoading(false);
  }
  useEffect(()=>{if(!currentSeason)return;setSeason(currentSeason);setSelectedFields([]);void load()},[currentSeason]);

  const seasons=availableSeasons;
  const normalized=(value:string|null|undefined)=>String(value||"").trim().toLowerCase();
  const fieldFarmerId=(field:Field)=>field.farmer_id||farms.find(x=>x.id===field.farm_id||normalized(x.name)===normalized(field.farm_name))?.farmer_id||(farmers.length===1?farmers[0].id:null);
  const farmOptions=useMemo(()=>{
    const options=new Map<string,FarmOption>();
    for(const farm of farms)options.set(normalized(farm.name),{...farm,filterKey:farm.id});
    for(const field of fields){
      if(!field.farm_name)continue;
      const key=normalized(field.farm_name),existing=options.get(key),resolvedFarmer=fieldFarmerId(field);
      if(!existing)options.set(key,{id:field.farm_id||`name:${key}`,filterKey:field.farm_id||`name:${key}`,name:field.farm_name,farmer_id:resolvedFarmer||""});
    }
    return [...options.values()].sort((a,b)=>a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[farms,fields,farmers]);
  const visibleFarms=farmerId==="all"?farmOptions:farmOptions.filter(x=>x.farmer_id===farmerId||!x.farmer_id);
  const visibleFields=useMemo(()=>fields.filter(field=>{
    const matchesFarmer=farmerId==="all"||fieldFarmerId(field)===farmerId;
    const matchesFarm=farmId==="all"||field.farm_id===farmId||farmId===`name:${normalized(field.farm_name)}`||farmOptions.find(x=>x.filterKey===farmId)?.name===field.farm_name;
    const haystack=`${field.field_name} ${field.farm_name||""} ${field.crop||""} ${field.cultivar||""}`.toLowerCase();
    return matchesFarmer&&matchesFarm&&haystack.includes(search.toLowerCase());
  }),[fields,farms,farmerId,farmId,search]);
  const seasonPlans=plans.filter(x=>{const field=fields.find(f=>f.id===x.field_id);return x.season===season&&(farmerId==="all"||!!field&&fieldFarmerId(field)===farmerId)&&(farmId==="all"||!!field&&(field.farm_id===farmId||farmId===`name:${normalized(field.farm_name)}`||farmOptions.find(f=>f.filterKey===farmId)?.name===field.farm_name))});
  const selectedArea=visibleFields.filter(x=>selectedFields.includes(x.id)).reduce((s,x)=>s+Number(x.area_ha||0),0);
  const uniqueArea=Array.from(new Set(seasonPlans.map(x=>x.field_id))).reduce((s,id)=>s+Number(fields.find(x=>x.id===id)?.area_ha||0),0);
  const totalBudget=seasonPlans.reduce((s,x)=>s+Number(x.planned_total||0),0);
  const missingPrices=[...inventory.filter(x=>Number(x.unit_cost||0)<=0),...operations.filter(x=>Number(x.unit_cost||0)<=0)].length;

  function toggleField(id:string){setSelectedFields(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}
  function chooseActivity(id:string){const row=standards.find(x=>x.id===id);setActivityId(id);setActivityName(row?.name||"")}
  function addDraftLine(){setDraftLines(v=>[...v,{key:crypto.randomUUID(),type:"Product",itemId:"",rate:"",price:""}])}
  function updateLine(key:string,patch:Partial<DraftLine>){setDraftLines(v=>v.map(x=>x.key===key?{...x,...patch}:x))}
  function removeLine(key:string){setDraftLines(v=>v.filter(x=>x.key!==key))}
  function lineItem(line:DraftLine){return line.type==="Product"?masterProducts.find(x=>x.id===line.itemId):operations.find(x=>x.id===line.itemId)}
  function suggestedPrice(masterId:string){return Number(inventory.find(x=>x.master_product_id===masterId)?.unit_cost||0)}
  function linePrice(line:DraftLine){return line.type==="Product"?Number(line.price||suggestedPrice(line.itemId)):Number((lineItem(line) as Operation|undefined)?.unit_cost||0)}
  function lineUnit(line:DraftLine){return line.type==="Product"?((lineItem(line) as MasterProduct|undefined)?.pack_unit||"unit"):((lineItem(line) as Operation|undefined)?.unit||"ha")}
  const draftCostPerHa=draftLines.reduce((sum,line)=>sum+Number(line.rate||0)*linePrice(line),0);

  function resetCreate(){setShowCreate(false);setActivityId("");setActivityName("");setActivityDate(today());setNotes("");setDraftLines([{key:crypto.randomUUID(),type:"Product",itemId:"",rate:"",price:""}])}

  async function saveActivity(){
    if(!selectedFields.length)return alert("Select at least one field first.");
    if(!activityId||!activityName)return alert("Choose a standard activity.");
    const validLines=draftLines.filter(x=>x.itemId&&Number(x.rate)>0);
    if(!validLines.length)return alert("Add at least one product or operation and enter its rate.");
    const {data:auth}=await supabase.auth.getSession(),user_id=auth.session?.user.id;
    if(!user_id)return alert("Your session has expired. Please sign in again.");
    setSaving(true);
    try{
      for(const fieldId of selectedFields){
        const field=fields.find(x=>x.id===fieldId); if(!field)continue;
        const farm=farms.find(x=>x.id===field.farm_id||x.name===field.farm_name),farmer=farmers.find(x=>x.id===field.farmer_id||x.id===farm?.farmer_id);
        const total=validLines.reduce((s,line)=>s+Number(line.rate)*linePrice(line)*Number(field.area_ha),0);
        const {data:plan,error}=await supabase.from("activity_plans").insert({user_id,field_id:field.id,activity_template_id:activityId,farmer_name:farmer?.name||"Farmer",farm_name:field.farm_name||farm?.name||"Farm",field_name:field.field_name,activity_type:activityName,crop:field.crop,cultivar:field.cultivar,season,planned_date:activityDate,planned_area_ha:field.area_ha,status:"Planned",notes:notes.trim()||null,planned_total:Number(total.toFixed(2))}).select("id").single();
        if(error||!plan)throw error||new Error("Activity could not be created.");
        const productRows=validLines.filter(x=>x.type==="Product").map(line=>{const item=masterProducts.find(x=>x.id===line.itemId)!;const stock=inventory.find(x=>x.master_product_id===item.id),qty=Number(line.rate)*Number(field.area_ha),price=linePrice(line);return{user_id,plan_id:plan.id,inventory_item_id:stock?.id||null,master_product_id:item.id,product_name:item.name,unit:item.pack_unit||stock?.unit||"unit",planned_rate_per_ha:Number(line.rate),planned_quantity:qty,planned_unit_price:price,planned_cost:Number((qty*price).toFixed(2))}});
        const operationRows=validLines.filter(x=>x.type==="Operation").map(line=>{const item=operations.find(x=>x.id===line.itemId)!;const qty=Number(line.rate)*Number(field.area_ha);return{user_id,plan_id:plan.id,operation_id:item.id,operation_name:item.name,unit:item.unit,planned_rate_per_ha:Number(line.rate),planned_quantity:qty,planned_unit_price:Number(item.unit_cost||0),planned_cost:Number((qty*Number(item.unit_cost||0)).toFixed(2))}});
        if(productRows.length){const {error:e}=await supabase.from("activity_plan_products").insert(productRows);if(e)throw e}
        if(operationRows.length){const {error:e}=await supabase.from("activity_plan_operations").insert(operationRows);if(e)throw e}
      }
      resetCreate();setSelectedFields([]);await load();alert("Activity added to the selected fields.");
    }catch(error){alert(error instanceof Error?error.message:"Activity could not be saved.")}finally{setSaving(false)}
  }

  function openActual(plan:ActivityPlan){const lines=products.filter(x=>x.plan_id===plan.id);setActualPlan(plan);setActualPlanIds([plan.id]);setActualDate(today());setActualRates(Object.fromEntries(lines.map(x=>[x.id,String(x.planned_rate_per_ha)])));setActualItems(Object.fromEntries(lines.map(x=>[x.id,""])))}
  async function actualise(){
    if(!actualPlan)return;
    const sourceLines=products.filter(x=>x.plan_id===actualPlan.id),selected=plans.filter(plan=>actualPlanIds.includes(plan.id));
    if(!selected.length)return alert("Select at least one field.");
    if(sourceLines.some(line=>!actualItems[line.id]))return alert("Choose the supplying shed for every product before actualising.");
    for(const line of sourceLines){const stock=inventory.find(item=>item.id===actualItems[line.id]),rate=Number(actualRates[line.id]??line.planned_rate_per_ha),required=selected.reduce((sum,target)=>sum+rate*Number(target.planned_area_ha),0);if(!stock)return alert(`Choose a source shed for ${line.product_name}.`);if(required>Number(stock.quantity))return alert(`${stock.location||"Selected shed"} does not have enough ${stock.name}. Required ${required.toFixed(2)} ${stock.unit}; available ${Number(stock.quantity).toFixed(2)} ${stock.unit}.`) }
    if(!confirm(`Actualise ${actualPlan.activity_type} on ${selected.length} field${selected.length===1?"":"s"}? Inventory will be deducted for every selected field.`))return;
    setSaving(true);
    try{for(const target of selected){const targetLines=products.filter(x=>x.plan_id===target.id),lines=targetLines.map(line=>{const source=sourceLines.find(item=>(item.master_product_id&&item.master_product_id===line.master_product_id)||item.product_name.toLowerCase()===line.product_name.toLowerCase());return{id:line.id,inventory_item_id:source?actualItems[source.id]:"",rate:Number(source?actualRates[source.id]??source.planned_rate_per_ha:line.planned_rate_per_ha)}});if(lines.some(line=>!line.inventory_item_id))throw new Error(`${target.field_name}: choose the supplying shed for every product.`);const{error}=await supabase.rpc("actualise_activity_plan_v2",{p_plan_id:target.id,p_actual_date:actualDate,p_lines:lines,p_actual_notes:`Multi-field actual from Farm Planning · ${selected.length} fields`});if(error)throw error;}setActualPlan(null);setActualPlanIds([]);await load();alert(`${selected.length} field activit${selected.length===1?"y":"ies"} actualised. Inventory was deducted from the selected sheds.`)}catch(error){alert(error instanceof Error?error.message:"The activities could not be actualised.")}finally{setSaving(false)}
  }

  function exportCsv(){
    const header=["Season","Farmer","Farm","Field","Crop","Cultivar","Activity","Status","Planned Date","Area (ha)","Input Type","Input","Rate / ha","Unit","Unit Price","Total Cost"];
    const rows:string[][]=[];
    for(const plan of seasonPlans){for(const x of products.filter(y=>y.plan_id===plan.id))rows.push([plan.season,plan.farmer_name,plan.farm_name,plan.field_name,plan.crop||"",plan.cultivar||"",plan.activity_type,plan.status,plan.planned_date,String(plan.planned_area_ha),"Product",x.product_name,String(x.planned_rate_per_ha),x.unit,String(x.planned_unit_price),String(x.planned_cost)]);for(const x of planOps.filter(y=>y.plan_id===plan.id))rows.push([plan.season,plan.farmer_name,plan.farm_name,plan.field_name,plan.crop||"",plan.cultivar||"",plan.activity_type,plan.status,plan.planned_date,String(plan.planned_area_ha),"Operation",x.operation_name,String(x.planned_rate_per_ha),x.unit,String(x.planned_unit_price),String(x.planned_cost)])}
    const csv=[header,...rows].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(";")).join("\r\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`CropNex-${season.replace("/","-")}-Farm-Plan.csv`;a.click();URL.revokeObjectURL(url);
  }

  if(loading)return <main className="min-h-screen bg-[#06100c] p-8 text-white">Opening Farm Planning…</main>;
  return <main className="min-h-screen bg-[#06100c] p-3 text-white md:p-5">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="ag-kicker">Planning</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Farm Planning</h1><p className="mt-1 text-sm text-[#8d9d94]">Select fields, build an activity and save it—all on one page.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/activities/advanced" className="planner-secondary">Crop templates & advanced tools</Link><button type="button" onClick={exportCsv} className="planner-secondary">Export report</button><button type="button" disabled={!selectedFields.length} onClick={()=>setShowCreate(true)} className="planner-primary">+ Add activity</button></div>
    </header>

    <section className="mb-4 grid gap-2 rounded-2xl border border-white/[.07] bg-[#0b1812] p-3 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
      <PlannerSelect label="Farmer" value={farmerId} set={v=>{setFarmerId(v);setFarmId("all");setSelectedFields([])}} options={[["all","All farmers"],...farmers.map(x=>[x.id,x.name])]}/>
      <PlannerSelect label="Farm" value={farmId} set={v=>{setFarmId(v);setSelectedFields([])}} options={[["all",`All farms (${visibleFarms.length})`],...visibleFarms.map(x=>[x.filterKey,x.name])]}/>
      <PlannerSelect label="Season" value={season} set={v=>{setSeason(v);void setCurrentSeason(v)}} options={seasons.map(x=>[x,x])}/>
      <label className="planner-filter"><span>Search fields</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Field, crop or cultivar…"/></label>
      <div className="self-end rounded-xl bg-[#83c341]/10 px-4 py-2.5 text-center"><b className="text-[#a4df57]">{selectedFields.length}</b><p className="text-[10px] text-[#829087]">fields selected</p></div>
    </section>

    <div className="grid min-h-[650px] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
      <aside className="ag-panel overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[.07] p-4"><div><p className="ag-kicker">Fields</p><p className="mt-1 text-xs text-[#829087]">{visibleFields.length} available</p></div><button type="button" onClick={()=>setSelectedFields(selectedFields.length===visibleFields.length?[]:visibleFields.map(x=>x.id))} className="text-xs font-bold text-[#a4df57]">{selectedFields.length===visibleFields.length?"Clear all":"Select all"}</button></div>
        <div className="max-h-[690px] overflow-y-auto p-2">{visibleFields.map(field=><label key={field.id} className={`mb-1.5 flex cursor-pointer gap-3 rounded-xl border p-3 transition ${selectedFields.includes(field.id)?"border-[#83c341]/45 bg-[#83c341]/10":"border-transparent hover:bg-white/[.035]"}`}><input type="checkbox" checked={selectedFields.includes(field.id)} onChange={()=>toggleField(field.id)} className="mt-1 accent-[#83c341]"/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><b className="truncate">{field.field_name}</b><span className="whitespace-nowrap text-[11px] text-[#9cab9f]">{Number(field.area_ha).toFixed(2)} ha</span></div><p className="mt-1 truncate text-xs text-[#718278]">{field.farm_name||"Farm"}</p><p className="mt-1 truncate text-[11px] text-[#a4df57]">{field.crop||"No crop"}{field.cultivar?` · ${field.cultivar}`:""}</p></div></label>)}{!visibleFields.length&&<p className="p-8 text-center text-sm text-[#718278]">No matching fields.</p>}</div>
      </aside>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ag-kicker">Season programme</p><h2 className="mt-1 text-xl font-bold">Planned activities</h2></div><div className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#9cab9f]">{seasonPlans.length} activities</div></div>
        {seasonPlans.map(plan=>{const productLines=products.filter(x=>x.plan_id===plan.id),operationLines=planOps.filter(x=>x.plan_id===plan.id),isOpen=expanded===plan.id;return <article key={plan.id} className={`overflow-hidden rounded-2xl border ${plan.status==="Actualised"?"border-[#83c341]/20 bg-[#83c341]/[.035]":"border-white/[.075] bg-[#0b1812]"}`}>
          <button type="button" onClick={()=>setExpanded(isOpen?null:plan.id)} className="grid w-full gap-3 p-4 text-left md:grid-cols-[minmax(0,1fr)_150px_120px_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><b className="text-base">{plan.activity_type}</b><Status value={plan.status}/></div><p className="mt-1 text-xs text-[#829087]">{plan.farmer_name} · {plan.farm_name} · <span className="text-white">{plan.field_name}</span></p><p className="mt-1 text-xs text-[#718278]">{plan.crop||"No crop"}{plan.cultivar?` · ${plan.cultivar}`:""}</p></div><div><p className="text-[10px] uppercase tracking-wider text-[#718278]">Planned date</p><p className="mt-1 text-sm font-bold">{plan.planned_date}</p></div><div className="md:text-right"><p className="text-[10px] uppercase tracking-wider text-[#718278]">Cost / ha</p><p className="mt-1 font-bold text-[#a4df57]">{money.format(Number(plan.planned_total||0)/Math.max(1,Number(plan.planned_area_ha)))}</p></div><span className="text-[#a4df57]">{isOpen?"▲":"▼"}</span></button>
          {isOpen&&<div className="border-t border-white/[.07] p-4"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-[#718278]"><tr><th className="pb-2">Type</th><th>Product / operation</th><th>Rate / ha</th><th>Unit price</th><th className="text-right">Total</th></tr></thead><tbody>{productLines.map(x=><PlanLine key={x.id} type="Product" name={x.product_name} rate={x.planned_rate_per_ha} unit={x.unit} price={x.planned_unit_price} total={x.planned_cost}/>) }{operationLines.map(x=><PlanLine key={x.id} type="Operation" name={x.operation_name} rate={x.planned_rate_per_ha} unit={x.unit} price={x.planned_unit_price} total={x.planned_cost}/>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[#829087]">{plan.notes||"No instructions added."}</p>{plan.status==="Planned"&&<button type="button" onClick={()=>openActual(plan)} className="planner-primary">Convert to actual</button>}</div></div>}
        </article>})}
        {!seasonPlans.length&&<div className="rounded-2xl border border-dashed border-white/10 p-14 text-center"><p className="text-lg font-bold">No activities planned for {season}</p><p className="mt-2 text-sm text-[#829087]">Select fields on the left, then add the first activity.</p><button type="button" onClick={()=>setShowCreate(true)} className="planner-primary mt-5">+ Add activity</button></div>}
      </section>

      <aside className="space-y-3"><Summary label="Planned fields" value={String(new Set(seasonPlans.map(x=>x.field_id)).size)} note={`${uniqueArea.toFixed(1)} ha unique area`}/><Summary label="Planned budget" value={money.format(totalBudget)} note={`${money.format(totalBudget/Math.max(1,uniqueArea))}/ha`}/><Summary label="Selected now" value={`${selectedArea.toFixed(1)} ha`} note={`${selectedFields.length} fields ready for an activity`}/><section className="ag-panel rounded-2xl p-4"><p className="ag-kicker">Plan health</p><div className="mt-4 space-y-3 text-sm"><Health label="Standard activities" value={standards.length} ok={standards.length>0}/><Health label="Priced products & operations" value={inventory.length+operations.length-missingPrices} ok={missingPrices===0}/><Health label="Missing prices" value={missingPrices} ok={missingPrices===0}/></div><Link href="/master-data" className="mt-5 block text-sm font-bold text-[#a4df57]">Manage catalogue →</Link></section></aside>
    </div>

    {showCreate&&<Modal title="Create planned activity" subtitle={`${selectedFields.length} field${selectedFields.length===1?"":"s"} · ${selectedArea.toFixed(2)} ha`} close={resetCreate}>
      <div className="grid gap-3 md:grid-cols-2"><PlannerSelect label="Standard activity" value={activityId} set={chooseActivity} options={[["","Choose activity"],...standards.map(x=>[x.id,`${x.category} · ${x.name}`])]}/><label className="planner-filter"><span>Planned date</span><input type="date" value={activityDate} onChange={e=>setActivityDate(e.target.value)}/></label></div>
      <label className="planner-filter mt-3"><span>Instructions / notes</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional instructions for the team…"/></label>
      <div className="mt-5 flex items-end justify-between"><div><p className="font-bold">Products & operations</p><p className="text-xs text-[#829087]">Products come from the complete CropNex catalogue. Shed stock is only required when actualising.</p></div><button type="button" onClick={addDraftLine} className="text-sm font-bold text-[#a4df57]">+ Add line</button></div>
      <div className="mt-3 space-y-2">{draftLines.map((line,index)=>{const cost=Number(line.rate||0)*linePrice(line),unit=lineUnit(line);return <div key={line.key} className="grid gap-2 rounded-xl border border-white/[.07] bg-black/15 p-3 md:grid-cols-[120px_minmax(0,1fr)_110px_120px_110px_36px]"><PlannerSelect label={index===0?"Type":""} value={line.type} set={v=>updateLine(line.key,{type:v as DraftLine["type"],itemId:"",price:""})} options={[["Product","Product"],["Operation","Operation"]]}/><SearchSelect label={index===0?"Search product or operation":""} value={line.itemId} set={v=>{const price=v&&line.type==="Product"?suggestedPrice(v):"";updateLine(line.key,{itemId:v,price:price?String(price):""})}} placeholder={line.type==="Product"?"Type a product name…":"Type an operation…"} options={(line.type==="Product"?masterProducts.map(x=>[x.id,`${x.name} · ${x.category}${x.catalogue_code?` · ${x.catalogue_code}`:""}`]):operations.map(x=>[x.id,`${x.name} · ${x.category}`]))}/><label className="planner-filter"><span>{index===0?`Rate / ha (${unit})`:""}</span><input type="number" min="0" step="0.0001" value={line.rate} onChange={e=>updateLine(line.key,{rate:e.target.value})} placeholder="0.00"/></label><label className="planner-filter"><span>{index===0?`Budget price / ${unit}`:""}</span><input type="number" min="0" step="0.01" value={line.type==="Operation"?String(linePrice(line)||""):line.price} disabled={line.type==="Operation"} onChange={e=>updateLine(line.key,{price:e.target.value})} placeholder="0.00"/></label><div className="self-end rounded-xl bg-white/[.04] px-3 py-2.5 text-right text-xs"><span className="text-[#718278]">Cost/ha</span><b className="mt-1 block text-[#a4df57]">{money.format(cost)}</b></div><button type="button" onClick={()=>removeLine(line.key)} className="self-end rounded-lg py-2.5 text-red-300">×</button></div>})}</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.08] pt-4"><div><p className="text-xs text-[#829087]">Estimated cost</p><p className="text-xl font-black text-[#a4df57]">{money.format(draftCostPerHa)}/ha · {money.format(draftCostPerHa*selectedArea)} total</p></div><div className="flex gap-2"><button type="button" onClick={resetCreate} className="planner-secondary">Cancel</button><button type="button" disabled={saving} onClick={saveActivity} className="planner-primary">{saving?"Saving…":"Save activity"}</button></div></div>
    </Modal>}

    {actualPlan&&<Modal title="Convert plan to actual" subtitle={`${actualPlan.field_name} · ${actualPlan.activity_type}`} close={()=>setActualPlan(null)}><label className="planner-filter"><span>Actual completion date</span><input type="date" value={actualDate} onChange={e=>setActualDate(e.target.value)}/></label><div className="mt-4 rounded-xl border border-[#83c341]/20 bg-[#83c341]/[.055] p-4"><p className="font-bold">Add fields to this actual</p><p className="mt-1 text-xs text-[#829087]">Select other fields with the same planned activity. The date, products and rates below apply to every selected field.</p><div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">{plans.filter(plan=>plan.status==="Planned"&&plan.season===actualPlan.season&&plan.activity_type===actualPlan.activity_type).map(plan=><label key={plan.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-black/20 p-2 text-sm"><input type="checkbox" checked={actualPlanIds.includes(plan.id)} onChange={e=>setActualPlanIds(ids=>e.target.checked?[...new Set([...ids,plan.id])]:ids.filter(id=>id!==plan.id))}/><span>{plan.farm_name} · <b>{plan.field_name}</b></span></label>)}</div></div><p className="mt-5 font-bold">Confirm source sheds and actual rates</p><p className="mt-1 text-xs text-[#829087]">Choose the exact supplying shed for every product. Stock is deducted only from that selected shed.</p><div className="mt-3 space-y-2">{products.filter(x=>x.plan_id===actualPlan.id).map(x=>{const matches=inventory.filter(i=>!x.master_product_id||i.master_product_id===x.master_product_id);return <div key={x.id} className="grid items-center gap-3 rounded-xl bg-black/20 p-3 sm:grid-cols-[1fr_minmax(220px,1fr)_150px]"><div><b>{x.product_name}</b><p className="text-xs text-[#829087]">Planned {x.planned_rate_per_ha} {x.unit}/ha</p></div><PlannerSelect label="Source shed" value={actualItems[x.id]||""} set={v=>setActualItems({...actualItems,[x.id]:v})} options={[["","Choose supplying shed"],...matches.map(i=>[i.id,`${i.location||"Unassigned shed"} · ${i.name} · ${i.quantity} ${i.unit} available`])]}/><label className="planner-filter"><span>Actual rate / ha</span><input type="number" step="0.0001" value={actualRates[x.id]||""} onChange={e=>setActualRates({...actualRates,[x.id]:e.target.value})}/></label></div>})}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setActualPlan(null)} className="planner-secondary">Cancel</button><button type="button" disabled={saving||!actualPlanIds.length} onClick={actualise} className="planner-primary">{saving?"Updating…":`Confirm actual on ${actualPlanIds.length} field${actualPlanIds.length===1?"":"s"}`}</button></div></Modal>}
  </main>
}

function PlannerSelect({label,value,set,options}:{label:string;value:string;set:(v:string)=>void;options:string[][]}){return <label className="planner-filter"><span>{label}</span><select value={value} onChange={e=>set(e.target.value)}>{options.map(([v,l])=><option key={`${v}-${l}`} value={v}>{l}</option>)}</select></label>}
function SearchSelect({label,value,set,options,placeholder}:{label:string;value:string;set:(v:string)=>void;options:string[][];placeholder:string}){const[selected,setSelected]=useState(false),chosen=options.find(([id])=>id===value),[query,setQuery]=useState(chosen?.[1]||"");useEffect(()=>{if(value)setQuery(options.find(([id])=>id===value)?.[1]||"")},[value]);const matches=options.filter(([,name])=>name.toLowerCase().includes(query.toLowerCase())).slice(0,25);return <label className="planner-filter relative"><span>{label}</span><input value={query} onFocus={()=>setSelected(true)} onBlur={()=>setTimeout(()=>setSelected(false),120)} onChange={e=>{setQuery(e.target.value);set("");setSelected(true)}} placeholder={placeholder} autoComplete="off"/>{selected&&<div className="absolute left-0 right-0 top-full z-[130] mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#102019] p-1 shadow-2xl">{matches.map(([id,name])=><button key={id} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{set(id);setQuery(name);setSelected(false)}} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#83c341]/15">{name}</button>)}{!matches.length&&<p className="px-3 py-4 text-sm text-[#829087]">No matching items</p>}</div>}</label>}
function Status({value}:{value:string}){return <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${value==="Actualised"?"bg-[#83c341]/15 text-[#a4df57]":"bg-amber-400/10 text-amber-300"}`}>{value}</span>}
function PlanLine({type,name,rate,unit,price,total}:{type:string;name:string;rate:number;unit:string;price:number;total:number}){return <tr className="border-t border-white/[.055]"><td className={`py-2.5 ${type==="Product"?"text-[#a4df57]":"text-sky-300"}`}>{type}</td><td className="font-bold">{name}</td><td>{rate} {unit}/ha</td><td>{money.format(Number(price))}/{unit}</td><td className="text-right font-bold">{money.format(Number(total))}</td></tr>}
function Summary({label,value,note}:{label:string;value:string;note:string}){return <section className="ag-panel rounded-2xl p-4"><p className="text-[10px] uppercase tracking-[.14em] text-[#718278]">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-[#829087]">{note}</p></section>}
function Health({label,value,ok}:{label:string;value:number;ok:boolean}){return <div className="flex items-center justify-between"><span className="text-[#9cab9f]">{label}</span><b className={ok?"text-[#a4df57]":"text-amber-300"}>{value}</b></div>}
function Modal({title,subtitle,close,children}:{title:string;subtitle:string;close:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-5" onMouseDown={e=>{if(e.currentTarget===e.target)close()}}><section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0a1711] p-5 shadow-2xl md:rounded-3xl md:p-6"><header className="mb-5 flex items-start justify-between"><div><p className="ag-kicker">Farm Planning</p><h2 className="mt-1 text-2xl font-extrabold">{title}</h2><p className="mt-1 text-sm text-[#829087]">{subtitle}</p></div><button type="button" onClick={close} className="rounded-xl border border-white/10 px-3 py-2 text-xl">×</button></header>{children}</section></div>}
