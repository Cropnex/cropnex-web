"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Field } from "@/types/field";
import type { InventoryItem } from "@/types/inventory";
import type { ActivityPlan, ActivityPlanProduct } from "@/types/planning";
import { downloadPlanningWorkbook, readPlanningWorkbook, type PlanningImportRow } from "@/lib/planning-workbook";
import { useSeason } from "@/components/season/SeasonProvider";
type Tab = "overview" | "templates" | "assign" | "excel" | "replace" | "layers";
type Operation = {
    id: string;
    name: string;
    category: string;
    unit: string;
    unit_cost: number;
    supplier: string | null;
};
type MasterProduct = {
    id: string;
    catalogue_code: string;
    name: string;
    category: string;
    pack_unit: string | null;
    manufacturer: string | null;
    product_class?: string | null;
    crop_type?: string | null;
    product_request_id?: string | null;
    custom?: boolean;
};
type ProductRequest = { id: string; requested_name: string; manufacturer: string | null; category: string; product_class?: string | null; crop_type?: string | null; pack_unit: string | null; status: string; resolved_product_id: string | null };
type StandardActivity = {
    id: string;
    name: string;
    category: string;
};
type CropTemplate = {
    id: string;
    name: string;
    crop: string;
    season: string | null;
    description: string | null;
};
type TemplateActivity = {
    id: string;
    crop_template_id: string;
    activity_template_id: string | null;
    name: string;
    category: string;
    sequence_no: number;
    days_after_planting: number;
    due_date: string | null;
    notes: string | null;
};
type TemplateLine = {
    id: string;
    template_activity_id: string;
    line_type: "Product" | "Operation";
    inventory_item_id: string | null;
    master_product_id: string | null;
    product_request_id?: string | null;
    operation_id: string | null;
    item_name: string;
    unit: string;
    rate_per_ha: number;
    planned_unit_price: number;
};
type PlanOperation = {
    id: string;
    plan_id: string;
    operation_id: string | null;
    operation_name: string;
    unit: string;
    planned_rate_per_ha: number;
    planned_quantity: number;
    planned_unit_price: number;
    planned_cost: number;
    actual_rate_per_ha: number | null;
    actual_quantity: number | null;
    actual_unit_price: number | null;
    actual_cost: number | null;
};
type Farmer = {
    id: string;
    name: string;
};
type Farm = {
    id: string;
    name: string;
    farmer_id: string;
};
type Cultivar = {
    id: string;
    crop: string;
    name: string;
};
type MapLayer = {
    id: string;
    field_id: string | null;
    field_name: string | null;
    season: string | null;
    layer_type: string;
    source: string;
    captured_date: string | null;
    file_name: string;
    status: string;
    created_at: string;
};
type ModificationRule = { id: string; type: "Product" | "Operation"; action: "Alter" | "Add" | "Remove"; from_id: string; to_id: string; rate: string };
const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 });
const tabs: [
    Tab,
    string
][] = [["overview", "Field Plans"], ["templates", "Activity Templates"], ["assign", "Assign to Fields"], ["excel", "Excel Planning"], ["replace", "Find & Replace"], ["layers", "Data Layers"]];
const operationCategories = ["Contractor", "Machinery", "Aerial application", "Sampling", "Rent", "Labour", "Other"];
const layerTypes = ["Field boundary", "Soil type", "Potential map", "NDVI", "Planting", "Spraying", "Fertiliser", "Harvest yield", "Harvest moisture", "Elevation", "Prescription", "Other"];
const cropTypes = ["White Maize", "Yellow Maize", "Sunflower", "Soybean", "Wheat", "Sorghum", "Groundnuts", "Canola", "Barley", "Pasture", "Other"];
export default function SeasonPlanner() {
    const {currentSeason}=useSeason();
    const [tab, setTab] = useState<Tab>("overview"), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
    const [fields, setFields] = useState<Field[]>([]), [inventory, setInventory] = useState<InventoryItem[]>([]), [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]), [productRequests, setProductRequests] = useState<ProductRequest[]>([]), [operations, setOperations] = useState<Operation[]>([]), [standards, setStandards] = useState<StandardActivity[]>([]), [templates, setTemplates] = useState<CropTemplate[]>([]), [activities, setActivities] = useState<TemplateActivity[]>([]), [lines, setLines] = useState<TemplateLine[]>([]), [plans, setPlans] = useState<ActivityPlan[]>([]), [products, setProducts] = useState<ActivityPlanProduct[]>([]), [planOps, setPlanOps] = useState<PlanOperation[]>([]), [farmers, setFarmers] = useState<Farmer[]>([]), [farms, setFarms] = useState<Farm[]>([]), [cultivars, setCultivars] = useState<Cultivar[]>([]), [mapLayers, setMapLayers] = useState<MapLayer[]>([]);
    const [season, setSeason] = useState("2026/2027"), [selectedTemplate, setSelectedTemplate] = useState(""), [selectedActivity, setSelectedActivity] = useState(""), [selectedFields, setSelectedFields] = useState<string[]>([]), [plantingDate, setPlantingDate] = useState("");
    const [templateForm, setTemplateForm] = useState({ name: "", crop: "Maize", season: "2026/2027", description: "" }), [activityForm, setActivityForm] = useState({ standard_id: "", due_date: "", notes: "" }), [lineForm, setLineForm] = useState({ type: "Product" as "Product" | "Operation", item_id: "", rate: "", unit: "L", price: "" });
    const [showNewActivity, setShowNewActivity] = useState(false), [newActivityForm, setNewActivityForm] = useState({ name: "", category: "Spraying", due_date: "", notes: "" });
    const [showNewItem, setShowNewItem] = useState(false), [newProductForm, setNewProductForm] = useState({ name: "", manufacturer: "", category: "Chemical", unit: "L", price: "" }), [newOperationForm, setNewOperationForm] = useState({ name: "", category: "Contractor", unit: "ha", price: "", supplier: "" });
    const [replaceForm, setReplaceForm] = useState({ type: "Product" as "Product" | "Operation", action: "Alter" as "Alter" | "Add" | "Remove", from_id: "", to_id: "", rate: "" });
    const [selectedReplacePlanIds, setSelectedReplacePlanIds] = useState<string[]>([]);
    const [excelRows, setExcelRows] = useState<PlanningImportRow[]>([]), [excelFileName, setExcelFileName] = useState("");
    const [modificationRules, setModificationRules] = useState<ModificationRule[]>([]);
    const [layerForm, setLayerForm] = useState({ field_id: "", season: "2026/2027", layer_type: "Planting", source: "File upload", captured_date: "" }), [layerFile, setLayerFile] = useState<File | null>(null);
    async function load() {
        if(!currentSeason)return;
        setLoading(true);
        const q = await Promise.all([
            supabase.from("fields").select("*").eq("season",currentSeason).order("farm_name").order("field_name"), supabase.from("inventory_items").select("*").eq("season",currentSeason).eq("status", "Active").order("name"), supabase.from("standard_operations").select("*").eq("active", true).order("name"), supabase.from("activity_templates").select("*").eq("active", true).order("category").order("name"), supabase.from("crop_templates").select("*").eq("active", true).order("name"), supabase.from("crop_template_activities").select("*").order("sequence_no"), supabase.from("crop_template_lines").select("*").order("created_at"), supabase.from("activity_plans").select("*").eq("season",currentSeason).order("planned_date"), supabase.from("activity_plan_products").select("*").order("created_at"), supabase.from("activity_plan_operations").select("*").order("created_at"), supabase.from("farmers").select("*").eq("active", true).order("name"), supabase.from("farms").select("*").eq("active", true).order("name"), supabase.from("cultivars").select("*").eq("active", true).order("crop").order("name"), supabase.from("map_layers").select("*").eq("season",currentSeason).order("created_at", { ascending: false }), supabase.from("master_products").select("id,catalogue_code,name,category,product_class,crop_type,pack_unit,manufacturer").eq("status", "Approved").order("category").order("name"), supabase.from("product_requests").select("id,requested_name,manufacturer,category,product_class,crop_type,pack_unit,status,resolved_product_id").eq("status", "Pending").order("created_at", { ascending: false })
        ]);
        setFields((q[0].data || []) as Field[]);
        setInventory((q[1].data || []) as InventoryItem[]);
        setOperations((q[2].data || []) as Operation[]);
        setStandards((q[3].data || []) as StandardActivity[]);
        setTemplates((q[4].data || []) as CropTemplate[]);
        setActivities((q[5].data || []) as TemplateActivity[]);
        setLines((q[6].data || []) as TemplateLine[]);
        setPlans((q[7].data || []) as ActivityPlan[]);
        setProducts((q[8].data || []) as ActivityPlanProduct[]);
        setPlanOps((q[9].data || []) as PlanOperation[]);
        setFarmers((q[10].data || []) as Farmer[]);
        setFarms((q[11].data || []) as Farm[]);
        setCultivars((q[12].data || []) as Cultivar[]);
        setMapLayers((q[13].data || []) as MapLayer[]);
        setMasterProducts((q[14].data || []) as MasterProduct[]);
        setProductRequests((q[15].data || []) as ProductRequest[]);
        const ts = (q[4].data || []) as CropTemplate[];
        if (!selectedTemplate && ts[0])
            setSelectedTemplate(ts[0].id);
        setLoading(false);
    }
    useEffect(() => {if(!currentSeason)return;setSeason(currentSeason);setTemplateForm(value=>({...value,season:currentSeason}));setLayerForm(value=>({...value,season:currentSeason}));void load(); }, [currentSeason]);
    const seasonPlans = plans.filter(x => x.season === season), templateActivities = activities.filter(x => x.crop_template_id === selectedTemplate), selectedTemplateRow = templates.find(x => x.id === selectedTemplate), selectedActivityRow = activities.find(x => x.id === selectedActivity);
    const catalogueProducts: MasterProduct[] = [...masterProducts, ...productRequests.map(request => ({ id: `request:${request.id}`, catalogue_code: "PENDING", name: request.requested_name, category: request.category, pack_unit: request.pack_unit, manufacturer: request.manufacturer, product_request_id: request.id, custom: true }))];
    const totals = useMemo(() => seasonPlans.reduce((a, p) => ({ budget: a.budget + Number(p.planned_total || 0), area: a.area + Number(p.planned_area_ha || 0) }), { budget: 0, area: 0 }), [seasonPlans]);
    const pendingPlanIds = new Set(seasonPlans.filter(x => x.status === "Planned").map(x => x.id));
    const plannedFieldIds = new Set(seasonPlans.map(x => x.field_id));
    const plannedProductIds = new Set(products.filter(x => pendingPlanIds.has(x.plan_id)).map(x => x.master_product_id).filter(Boolean));
    const plannedOperationIds = new Set(planOps.filter(x => pendingPlanIds.has(x.plan_id)).map(x => x.operation_id).filter(Boolean));
    const findOptions = replaceForm.type === "Product"
        ? masterProducts.filter(x => plannedProductIds.has(x.id)).map(x => [x.id, `${x.name} · ${x.category}`])
        : operations.filter(x => plannedOperationIds.has(x.id)).map(x => [x.id, x.name]);
    const replacementOptions = replaceForm.type === "Product"
        ? masterProducts.map(x => [x.id, `${x.name} · ${x.category}`])
        : operations.map(x => [x.id, `${x.name} · ${money.format(Number(x.unit_cost || 0))}/${x.unit}`]);
    const matchingReplacePlans = seasonPlans.filter(plan => {
        if (plan.status !== "Planned" || !replaceForm.from_id)
            return false;
        return replaceForm.type === "Product"
            ? products.some(row => row.plan_id === plan.id && row.master_product_id === replaceForm.from_id)
            : planOps.some(row => row.plan_id === plan.id && row.operation_id === replaceForm.from_id);
    });
    async function userId() { const { data } = await supabase.auth.getSession(); return data.session?.user.id || null; }
    async function addTemplate() { const user_id = await userId(); if (!user_id || !templateForm.name.trim() || !templateForm.crop.trim())
        return alert("Enter a template name and crop."); setSaving(true); const { data, error } = await supabase.from("crop_templates").insert({ user_id, name: templateForm.name.trim(), crop: templateForm.crop.trim(), season: templateForm.season.trim() || null, description: templateForm.description.trim() || null }).select("id").single(); setSaving(false); if (error)
        return alert(error.message); if (data)
        setSelectedTemplate(data.id); setTemplateForm({ ...templateForm, name: "", description: "" }); await load(); }
    async function addActivity() { const user_id = await userId(), standard = standards.find(x => x.id === activityForm.standard_id); if (!user_id || !selectedTemplate || !standard || !activityForm.due_date)
        return alert("Choose an activity and its due date."); setSaving(true); const { data, error } = await supabase.from("crop_template_activities").insert({ user_id, crop_template_id: selectedTemplate, activity_template_id: standard.id, name: standard.name, category: standard.category, sequence_no: templateActivities.length + 1, days_after_planting: 0, due_date: activityForm.due_date, notes: activityForm.notes.trim() || null }).select("id").single(); setSaving(false); if (error)
        return alert(error.message); if (data)
        setSelectedActivity(data.id); setActivityForm({ standard_id: "", due_date: "", notes: "" }); await load(); }
    async function createActivityInTemplate() {
        const user_id = await userId();
        if (!user_id || !selectedTemplate || !newActivityForm.name.trim() || !newActivityForm.due_date)
            return alert("Enter an activity name and due date.");
        setSaving(true);
        try {
            const activityName = newActivityForm.name.trim();
            const existing = standards.find(item => item.name.trim().toLowerCase() === activityName.toLowerCase());
            let standard: StandardActivity | null = existing || null;
            if (!standard) {
                const { data, error: standardError } = await supabase.from("activity_templates").insert({ user_id, name: activityName, category: newActivityForm.category, description: newActivityForm.notes.trim() || null }).select("id,name,category").single();
                if (standardError || !data)
                    throw standardError || new Error("Activity could not be created.");
                standard = data as StandardActivity;
            }
            const { data: activity, error: activityError } = await supabase.from("crop_template_activities").insert({ user_id, crop_template_id: selectedTemplate, activity_template_id: standard.id, name: standard.name, category: standard.category, sequence_no: templateActivities.length + 1, days_after_planting: 0, due_date: newActivityForm.due_date, notes: newActivityForm.notes.trim() || null }).select("id").single();
            if (activityError || !activity)
                throw activityError || new Error("Activity could not be added to the template.");
            setSelectedActivity(activity.id);
            setNewActivityForm({ name: "", category: "Spraying", due_date: "", notes: "" });
            setShowNewActivity(false);
            await load();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "Activity could not be created.";
            alert(message);
        }
        finally {
            setSaving(false);
        }
    }
    async function createMissingItem() {
        const user_id = await userId();
        if (!user_id || !selectedActivity)
            return;
        setSaving(true);
        try {
            if (lineForm.type === "Product") {
                if (!newProductForm.name.trim())
                    throw new Error("Enter the missing product name.");
                const { data, error } = await supabase.from("product_requests").insert({ user_id, requested_name: newProductForm.name.trim(), manufacturer: newProductForm.manufacturer.trim() || null, category: newProductForm.category, pack_unit: newProductForm.unit, private_unit_cost: Number(newProductForm.price || 0), status: "Pending" }).select("id").single();
                if (error || !data)
                    throw error || new Error("Product request could not be created.");
                setLineForm({ ...lineForm, item_id: `request:${data.id}`, unit: newProductForm.unit, price: newProductForm.price });
                setNewProductForm({ name: "", manufacturer: "", category: "Chemical", unit: "L", price: "" });
            }
            else {
                if (!newOperationForm.name.trim())
                    throw new Error("Enter the custom operation name.");
                const { data, error } = await supabase.from("standard_operations").insert({ user_id, name: newOperationForm.name.trim(), category: newOperationForm.category, unit: newOperationForm.unit, unit_cost: Number(newOperationForm.price || 0), supplier: newOperationForm.supplier.trim() || null }).select("id").single();
                if (error || !data)
                    throw error || new Error("Operation could not be created.");
                setLineForm({ ...lineForm, item_id: data.id, unit: newOperationForm.unit, price: newOperationForm.price });
                setNewOperationForm({ name: "", category: "Contractor", unit: "ha", price: "", supplier: "" });
            }
            setShowNewItem(false);
            await load();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "Item could not be created.";
            alert(message);
        }
        finally {
            setSaving(false);
        }
    }
    async function renameTemplate() { if (!selectedTemplateRow)
        return; const name = window.prompt("Activity template name", selectedTemplateRow.name)?.trim(); if (!name || name === selectedTemplateRow.name)
        return; const { error } = await supabase.from("crop_templates").update({ name }).eq("id", selectedTemplateRow.id); if (error)
        return alert(error.message); await load(); }
    async function deleteTemplate() { if (!selectedTemplateRow || !window.confirm(`Delete ${selectedTemplateRow.name} and all activities inside it?`))
        return; const { error } = await supabase.from("crop_templates").delete().eq("id", selectedTemplateRow.id); if (error)
        return alert(error.message); setSelectedTemplate(""); setSelectedActivity(""); await load(); }
    async function editTemplateActivity() { if (!selectedActivityRow)
        return; const name = window.prompt("Activity name", selectedActivityRow.name)?.trim(); if (!name)
        return; const due_date = window.prompt("Due date (YYYY-MM-DD)", selectedActivityRow.due_date || "")?.trim(); if (!due_date)
        return; const { error } = await supabase.from("crop_template_activities").update({ name, due_date }).eq("id", selectedActivityRow.id); if (error)
        return alert(error.message); await load(); }
    async function deleteTemplateActivity() { if (!selectedActivityRow || !window.confirm(`Delete ${selectedActivityRow.name} from this template?`))
        return; const { error } = await supabase.from("crop_template_activities").delete().eq("id", selectedActivityRow.id); if (error)
        return alert(error.message); setSelectedActivity(""); await load(); }
    async function addLine() { const user_id = await userId(); if (!user_id || !selectedActivity || !lineForm.item_id || Number(lineForm.rate) <= 0)
        return alert("Choose an item, rate and unit."); const product = catalogueProducts.find(x => x.id === lineForm.item_id), operation = operations.find(x => x.id === lineForm.item_id), item = lineForm.type === "Product" ? product : operation; if (!item)
        return; const stock = lineForm.type === "Product" && !product?.custom ? inventory.find(x => x.master_product_id === item.id) : null, unit = lineForm.unit || (lineForm.type === "Product" ? (product?.pack_unit || stock?.unit || "unit") : (operation?.unit || "ha")), inventoryPrice = Number(stock?.unit_cost || 0), price = lineForm.type === "Product" ? (inventoryPrice > 0 ? inventoryPrice : Number(lineForm.price || 0)) : Number(lineForm.price || operation?.unit_cost || 0); setSaving(true); const { error } = await supabase.from("crop_template_lines").insert({ user_id, template_activity_id: selectedActivity, line_type: lineForm.type, inventory_item_id: stock?.id || null, master_product_id: lineForm.type === "Product" && !product?.custom ? item.id : null, product_request_id: lineForm.type === "Product" ? product?.product_request_id || null : null, operation_id: lineForm.type === "Operation" ? item.id : null, item_name: item.name, unit, rate_per_ha: Number(lineForm.rate), planned_unit_price: price }); setSaving(false); if (error)
        return alert(error.message); setLineForm({ ...lineForm, item_id: "", rate: "", unit: "L", price: "" }); await load(); }
    async function assignProgramme() {
        const user_id = await userId();
        if (!user_id || !selectedTemplateRow || !plantingDate || !selectedFields.length)
            return alert("Choose a template, planting/start date and at least one field.");
        if (!templateActivities.length)
            return alert("This crop template has no activities yet.");
        const replacingCount = selectedFields.filter(id => plannedFieldIds.has(id)).length;
        if (replacingCount && !window.confirm(`${replacingCount} selected field${replacingCount === 1 ? " already has" : "s already have"} a Crop Plan for ${season}. Replace the outstanding planned activities with ${selectedTemplateRow.name}? Actualised activities will be kept.`))
            return;
        const allTemplateLines = lines.filter(x => templateActivities.some(a => a.id === x.template_activity_id));
        const seedProduct = allTemplateLines.map(x => catalogueProducts.find(p => p.id === x.master_product_id || p.product_request_id === x.product_request_id)).find(p => p?.category.toLowerCase().includes("seed"));
        const seedCultivar = seedProduct ? cultivars.find(c => seedProduct.name.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(seedProduct.name.toLowerCase())) : undefined;
        setSaving(true);
        try {
            for (const fieldId of selectedFields) {
                const field = fields.find(x => x.id === fieldId);
                if (!field)
                    continue;
                const cultivar = seedCultivar;
                const resolvedCrop = cultivar?.crop || selectedTemplateRow.crop;
                const farm = farms.find(x => x.id === field.farm_id || x.name === field.farm_name), farmer = farmers.find(x => x.id === field.farmer_id || x.id === farm?.farmer_id);
                const oldPlannedIds = seasonPlans.filter(x => x.field_id === field.id && x.status === "Planned").map(x => x.id);
                if (oldPlannedIds.length) {
                    const { error: deleteError } = await supabase.from("activity_plans").delete().in("id", oldPlannedIds);
                    if (deleteError)
                        throw deleteError;
                }
                await supabase.from("fields").update({ cultivar_id: cultivar?.id || null, cultivar: cultivar?.name || null, crop: resolvedCrop, season }).eq("id", field.id);
                for (const activity of templateActivities) {
                    const activityLines = lines.filter(x => x.template_activity_id === activity.id), date = activity.due_date ? new Date(`${activity.due_date}T12:00:00`) : new Date(`${plantingDate}T12:00:00`);
                    if (!activity.due_date)
                        date.setDate(date.getDate() + activity.days_after_planting);
                    let total = 0;
                    const productRows = activityLines.filter(x => x.line_type === "Product").map(x => { const item = catalogueProducts.find(i => i.id === x.master_product_id || i.product_request_id === x.product_request_id), stock = !item?.custom ? inventory.find(i => i.master_product_id === item?.id) : undefined, qty = Number(x.rate_per_ha) * Number(field.area_ha), price = Number(stock?.unit_cost || x.planned_unit_price || 0), cost = qty * price; total += cost; return { x, item, stock, qty, price, cost }; });
                    const operationRows = activityLines.filter(x => x.line_type === "Operation").map(x => { const item = operations.find(i => i.id === x.operation_id), qty = Number(x.rate_per_ha) * Number(field.area_ha), cost = qty * Number(item?.unit_cost || 0); total += cost; return { x, item, qty, cost }; });
                    const { data: plan, error } = await supabase.from("activity_plans").insert({ user_id, field_id: field.id, crop_template_id: selectedTemplateRow.id, template_activity_id: activity.id, activity_template_id: activity.activity_template_id, farmer_id: farmer?.id || null, farm_id: farm?.id || null, cultivar_id: cultivar?.id || null, farmer_name: farmer?.name || "Farmer", farm_name: field.farm_name || farm?.name || "Main farm", field_name: field.field_name, activity_type: activity.name, crop: resolvedCrop, cultivar: cultivar?.name || null, season, planned_date: date.toISOString().slice(0, 10), planned_area_ha: field.area_ha, status: "Planned", notes: activity.notes, planned_total: Number(total.toFixed(2)) }).select("id").single();
                    if (error || !plan)
                        throw error || new Error("Plan could not be created");
                    if (productRows.length) {
                        const { error: e } = await supabase.from("activity_plan_products").insert(productRows.map(r => ({ user_id, plan_id: plan.id, inventory_item_id: r.stock?.id || null, master_product_id: r.item?.custom ? null : r.item!.id, product_request_id: r.item?.product_request_id || null, product_name: r.item!.name, unit: r.x.unit || r.item!.pack_unit || r.stock?.unit || "unit", planned_rate_per_ha: r.x.rate_per_ha, planned_quantity: r.qty, planned_unit_price: r.price, planned_cost: Number(r.cost.toFixed(2)) })));
                        if (e)
                            throw e;
                    }
                    if (operationRows.length) {
                        const { error: e } = await supabase.from("activity_plan_operations").insert(operationRows.map(r => ({ user_id, plan_id: plan.id, operation_id: r.item!.id, operation_name: r.item!.name, unit: r.item!.unit, planned_rate_per_ha: r.x.rate_per_ha, planned_quantity: r.qty, planned_unit_price: Number(r.item!.unit_cost || 0), planned_cost: Number(r.cost.toFixed(2)) })));
                        if (e)
                            throw e;
                    }
                }
            }
            alert(`Activity template assigned to ${selectedFields.length} field${selectedFields.length === 1 ? "" : "s"}.`);
            setSelectedFields([]);
            await load();
            setTab("overview");
        }
        catch (error) {
            alert(error instanceof Error ? error.message : "Programme could not be assigned.");
        }
        finally {
            setSaving(false);
        }
    }
    function addModificationRule() {
        if (!replaceForm.from_id) return alert("First search for the item used to find matching activities.");
        if (replaceForm.action !== "Remove" && !replaceForm.to_id) return alert("Choose the item to add or use as the replacement.");
        if (replaceForm.action === "Add" && Number(replaceForm.rate) <= 0) return alert("Enter the rate per hectare for the item being added.");
        setModificationRules(rules => [...rules, { ...replaceForm, id: crypto.randomUUID() }]);
        setReplaceForm(form => ({ ...form, action: "Alter", to_id: "", rate: "" }));
    }
    async function replaceItems() {
        const targetPlans = seasonPlans.filter(x => x.status === "Planned" && selectedReplacePlanIds.includes(x.id));
        const targetIds = targetPlans.map(x => x.id);
        if (!targetIds.length)
            return alert("Select at least one matching field activity.");
        const rulesToApply: ModificationRule[] = modificationRules.length ? modificationRules : [{ ...replaceForm, id: "single" }];
        if (rulesToApply.some(rule => !rule.from_id || (rule.action !== "Remove" && !rule.to_id)))
            return alert("Complete the modification rule before applying it.");
        setSaving(true);
        try {
          for (const rule of rulesToApply) {
            const replaceForm = rule;
            if (replaceForm.type === "Product") {
                const matching = products.filter(x => targetIds.includes(x.plan_id) && x.master_product_id === replaceForm.from_id);
                if (replaceForm.action === "Remove") {
                    const { error } = await supabase.from("activity_plan_products").delete().in("id", matching.map(x => x.id));
                    if (error) throw error;
                }
                else {
                    const item = masterProducts.find(x => x.id === replaceForm.to_id);
                    if (!item) throw new Error("The selected product was not found in the CropNex catalogue.");
                    const stock = inventory.find(x => x.master_product_id === item.id);
                    if (replaceForm.action === "Alter") {
                        for (const row of matching) {
                            const plan = targetPlans.find(x => x.id === row.plan_id)!, rate = Number(replaceForm.rate || row.planned_rate_per_ha), qty = rate * Number(plan.planned_area_ha), price = Number(stock?.unit_cost || row.planned_unit_price || 0), cost = qty * price;
                            const { error } = await supabase.from("activity_plan_products").update({ master_product_id: item.id, inventory_item_id: stock?.id || null, product_name: item.name, unit: item.pack_unit || stock?.unit || "unit", planned_rate_per_ha: rate, planned_quantity: qty, planned_unit_price: price, planned_cost: cost }).eq("id", row.id);
                            if (error) throw error;
                        }
                    }
                    else {
                        const user_id = await userId();
                        if (!user_id) throw new Error("Sign in first.");
                        const rate = Number(replaceForm.rate), price = Number(stock?.unit_cost || 0);
                        const rows = targetPlans.map(plan => ({ user_id, plan_id: plan.id, inventory_item_id: stock?.id || null, master_product_id: item.id, product_name: item.name, unit: item.pack_unit || stock?.unit || "unit", planned_rate_per_ha: rate, planned_quantity: rate * Number(plan.planned_area_ha), planned_unit_price: price, planned_cost: rate * Number(plan.planned_area_ha) * price }));
                        const { error } = await supabase.from("activity_plan_products").insert(rows);
                        if (error) throw error;
                    }
                    if (item.category.toLowerCase().includes("seed")) {
                    const cultivar = cultivars.find(c => item.name.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(item.name.toLowerCase()));
                    if (cultivar) {
                            const fieldIds = targetPlans.map(x => x.field_id);
                            await supabase.from("activity_plans").update({ cultivar_id: cultivar.id, cultivar: cultivar.name, crop: cultivar.crop }).in("id", targetIds);
                        if (fieldIds.length)
                            await supabase.from("fields").update({ cultivar_id: cultivar.id, cultivar: cultivar.name, crop: cultivar.crop, season }).in("id", fieldIds);
                    }
                }
                }
            }
            else {
                const matching = planOps.filter(x => targetIds.includes(x.plan_id) && x.operation_id === replaceForm.from_id);
                if (replaceForm.action === "Remove") {
                    const { error } = await supabase.from("activity_plan_operations").delete().in("id", matching.map(x => x.id));
                    if (error) throw error;
                }
                else {
                    const item = operations.find(x => x.id === replaceForm.to_id);
                    if (!item) throw new Error("The selected operation was not found.");
                    if (replaceForm.action === "Alter") {
                        for (const row of matching) {
                            const plan = targetPlans.find(x => x.id === row.plan_id)!, rate = Number(replaceForm.rate || row.planned_rate_per_ha), qty = rate * Number(plan.planned_area_ha), cost = qty * Number(item.unit_cost || 0);
                            const { error } = await supabase.from("activity_plan_operations").update({ operation_id: item.id, operation_name: item.name, unit: item.unit, planned_rate_per_ha: rate, planned_quantity: qty, planned_unit_price: item.unit_cost, planned_cost: cost }).eq("id", row.id);
                            if (error) throw error;
                        }
                    }
                    else {
                        const user_id = await userId();
                        if (!user_id) throw new Error("Sign in first.");
                        const rate = Number(replaceForm.rate);
                        const rows = targetPlans.map(plan => ({ user_id, plan_id: plan.id, operation_id: item.id, operation_name: item.name, unit: item.unit, planned_rate_per_ha: rate, planned_quantity: rate * Number(plan.planned_area_ha), planned_unit_price: Number(item.unit_cost || 0), planned_cost: rate * Number(plan.planned_area_ha) * Number(item.unit_cost || 0) }));
                        const { error } = await supabase.from("activity_plan_operations").insert(rows);
                        if (error) throw error;
                    }
                }
            }
          }
            const { data: latestProducts } = await supabase.from("activity_plan_products").select("*").in("plan_id", targetIds), { data: latestOps } = await supabase.from("activity_plan_operations").select("*").in("plan_id", targetIds);
                for (const id of targetIds) {
                    const total = [...(latestProducts || []), ...(latestOps || [])].filter((x: {
                        plan_id: string;
                    }) => x.plan_id === id).reduce((s: number, x: {
                        planned_cost: number;
                    }) => s + Number(x.planned_cost || 0), 0);
                    await supabase.from("activity_plans").update({ planned_total: total }).eq("id", id);
                }
            alert(`${rulesToApply.length} modification ${rulesToApply.length === 1 ? "rule" : "rules"} applied to ${targetIds.length} selected planned ${targetIds.length === 1 ? "activity" : "activities"}.`);
            setSelectedReplacePlanIds([]);
            setModificationRules([]);
            await load();
        }
        catch (error) {
            alert(error instanceof Error ? error.message : "Replacement failed.");
        }
        finally {
            setSaving(false);
        }
    }
    async function uploadLayer() { const user_id = await userId(), field = fields.find(x => x.id === layerForm.field_id); if (!user_id || !layerFile)
        return alert("Choose a layer file."); const allowed = ["zip", "geojson", "json", "kml", "tif", "tiff", "csv", "isoxml"], extension = layerFile.name.split(".").pop()?.toLowerCase() || ""; if (!allowed.includes(extension))
        return alert("Upload ZIP shapefiles, GeoJSON, KML, GeoTIFF, CSV or ISOXML files."); setSaving(true); const path = `${user_id}/${Date.now()}-${layerFile.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`; const { error: uploadError } = await supabase.storage.from("agcore-layers").upload(path, layerFile); if (uploadError) {
        setSaving(false);
        return alert(uploadError.message);
    } const farm = farms.find(x => x.name === field?.farm_name), farmer = farmers.find(x => x.id === farm?.farmer_id); const { error } = await supabase.from("map_layers").insert({ user_id, field_id: field?.id || null, farmer_name: farmer?.name || null, farm_name: field?.farm_name || null, field_name: field?.field_name || null, season: layerForm.season, layer_type: layerForm.layer_type, source: layerForm.source, captured_date: layerForm.captured_date || null, file_name: layerFile.name, storage_path: path, file_format: extension.toUpperCase(), status: "Uploaded" }); setSaving(false); if (error)
        return alert(error.message); setLayerFile(null); await load(); alert("Layer uploaded and registered. It is ready for map processing."); }
    async function exportExcelPlan() {
        const catalogue = masterProducts.map(product => ({ ...product, inventory_price: Number(inventory.find(item => item.master_product_id === product.id)?.unit_cost || 0) }));
        await downloadPlanningWorkbook({ season, fields, plans: seasonPlans, products, planOperations: planOps, catalogue, operations, activities: standards.map(x => x.name) });
    }
    async function previewExcelPlan(file: File) {
        try { const rows = await readPlanningWorkbook(file); const knownFields = new Set(fields.map(x => `${x.farm_name || "Unassigned"} · ${x.field_name}`)); const knownActivities = new Set(standards.map(x => x.name)); const knownProducts = new Set(masterProducts.map(x => x.name)); const knownOperations = new Set(operations.map(x => x.name));
            rows.forEach(row => { if (row.action !== "Keep" && !knownFields.has(row.fieldLabel)) row.errors.push("Field is not in CropNex."); if (["Add", "Update"].includes(row.action) && !knownActivities.has(row.activity)) row.errors.push("Activity is not in your CropNex activity templates."); if (row.inputType === "Product" && !row.customProduct && !knownProducts.has(row.item)) row.errors.push("Product is not in the CropNex catalogue or New Products sheet."); if (row.inputType === "Operation" && !knownOperations.has(row.item)) row.errors.push("Operation is not in the standard list."); if (row.action === "Update" && !row.planId) row.errors.push("Update requires an existing Plan ID."); });
            setExcelRows(rows); setExcelFileName(file.name);
        } catch (error) { alert(error instanceof Error ? error.message : "Workbook could not be read."); }
    }
    async function applyExcelPlan() {
        const changed = excelRows.filter(x => x.action !== "Keep"); if (!changed.length) return alert("No Add, Update or Delete rows were found."); if (changed.some(x => x.errors.length)) return alert("Fix the highlighted workbook rows and upload it again.");
        const user_id = await userId(); if (!user_id) return; setSaving(true);
        try {
            const touched = new Set<string>(), customRequestIds = new Map<string, string>();
            for (const row of changed.filter(x => x.customProduct)) { const product = row.customProduct!, key = product.name.toLowerCase(); if (customRequestIds.has(key)) continue; const existing = productRequests.find(request => request.requested_name.toLowerCase() === key); if (existing) { customRequestIds.set(key, existing.id); continue; } const { data, error } = await supabase.from("product_requests").insert({ user_id, requested_name: product.name, manufacturer: product.manufacturer || null, category: product.category, product_class: product.category, crop_type: product.cropType || null, pack_unit: product.unit, registration_number: product.registrationNumber || null, private_unit_cost: 0, status: "Pending" }).select("id").single(); if (error || !data) throw error || new Error(`Could not request ${product.name}.`); customRequestIds.set(key, data.id); }
            for (const row of changed.filter(x => x.action === "Delete")) { if (row.inputId) { const table = row.inputType === "Operation" ? "activity_plan_operations" : "activity_plan_products"; const { error } = await supabase.from(table).delete().eq("id", row.inputId); if (error) throw error; if (row.planId) touched.add(row.planId); } else if (row.planId) { const { error } = await supabase.from("activity_plans").delete().eq("id", row.planId).eq("status", "Planned"); if (error) throw error; } }
            for (const row of changed.filter(x => x.action === "Update")) { const field = fields.find(x => `${x.farm_name || "Farm"} · ${x.field_name}` === row.fieldLabel)!; const farm = farms.find(x => x.name === field.farm_name), farmer = farmers.find(x => x.id === farm?.farmer_id), seed = masterProducts.find(x => x.name === row.item && /seed|cultivar|hybrid/i.test(`${x.product_class || ""} ${x.category || ""}`)), customSeed = row.customProduct && /seed|cultivar|hybrid/i.test(row.customProduct.category) ? row.customProduct : null, crop = seed?.crop_type || customSeed?.cropType || field.crop, cultivar = seed?.name || customSeed?.name || field.cultivar; const { error } = await supabase.from("activity_plans").update({ field_id: field.id, farmer_id: farmer?.id || field.farmer_id || null, farm_id: farm?.id || field.farm_id || null, farmer_name: farmer?.name || "", farm_name: field.farm_name || "", field_name: field.field_name, activity_type: row.activity, crop, cultivar, season, planned_date: row.plannedDate, planned_area_ha: field.area_ha, notes: row.notes || null }).eq("id", row.planId).eq("status", "Planned"); if (error) throw error; if (seed || customSeed) await supabase.from("fields").update({ crop, cultivar, season }).eq("id", field.id); touched.add(row.planId); await upsertExcelInput(row, row.planId, field.area_ha, user_id, customRequestIds); }
            const groups = new Map<string, PlanningImportRow[]>(); changed.filter(x => x.action === "Add").forEach(row => { const key = `${row.fieldLabel}|${row.activity}|${row.plannedDate}`; groups.set(key, [...(groups.get(key) || []), row]); });
            for (const group of groups.values()) { const first = group[0], field = fields.find(x => `${x.farm_name || "Farm"} · ${x.field_name}` === first.fieldLabel)!; const farm = farms.find(x => x.name === field.farm_name), farmer = farmers.find(x => x.id === farm?.farmer_id), seedRow = group.find(row => row.inputType === "Product" && (masterProducts.some(product => product.name === row.item && /seed|cultivar|hybrid/i.test(`${product.product_class || ""} ${product.category || ""}`)) || Boolean(row.customProduct && /seed|cultivar|hybrid/i.test(row.customProduct.category)))), seed = masterProducts.find(product => product.name === seedRow?.item), customSeed = seedRow?.customProduct && /seed|cultivar|hybrid/i.test(seedRow.customProduct.category) ? seedRow.customProduct : null, crop = seed?.crop_type || customSeed?.cropType || field.crop, cultivar = seed?.name || customSeed?.name || field.cultivar; const { data, error } = await supabase.from("activity_plans").insert({ user_id, field_id: field.id, farmer_id: farmer?.id || field.farmer_id || null, farm_id: farm?.id || field.farm_id || null, farmer_name: farmer?.name || "", farm_name: field.farm_name || "", field_name: field.field_name, activity_type: first.activity, crop, cultivar, season, planned_date: first.plannedDate, planned_area_ha: field.area_ha, status: "Planned", notes: first.notes || null, planned_total: 0 }).select("id").single(); if (error) throw error; if (seed || customSeed) await supabase.from("fields").update({ crop, cultivar, season }).eq("id", field.id); for (const row of group) await upsertExcelInput(row, data.id, field.area_ha, user_id, customRequestIds); touched.add(data.id); }
            for (const planId of touched) { const [{ data: productData }, { data: operationData }] = await Promise.all([supabase.from("activity_plan_products").select("planned_cost").eq("plan_id", planId), supabase.from("activity_plan_operations").select("planned_cost").eq("plan_id", planId)]); const total = [...(productData || []), ...(operationData || [])].reduce((sum, row) => sum + Number(row.planned_cost || 0), 0); await supabase.from("activity_plans").update({ planned_total: total }).eq("id", planId); }
            const unpriced = changed.filter(row => row.inputType === "Product" && (row.customProduct || !inventory.some(item => item.master_product_id === masterProducts.find(product => product.name === row.item)?.id && Number(item.unit_cost || 0) > 0))).length;
            await load(); setExcelRows([]); setExcelFileName(""); alert(`${changed.length} workbook row${changed.length === 1 ? "" : "s"} applied successfully.${unpriced ? ` ${unpriced} product line${unpriced === 1 ? " is" : "s are"} waiting for a Shed price.` : ""}`);
        } catch (error) { alert(error instanceof Error ? error.message : "Excel plan could not be applied."); } finally { setSaving(false); }
    }
    async function upsertExcelInput(row: PlanningImportRow, planId: string, area: number, user_id: string, customRequestIds: Map<string, string>) {
        if (row.inputType === "None") return; const quantity = Number(row.rate) * Number(area);
        if (row.inputType === "Product") { const item = masterProducts.find(x => x.name === row.item), requestId = row.customProduct ? customRequestIds.get(row.customProduct.name.toLowerCase()) || null : null, stock = item ? inventory.find(x => x.master_product_id === item.id) : undefined, price = Number(stock?.unit_cost || 0), values = { user_id, plan_id: planId, inventory_item_id: stock?.id || null, master_product_id: item?.id || null, product_request_id: requestId, product_name: item?.name || row.customProduct?.name || row.item, unit: row.unit || item?.pack_unit || row.customProduct?.unit || stock?.unit || "unit", planned_rate_per_ha: row.rate, planned_quantity: quantity, planned_unit_price: price, planned_cost: quantity * price }; const query = row.inputId ? supabase.from("activity_plan_products").update(values).eq("id", row.inputId) : supabase.from("activity_plan_products").insert(values); const { error } = await query; if (error) throw error; }
        else { const item = operations.find(x => x.name === row.item)!; const price = Number(item.unit_cost || 0), values = { user_id, plan_id: planId, operation_id: item.id, operation_name: item.name, unit: row.unit || item.unit, planned_rate_per_ha: row.rate, planned_quantity: quantity, planned_unit_price: price, planned_cost: quantity * price }; const query = row.inputId ? supabase.from("activity_plan_operations").update(values).eq("id", row.inputId) : supabase.from("activity_plan_operations").insert(values); const { error } = await query; if (error) throw error; }
    }
    function exportCsv() { const header = ["Season", "Company Name", "Farm", "Crop", "Variety", "Field", "Input Type", "Input", "Activity Type", "Activity Name", "Application Rate", "Date Completed", "Cumulative Area (ha)", "Input Volume/Weight", "Unit", "Unit Cost", "Cost (Rand)"]; const rows: string[][] = []; for (const p of seasonPlans) {
        for (const x of products.filter(y => y.plan_id === p.id))
            rows.push([p.season, p.farmer_name, p.farm_name, p.crop || "", p.cultivar || "", p.field_name, "Product", x.product_name, p.status === "Actualised" ? "ActualActivity" : "PlannedActivity", p.activity_type, `${x.actual_rate_per_ha ?? x.planned_rate_per_ha} ${x.unit}/ha`, p.actual_date || "", String(p.planned_area_ha), String(x.actual_quantity ?? x.planned_quantity), x.unit, String(x.actual_unit_price ?? x.planned_unit_price), String(x.actual_cost ?? x.planned_cost)]);
        for (const x of planOps.filter(y => y.plan_id === p.id))
            rows.push([p.season, p.farmer_name, p.farm_name, p.crop || "", p.cultivar || "", p.field_name, "Operation", x.operation_name, p.status === "Actualised" ? "ActualActivity" : "PlannedActivity", p.activity_type, `${x.actual_rate_per_ha ?? x.planned_rate_per_ha} ${x.unit}/ha`, p.actual_date || "", String(p.planned_area_ha), String(x.actual_quantity ?? x.planned_quantity), x.unit, String(x.actual_unit_price ?? x.planned_unit_price), String(x.actual_cost ?? x.planned_cost)]);
    } const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(";")).join("\r\n"), blob = new Blob([csv], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `CropNex-${season.replace("/", "-")}-Farm-Plan.csv`; a.click(); URL.revokeObjectURL(url); }
    if (loading)
        return <main className="p-8 text-white">Opening the season planner…</main>;
    return <main className="min-h-screen bg-[#06100c] p-4 text-white md:p-7"><header className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="ag-kicker">Planning · Farm programme</p><h1 className="mt-1 text-3xl font-extrabold">Season Planner</h1><p className="mt-2 text-sm text-[#8d9d94]">Build once, assign to fields, adjust exceptions and measure planned versus actual.</p></div><div className="flex gap-2"><select className="field-input mt-0 w-auto" value={season} onChange={e => setSeason(e.target.value)}>{Array.from(new Set([season, ...templates.map(x => x.season || "").filter(Boolean), ...plans.map(x => x.season)])).map(x => <option key={x}>{x}</option>)}</select><button onClick={exportCsv} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold">CSV report</button></div></header><nav className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-white/[.06] bg-white/[.025] p-2">{tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${tab === id ? "bg-[#83c341] text-[#07130e]" : "text-[#92a198] hover:bg-white/5"}`}>{label}</button>)}</nav>
 {tab === "replace" && <section className="ag-panel mb-5 rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ag-kicker">Modification rules</p><h2 className="mt-1 text-lg font-bold">Create the rules you wish to apply</h2><p className="mt-1 text-xs text-[#829087]">Rules run from top to bottom on the selected field activities.</p></div><div className="flex gap-2"><button type="button" onClick={addModificationRule} className="rounded-xl border border-[#83c341]/40 px-4 py-2 text-sm font-black text-[#a4df57]">+ Add current rule</button><button type="button" onClick={replaceItems} disabled={saving||!selectedReplacePlanIds.length||!modificationRules.length} className="rounded-xl bg-[#83c341] px-4 py-2 text-sm font-black text-[#07130e] disabled:opacity-30">{saving?"Applying…":`Preview & apply ${modificationRules.length} rule${modificationRules.length===1?"":"s"}`}</button></div></div><div className="mt-4 space-y-2">{modificationRules.map((rule,index)=>{const source=rule.type==="Product"?masterProducts.find(x=>x.id===rule.from_id)?.name:operations.find(x=>x.id===rule.from_id)?.name,target=rule.type==="Product"?masterProducts.find(x=>x.id===rule.to_id)?.name:operations.find(x=>x.id===rule.to_id)?.name;return <div key={rule.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/20 p-3 text-sm"><span className="rounded-lg bg-white/[.06] px-2 py-1 text-xs font-black">{index+1}</span><b className="text-[#a4df57]">{rule.action} {rule.type}</b><span className="min-w-0 flex-1 truncate">{rule.action==="Add"?target:source}{rule.action==="Alter"?` → ${target}`:""}{rule.rate?` · ${rule.rate}/ha`:""}</span><button type="button" onClick={()=>setModificationRules(rows=>rows.filter(x=>x.id!==rule.id))} className="text-xs font-bold text-red-300">Remove rule</button></div>})}{!modificationRules.length&&<p className="rounded-xl bg-black/15 p-3 text-sm text-[#718278]">Configure an action below, then choose “Add current rule”. You can queue several product and operation changes.</p>}</div></section>}
 {tab === "overview" && <Overview season={season} plans={seasonPlans} products={products} operations={planOps} fields={fields} totals={totals}/>} 
 {tab === "excel" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><section className="space-y-5"><Panel title="1. Download simple farm plan"><p className="text-sm leading-6 text-[#93a39a]">One worksheet is created for each farm. Fields, activities, products, operations and units use controlled dropdowns. Crop type is detected from the selected seed.</p><p className="mt-3 text-xs leading-5 text-[#718278]">Prices are not entered in Excel. CropNex uses current Shed prices during import and flags anything still unpriced.</p><button type="button" onClick={exportExcelPlan} className="mt-4 w-full rounded-xl bg-[#83c341] px-4 py-3 font-black text-[#07130e]">Download Excel Farm Plan</button></Panel><Panel title="2. Upload completed workbook"><label className="field-label">CropNex workbook<input type="file" accept=".xlsx" className="field-input file:mr-3 file:rounded-lg file:border-0 file:bg-[#83c341] file:px-3 file:py-2 file:font-bold" onChange={event => { const file = event.target.files?.[0]; if (file) void previewExcelPlan(file); }}/></label>{excelFileName && <p className="mt-3 text-xs text-[#a4df57]">Previewing {excelFileName}</p>}<p className="mt-3 text-xs leading-5 text-[#718278]">Nothing is saved during upload. Review the changes first, then confirm.</p></Panel></section><section className="ag-panel rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ag-kicker">Import preview</p><h2 className="mt-1 text-xl font-bold">Planned changes</h2><p className="mt-1 text-sm text-[#829087]">Keep rows are ignored. Custom products become private pending catalogue requests.</p></div><button type="button" onClick={applyExcelPlan} disabled={saving || !excelRows.some(x => x.action !== "Keep") || excelRows.some(x => x.errors.length > 0)} className="rounded-xl bg-[#83c341] px-4 py-3 text-sm font-black text-[#07130e] disabled:opacity-30">{saving ? "Applying…" : "Confirm and apply changes"}</button></div><div className="mt-5 space-y-3">{excelRows.filter(x => x.action !== "Keep").map(row => <article key={`${row.sheet}-${row.row}`} className={`rounded-xl border p-4 ${row.errors.length ? "border-red-400/30 bg-red-400/[.06]" : "border-white/[.07] bg-black/15"}`}><div className="flex flex-wrap justify-between gap-2"><strong>{row.sheet} · Row {row.row} · {row.action}</strong><span className="text-xs text-[#829087]">{row.fieldLabel}</span></div><p className="mt-2 text-sm">{row.activity || "No activity"}{row.item ? ` · ${row.inputType}: ${row.item} · ${row.rate} ${row.unit}/ha` : ""}{row.customProduct ? " · Pending catalogue approval" : ""}</p>{row.errors.map(error => <p key={error} className="mt-1 text-xs font-bold text-red-300">{error}</p>)}</article>)}{excelRows.length > 0 && !excelRows.some(x => x.action !== "Keep") && <Empty text="The workbook contains no changes. Set Action to Add, Update or Delete for the rows you want CropNex to apply."/>}{excelRows.length === 0 && <Empty text="Upload an exported CropNex Farm Plan workbook to preview changes."/>}</div></section></div>}
 {tab === "templates" && <div className="grid gap-5 xl:grid-cols-[340px_1fr]"><aside className="space-y-5"><Panel title="New activity template"><Input label="Template name" value={templateForm.name} set={v => setTemplateForm({ ...templateForm, name: v })} placeholder="Sunflowers 2027"/><Select label="Crop type" value={templateForm.crop} set={v => setTemplateForm({ ...templateForm, crop: v })} options={cropTypes.map(crop => [crop, crop])}/><Input label="Season" value={templateForm.season} set={v => setTemplateForm({ ...templateForm, season: v })}/><Input label="Description" value={templateForm.description} set={v => setTemplateForm({ ...templateForm, description: v })}/><Primary onClick={addTemplate} disabled={saving}>Create template</Primary></Panel></aside><section><div className="mb-4 flex flex-wrap gap-2">{templates.map(x => <button key={x.id} onClick={() => { setSelectedTemplate(x.id); setSelectedActivity(""); }} className={`rounded-xl px-4 py-3 text-left ${selectedTemplate === x.id ? "bg-[#83c341] text-[#07130e]" : "ag-panel"}`}><strong>{x.name}</strong><span className="ml-2 text-xs opacity-70">{x.crop}</span></button>)}</div>{selectedTemplateRow ? <div className="space-y-4"><Panel title={`${selectedTemplateRow.name} programme`}><div className="mb-4 flex flex-wrap gap-2"><button type="button" onClick={renameTemplate} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">Rename template</button><button type="button" onClick={deleteTemplate} className="rounded-lg border border-red-400/25 px-3 py-2 text-xs font-bold text-red-300">Delete template</button><button type="button" onClick={() => setShowNewActivity(value => !value)} className="rounded-lg bg-[#83c341] px-3 py-2 text-xs font-black text-[#07130e]">+ Create new activity</button></div>{showNewActivity && <div className="mb-5 rounded-2xl border border-[#83c341]/25 bg-[#83c341]/[.06] p-4"><p className="mb-3 font-bold">Create activity inside {selectedTemplateRow.name}</p><div className="grid gap-3 md:grid-cols-2"><Input label="Activity name" value={newActivityForm.name} set={v => setNewActivityForm({ ...newActivityForm, name: v })} placeholder="Spray: Follow Up 1"/><Select label="Category" value={newActivityForm.category} set={v => setNewActivityForm({ ...newActivityForm, category: v })} options={[["Planting","Planting"],["Spraying","Spraying"],["Fertilising","Fertilising"],["Cultivation","Cultivation"],["Harvest","Harvest"],["Lease","Lease"],["Scouting","Scouting"],["Other","Other"]]}/><Input label="Due date" type="date" value={newActivityForm.due_date} set={v => setNewActivityForm({ ...newActivityForm, due_date: v })}/><Input label="Instructions" value={newActivityForm.notes} set={v => setNewActivityForm({ ...newActivityForm, notes: v })}/></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowNewActivity(false)} className="mt-4 rounded-xl border border-white/10 px-4 py-3 text-sm">Cancel</button><button type="button" onClick={createActivityInTemplate} disabled={saving} className="mt-4 rounded-xl bg-[#83c341] px-4 py-3 text-sm font-black text-[#07130e] disabled:opacity-40">{saving ? "Creating…" : "Create & add products"}</button></div></div>}<div className="grid gap-3 md:grid-cols-[1fr_150px_1fr_auto]"><Select label="Add an existing activity" value={activityForm.standard_id} set={v => setActivityForm({ ...activityForm, standard_id: v })} options={[["", "Choose activity"], ...standards.map(x => [x.id, `${x.category}: ${x.name}`])]}/><Input label="Due date" type="date" value={activityForm.due_date} set={v => setActivityForm({ ...activityForm, due_date: v })}/><Input label="Instructions" value={activityForm.notes} set={v => setActivityForm({ ...activityForm, notes: v })}/><div className="self-end"><Primary onClick={addActivity} disabled={saving}>Add activity</Primary></div></div></Panel>{templateActivities.map((a, index) => <article key={a.id} className={`ag-panel rounded-2xl p-5 ${selectedActivity === a.id ? "ring-1 ring-[#83c341]/50" : ""}`} onClick={() => setSelectedActivity(a.id)}><div className="flex justify-between"><div><p className="ag-kicker">{index + 1}. {a.category}</p><h3 className="mt-1 text-xl font-bold">{a.name}</h3><p className="mt-1 text-xs text-[#829087]">Due ${a.due_date || "Set when assigned"} {a.notes ? `· ${a.notes}` : ""}</p></div><div className="text-right"><span className="text-sm font-bold text-[#a4df57]">{lines.filter(x => x.template_activity_id === a.id).length} inputs</span>{selectedActivity === a.id && <div className="mt-2 flex gap-2"><button type="button" onClick={e => { e.stopPropagation(); void editTemplateActivity(); }} className="rounded-lg border border-white/10 px-2 py-1 text-xs">Edit</button><button type="button" onClick={e => { e.stopPropagation(); void deleteTemplateActivity(); }} className="rounded-lg border border-red-400/25 px-2 py-1 text-xs text-red-300">Delete</button></div>}</div></div><div className="mt-4 grid gap-2">{lines.filter(x => x.template_activity_id === a.id).map(x => <div key={x.id} className="flex justify-between rounded-xl bg-black/20 p-3 text-sm"><span><b className={x.line_type === "Product" ? "text-[#a4df57]" : "text-sky-300"}>{x.line_type}</b> · {x.item_name}</span><strong>{Number(x.rate_per_ha)} {x.unit}/ha</strong></div>)}</div>{selectedActivity === a.id && <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-[120px_minmax(240px,1fr)_120px_120px_150px_auto]"><Select label="Input type" value={lineForm.type} set={v => setLineForm({ ...lineForm, type: v as "Product" | "Operation", item_id: "", unit: v === "Product" ? "L" : "ha", price: "" })} options={[["Product", "Product"], ["Operation", "Operation"]]}/><SearchSelect label={lineForm.type} value={lineForm.item_id} set={v => { const stock = inventory.find(x => x.master_product_id === v); const product = catalogueProducts.find(x => x.id === v); const operation = operations.find(x => x.id === v); setLineForm({ ...lineForm, item_id: v, unit: lineForm.type === "Product" ? (product?.pack_unit || stock?.unit || "L") : (operation?.unit || "ha"), price: lineForm.type === "Product" ? String(stock?.unit_cost || "") : String(operation?.unit_cost || "") }); }} placeholder={lineForm.type === "Product" ? "Search the CropNex product catalogue…" : "Search operations…"} options={lineForm.type === "Product" ? catalogueProducts.map(x => [x.id, `${x.name} · ${x.category}${x.custom ? " · My pending request" : x.catalogue_code ? ` · ${x.catalogue_code}` : ""}`]) : operations.map(x => [x.id, `${x.name} · ${money.format(Number(x.unit_cost || 0))}/${x.unit}`])}/><Input label="Rate" type="number" value={lineForm.rate} set={v => setLineForm({ ...lineForm, rate: v })}/><Select label="Unit" value={lineForm.unit} set={v => setLineForm({ ...lineForm, unit: v })} options={[["L","L"],["kg","kg"],["g","g"],["mL","mL"],["bag","bag"],["seed","seed"],["ha","ha"],["hour","hour"],["km","km"],["each","each"]]}/><Input label="Temporary budget price / unit" type="number" value={lineForm.type === "Product" ? lineForm.price : String(operations.find(x => x.id === lineForm.item_id)?.unit_cost || "")} set={v => setLineForm({ ...lineForm, price: v })}/><div className="self-end"><Primary onClick={addLine} disabled={saving}>Add input</Primary></div><div className="md:col-span-full"><button type="button" onClick={() => setShowNewItem(value => !value)} className="text-sm font-bold text-[#a4df57]">Cannot find it? {lineForm.type === "Product" ? "Request a product" : "Create a custom operation"} →</button>{showNewItem && <div className="mt-3 rounded-xl border border-[#83c341]/25 bg-[#83c341]/[.05] p-4">{lineForm.type === "Product" ? <div className="grid gap-3 md:grid-cols-3"><Input label="Product name" value={newProductForm.name} set={v => setNewProductForm({ ...newProductForm, name: v })}/><Input label="Manufacturer" value={newProductForm.manufacturer} set={v => setNewProductForm({ ...newProductForm, manufacturer: v })}/><Select label="Category" value={newProductForm.category} set={v => setNewProductForm({ ...newProductForm, category: v })} options={[["Chemical","Chemical"],["Seed","Seed"],["Fertiliser","Fertiliser"],["Biological","Biological"],["Adjuvant","Adjuvant"],["Other","Other"]]}/><Select label="Unit" value={newProductForm.unit} set={v => setNewProductForm({ ...newProductForm, unit: v })} options={[["L","L"],["kg","kg"],["g","g"],["mL","mL"],["bag","bag"],["seed","seed"],["each","each"]]}/><Input label="Temporary budget price" type="number" value={newProductForm.price} set={v => setNewProductForm({ ...newProductForm, price: v })}/></div> : <div className="grid gap-3 md:grid-cols-3"><Input label="Operation name" value={newOperationForm.name} set={v => setNewOperationForm({ ...newOperationForm, name: v })}/><Select label="Category" value={newOperationForm.category} set={v => setNewOperationForm({ ...newOperationForm, category: v })} options={operationCategories.map(x => [x, x])}/><Select label="Cost unit" value={newOperationForm.unit} set={v => setNewOperationForm({ ...newOperationForm, unit: v })} options={[["ha","Per hectare"],["hour","Per hour"],["km","Per kilometre"],["tonne","Per tonne"],["load","Per load"],["activity","Fixed activity"]]}/><Input label="Budget price" type="number" value={newOperationForm.price} set={v => setNewOperationForm({ ...newOperationForm, price: v })}/><Input label="Supplier" value={newOperationForm.supplier} set={v => setNewOperationForm({ ...newOperationForm, supplier: v })}/></div>}<div className="flex justify-end"><button type="button" onClick={createMissingItem} disabled={saving} className="mt-3 rounded-xl bg-[#83c341] px-4 py-2 text-sm font-black text-[#07130e]">{lineForm.type === "Product" ? "Use product & send for approval" : "Create private operation"}</button></div></div>}</div></div>}</article>)}</div> : <Empty text="Create or select an activity template."/>}</section></div>}
 {tab === "assign" && <div className="grid gap-5 xl:grid-cols-[360px_1fr]"><Panel title="Assign complete field plan"><Select label="Activity template" value={selectedTemplate} set={setSelectedTemplate} options={[["", "Choose template"], ...templates.map(x => [x.id, `${x.name} · ${x.crop}`])]}/><Input label="Season" value={season} set={setSeason}/><Input label="Planting / programme start date" type="date" value={plantingDate} set={setPlantingDate}/><div className="mt-4 rounded-xl bg-[#83c341]/10 p-4 text-sm"><b>{templateActivities.length} activities</b><p className="mt-1 text-[#8fa098]">Dates are calculated from the start date. Crop and cultivar are taken from the template activities. Assigning to a field with a Crop Plan replaces its outstanding planned activities while keeping actualised history.</p></div><Primary onClick={assignProgramme} disabled={saving || !selectedFields.length}>{saving ? "Assigning…" : `Assign to ${selectedFields.length} field${selectedFields.length === 1 ? "" : "s"}`}</Primary></Panel><section className="ag-panel rounded-2xl p-5"><div className="mb-4 flex justify-between"><div><p className="ag-kicker">Field selection</p><h2 className="mt-1 text-xl font-bold">Choose destination fields</h2></div><button onClick={() => setSelectedFields(selectedFields.length === fields.length ? [] : fields.map(x => x.id))} className="text-sm font-bold text-[#a4df57]">{selectedFields.length === fields.length ? "Clear all" : "Select all"}</button></div><div className="grid gap-3 md:grid-cols-2">{fields.map(field => <label key={field.id} className={`rounded-xl border p-4 ${selectedFields.includes(field.id) ? "border-[#83c341]/50 bg-[#83c341]/10" : "border-white/[.07] bg-black/10"}`}><div className="flex gap-3"><input type="checkbox" checked={selectedFields.includes(field.id)} onChange={() => setSelectedFields(v => v.includes(field.id) ? v.filter(x => x !== field.id) : [...v, field.id])}/><div className="flex-1"><div className="flex justify-between"><strong>{field.field_name}</strong><span className="text-xs text-[#8d9d94]">{Number(field.area_ha).toFixed(2)} ha</span></div>{plannedFieldIds.has(field.id) && <span className="mt-2 inline-block rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-300">Crop Plan assigned · selecting will replace it</span>}<p className="mt-1 text-xs text-[#718278]">{field.farm_name || "Farm"} · {field.crop || selectedTemplateRow?.crop || "Crop"}</p></div></div></label>)}</div></section></div>}
 {tab === "replace" && <div className="grid gap-5 xl:grid-cols-[400px_1fr]"><Panel title="Find & Change"><p className="mb-4 text-sm text-[#8d9d94]">Find an item, select the exact field activities, then alter, add or remove an input. Actual records are never changed.</p><Select label="Find type" value={replaceForm.type} set={v => {setReplaceForm({ ...replaceForm, type: v as "Product" | "Operation", from_id: "", to_id: "" });setSelectedReplacePlanIds([])}} options={[["Product", "Product"], ["Operation", "Operation"]]}/><SearchSelect label="Find in current Field Plans" value={replaceForm.from_id} set={v => {setReplaceForm({ ...replaceForm, from_id: v });setSelectedReplacePlanIds([])}} placeholder="Search planned products or operations…" options={findOptions}/><Select label="Action" value={replaceForm.action} set={v => setReplaceForm({ ...replaceForm, action: v as "Alter" | "Add" | "Remove", to_id: "", rate: "" })} options={[["Alter","Alter existing item"],["Add","Add another item"],["Remove","Remove item"]]}/>{replaceForm.action!=="Remove"&&<SearchSelect label={replaceForm.action==="Add"?"Add":"Replace with"} value={replaceForm.to_id} set={v => setReplaceForm({ ...replaceForm, to_id: v })} placeholder={replaceForm.type==="Product"?"Search CropNex product catalogue…":"Search operations…"} options={replacementOptions}/>} {replaceForm.action!=="Remove"&&<Input label={replaceForm.action==="Add"?"Rate per hectare":"New rate per hectare (optional)"} type="number" value={replaceForm.rate} set={v => setReplaceForm({ ...replaceForm, rate: v })}/>}<div className="mt-4 rounded-xl bg-[#83c341]/10 p-3 text-sm"><b>{selectedReplacePlanIds.length}</b> of <b>{matchingReplacePlans.length}</b> matching activities selected.</div><Primary onClick={replaceItems} disabled={saving||!selectedReplacePlanIds.length}>{saving?"Applying…":`${replaceForm.action} selected activities`}</Primary></Panel><section className="ag-panel rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ag-kicker">Search results</p><h2 className="mt-1 text-xl font-bold">Matching field activities</h2><p className="mt-1 text-sm text-[#829087]">Only activities containing the item you searched for are shown.</p></div><button type="button" onClick={()=>setSelectedReplacePlanIds(selectedReplacePlanIds.length===matchingReplacePlans.length?[]:matchingReplacePlans.map(x=>x.id))} disabled={!matchingReplacePlans.length} className="text-sm font-bold text-[#a4df57] disabled:opacity-30">{selectedReplacePlanIds.length===matchingReplacePlans.length&&matchingReplacePlans.length?"Clear all":"Select all matches"}</button></div><div className="mt-5 space-y-3">{matchingReplacePlans.map(plan=>{const matchedProduct=products.find(x=>x.plan_id===plan.id&&x.master_product_id===replaceForm.from_id),matchedOperation=planOps.find(x=>x.plan_id===plan.id&&x.operation_id===replaceForm.from_id),matched=matchedProduct||matchedOperation;return <label key={plan.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selectedReplacePlanIds.includes(plan.id)?"border-[#83c341]/50 bg-[#83c341]/10":"border-white/[.07] bg-black/15"}`}><input type="checkbox" checked={selectedReplacePlanIds.includes(plan.id)} onChange={()=>setSelectedReplacePlanIds(ids=>ids.includes(plan.id)?ids.filter(id=>id!==plan.id):[...ids,plan.id])}/><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><strong>{plan.field_name} · {plan.activity_type}</strong><span className="text-xs text-[#829087]">{plan.planned_date}</span></div><p className="mt-1 text-xs text-[#829087]">{plan.farm_name} · {plan.crop||"Crop not set"}</p>{matched&&<p className="mt-2 text-sm text-[#a4df57]">{replaceForm.type==="Product"?(matched as ActivityPlanProduct).product_name:(matched as PlanOperation).operation_name} · {Number(matched.planned_rate_per_ha)} {matched.unit}/ha</p>}</div></label>})}{replaceForm.from_id&&!matchingReplacePlans.length&&<Empty text="No planned activities contain this item for the selected season."/>}{!replaceForm.from_id&&<Empty text="Search for a product or operation to see its matching field activities."/>}</div></section></div>}
 {tab === "layers" && <div className="grid gap-5 xl:grid-cols-[400px_1fr]"><Panel title="Upload spatial or machine data"><Select label="Field" value={layerForm.field_id} set={v => setLayerForm({ ...layerForm, field_id: v })} options={[["", "Whole farm / assign later"], ...fields.map(x => [x.id, `${x.farm_name || "Farm"} · ${x.field_name}`])]}/><Input label="Season" value={layerForm.season} set={v => setLayerForm({ ...layerForm, season: v })}/><Select label="Layer type" value={layerForm.layer_type} set={v => setLayerForm({ ...layerForm, layer_type: v })} options={layerTypes.map(x => [x, x])}/><Select label="Source" value={layerForm.source} set={v => setLayerForm({ ...layerForm, source: v })} options={[["File upload", "File upload"], ["John Deere Operations Center", "John Deere Operations Center"], ["Climate FieldView", "Climate FieldView"], ["Case IH FieldOps", "Case IH FieldOps"], ["Drone", "Drone"], ["Laboratory", "Laboratory"]]}/><Input label="Capture date" type="date" value={layerForm.captured_date} set={v => setLayerForm({ ...layerForm, captured_date: v })}/><label className="field-label">Layer file<input type="file" accept=".zip,.geojson,.json,.kml,.tif,.tiff,.csv,.isoxml" className="field-input file:mr-3 file:rounded-lg file:border-0 file:bg-[#83c341] file:px-3 file:py-2 file:font-bold" onChange={e => setLayerFile(e.target.files?.[0] || null)}/></label><p className="mt-2 text-xs leading-5 text-[#718278]">ZIP all shapefile parts together (.shp, .shx, .dbf and .prj). GeoTIFF is recommended for NDVI, potential, planting and yield surfaces.</p><Primary onClick={uploadLayer} disabled={saving || !layerFile}>Upload layer</Primary></Panel><section className="space-y-3"><div className="ag-panel rounded-2xl p-5"><p className="ag-kicker">Layer centre</p><h2 className="mt-1 text-xl font-bold">Imported agronomic data</h2><p className="mt-2 text-sm text-[#8d9d94]">Files are stored privately and registered by field, season and source. Raster processing and vendor connections can be enabled without changing this structure.</p></div>{mapLayers.map(x => <article key={x.id} className="ag-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"><div><span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-bold text-sky-300">{x.layer_type}</span><h3 className="mt-2 font-bold">{x.file_name}</h3><p className="mt-1 text-xs text-[#829087]">{x.field_name || "Whole farm"} · {x.season || "No season"} · {x.source}</p></div><span className="text-xs font-bold text-[#a4df57]">{x.status}</span></article>)}{!mapLayers.length && <Empty text="No spatial layers uploaded yet."/>}</section></div>}
 </main>;
}
function Overview({ season, plans, products, operations, fields, totals }: {
    season: string;
    plans: ActivityPlan[];
    products: ActivityPlanProduct[];
    operations: PlanOperation[];
    fields: Field[];
    totals: {
        budget: number;
        area: number;
    };
}) { const cropGroups = Array.from(new Set(plans.map(x => x.crop || "Unassigned"))).map(crop => { const fieldIds = new Set(plans.filter(x => (x.crop || "Unassigned") === crop).map(x => x.field_id)); return { crop, area: fields.filter(x => fieldIds.has(x.id)).reduce((s, x) => s + Number(x.area_ha), 0), budget: plans.filter(x => (x.crop || "Unassigned") === crop).reduce((s, x) => s + Number(x.planned_total), 0) }; }); return <div><section className="mb-5 grid gap-3 sm:grid-cols-4"><Metric label="Season" value={season}/><Metric label="Planned fields" value={String(new Set(plans.map(x => x.field_id)).size)}/><Metric label="Programme area" value={`${totals.area.toFixed(1)} ha`}/><Metric label="Planned budget" value={money.format(totals.budget)}/></section><div className="grid gap-5 xl:grid-cols-[1fr_340px]"><section className="space-y-3">{Array.from(new Set(plans.map(x => x.field_id))).map(fieldId => { const fp = plans.filter(x => x.field_id === fieldId), first = fp[0]; return <article key={fieldId} className="ag-panel rounded-2xl p-5"><div className="flex justify-between"><div><p className="ag-kicker">{first.farm_name}</p><h2 className="mt-1 text-xl font-bold">{first.field_name}</h2><p className="mt-1 text-xs text-[#829087]">{first.crop} · {first.cultivar || "No cultivar"} · {first.planned_area_ha} ha</p></div><div className="text-right"><strong className="text-[#a4df57]">{money.format(fp.reduce((s, x) => s + Number(x.planned_total), 0))}</strong><p className="text-xs text-[#718278]">{fp.length} activities</p></div></div><div className="mt-4 space-y-2">{fp.map(p => <details key={p.id} className="rounded-xl border border-white/[.06] bg-black/15 p-3"><summary className="flex cursor-pointer list-none justify-between gap-3"><span><b>{p.activity_type}</b><small className="ml-2 text-[#829087]">{p.planned_date}</small></span><span className="font-bold">{money.format(Number(p.planned_total))}</span></summary><div className="mt-3 border-t border-white/[.06] pt-2 text-xs">{products.filter(x => x.plan_id === p.id).map(x => <Line key={x.id} kind="Product" name={x.product_name} rate={`${x.planned_rate_per_ha} ${x.unit}/ha`} cost={x.planned_cost}/>)}{operations.filter(x => x.plan_id === p.id).map(x => <Line key={x.id} kind="Operation" name={x.operation_name} rate={`${x.planned_rate_per_ha} ${x.unit}/ha`} cost={x.planned_cost}/>)}</div></details>)}</div></article>; })}{!plans.length && <Empty text="No crop programme has been assigned for this season."/>}</section><aside className="space-y-3"><Panel title="Crop overview">{cropGroups.map(x => <div key={x.crop} className="border-b border-white/[.06] py-3 last:border-0"><div className="flex justify-between"><strong>{x.crop}</strong><span>{x.area.toFixed(1)} ha</span></div><p className="mt-1 text-right text-xs text-[#a4df57]">{money.format(x.budget)}</p></div>)}</Panel><Panel title="Next steps"><ol className="space-y-3 text-sm text-[#9caaa2]"><li>1. Build standard products, operations and crop programmes.</li><li>2. Assign the programme to selected fields.</li><li>3. Use Find & Replace for field exceptions.</li><li>4. Actualise work from Farm Map.</li><li>5. Export planned-versus-actual reports.</li></ol><Link href="/reports/planning" className="mt-4 block text-sm font-bold text-[#a4df57]">Open field cost report →</Link></Panel></aside></div></div>; }
function Line({ kind, name, rate, cost }: {
    kind: string;
    name: string;
    rate: string;
    cost: number;
}) { return <div className="grid grid-cols-[80px_1fr_auto_auto] gap-2 py-1.5"><span className={kind === "Product" ? "text-[#a4df57]" : "text-sky-300"}>{kind}</span><b>{name}</b><span>{rate}</span><span>{money.format(Number(cost))}</span></div>; }
function Panel({ title, children }: {
    title: string;
    children: React.ReactNode;
}) { return <section className="ag-panel rounded-2xl p-5"><p className="ag-kicker">{title}</p><div className="mt-3">{children}</div></section>; }
function Metric({ label, value }: {
    label: string;
    value: string;
}) { return <div className="ag-panel rounded-xl p-4"><p className="text-[10px] uppercase tracking-wider text-[#718278]">{label}</p><p className="mt-2 text-lg font-black">{value}</p></div>; }
function Input({ label, value, set, type = "text", placeholder = "" }: {
    label: string;
    value: string;
    set: (v: string) => void;
    type?: string;
    placeholder?: string;
}) { return <label className="field-label">{label}<input className="field-input" type={type} value={value} placeholder={placeholder} onChange={e => set(e.target.value)}/></label>; }
function Select({ label, value, set, options }: {
    label: string;
    value: string;
    set: (v: string) => void;
    options: string[][];
}) { return <label className="field-label">{label}<select className="field-input" value={value} onChange={e => set(e.target.value)}>{options.map(([v, l]) => <option key={`${v}-${l}`} value={v}>{l}</option>)}</select></label>; }
function SearchSelect({ label, value, set, options, placeholder }: {
    label: string;
    value: string;
    set: (v: string) => void;
    options: string[][];
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(options.find(([id]) => id === value)?.[1] || "");
    useEffect(() => { if (value)
        setQuery(options.find(([id]) => id === value)?.[1] || ""); }, [value]);
    const matches = options.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
    return <label className="field-label relative">{label}<input className="field-input" value={query} placeholder={placeholder} autoComplete="off" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={e => { setQuery(e.target.value); set(""); setOpen(true); }}/>{open && <div className="absolute left-0 right-0 top-full z-[140] mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#102019] p-1 shadow-2xl">{matches.map(([id, name]) => <button key={id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { set(id); setQuery(name); setOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#83c341]/15">{name}</button>)}{!matches.length && <p className="px-3 py-4 text-sm text-[#829087]">No matching items</p>}</div>}</label>;
}
function Primary({ onClick, disabled, children }: {
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) { return <button type="button" onClick={onClick} disabled={disabled} className="mt-4 w-full rounded-xl bg-[#83c341] px-4 py-3 text-sm font-black text-[#07130e] disabled:opacity-40">{children}</button>; }
function Empty({ text }: {
    text: string;
}) { return <div className="ag-panel rounded-2xl border-dashed p-10 text-center text-sm text-[#718278]">{text}</div>; }
