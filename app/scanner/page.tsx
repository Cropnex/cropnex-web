"use client";
import { useEffect, useRef, useState } from "react";
import { ModulePage } from "@/components/layout/ModulePage";
import { supabase } from "@/lib/supabase";
import { useSeason } from "@/components/season/SeasonProvider";
type ScanLine = {
    product_name: string;
    product_code: string | null;
    quantity: number;
    unit: string;
    unit_price: number | null;
    batch_number: string | null;
    confidence: number;
};
type ScanData = {
    document_type: string;
    document_date: string | null;
    ticket_number: string | null;
    driver_name: string | null;
    truck_registration: string | null;
    destination_name: string | null;
    net_tonnes: number | null;
    supplier: string | null;
    reference: string | null;
    inventory_items: ScanLine[];
    confidence: number;
    notes: string | null;
};
type Field = {
    id: string;
    field_name: string;
    crop: string | null;
    season: string | null;
};
type Item = {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    unit_cost: number | null;
    location_id: string | null;
};
type Master = {
    id: string;
    catalogue_code: string;
    name: string;
    category: string;
    product_class: string | null;
    pack_unit: string | null;
};
type Location = {
    id: string;
    name: string;
};
type Mapping = {
    enabled: boolean;
    target: string;
};
export default function ScannerPage() {
    const {currentSeason}=useSeason();
    const [type, setType] = useState("Transport delivery note"), [file, setFile] = useState<File | null>(null), [data, setData] = useState<ScanData | null>(null), [fields, setFields] = useState<Field[]>([]), [items, setItems] = useState<Item[]>([]), [masters, setMasters] = useState<Master[]>([]), [locations, setLocations] = useState<Location[]>([]), [fieldId, setFieldId] = useState(""), [locationId, setLocationId] = useState(""), [mappings, setMappings] = useState<Mapping[]>([]), [busy, setBusy] = useState(false), [stage, setStage] = useState("");
    const scanController = useRef<AbortController | null>(null);
    const cancelledByUser = useRef(false);
    async function loadLists() { if(!currentSeason)return;const q = await Promise.all([supabase.from("fields").select("id,field_name,crop,season").eq("season",currentSeason).order("field_name"), supabase.from("inventory_items").select("id,name,unit,quantity,unit_cost,location_id").eq("season",currentSeason).neq("status", "Inactive").order("name"), supabase.from("master_products").select("id,catalogue_code,name,category,product_class,pack_unit").eq("status", "Approved").order("name"), supabase.from("inventory_locations").select("id,name").eq("active", true).order("name")]); setFields((q[0].data || []) as Field[]); setItems((q[1].data || []) as Item[]); setMasters((q[2].data || []) as Master[]); const loc = (q[3].data || []) as Location[]; setLocations(loc); if (loc[0])
        setLocationId(x => x || loc[0].id); }
    useEffect(() => { void loadLists(); }, [currentSeason]);
    function bestTarget(line: ScanLine) { const text = `${line.product_code || ""} ${line.product_name}`.toLowerCase(), existing = items.find(x => text.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(line.product_name.toLowerCase())); if (existing)
        return `item:${existing.id}`; const master = masters.find(x => text.includes(x.catalogue_code.toLowerCase()) || text.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(line.product_name.toLowerCase())); return master ? `master:${master.id}` : ""; }
    async function prepareImage(source: File) {
        setStage("Optimising photo");
        const url = URL.createObjectURL(source);
        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const next = new Image();
                next.onload = () => resolve(next);
                next.onerror = () => reject(new Error("The selected photo could not be opened."));
                next.src = url;
            });
            const maximumSide = 2200;
            const scale = Math.min(1, maximumSide / Math.max(image.width, image.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext("2d");
            if (!context)
                throw new Error("The photo could not be prepared.");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg", 0.82);
        }
        finally {
            URL.revokeObjectURL(url);
        }
    }
    async function scan() {
        if (!file)
            return alert("Choose a JPG, PNG or WebP photo.");
        if (file.size > 25 * 1024 * 1024)
            return alert("Please use an image smaller than 25 MB.");
        cancelledByUser.current = false;
        const controller = new AbortController();
        scanController.current = controller;
        setBusy(true);
        setData(null);
        const timeout = window.setTimeout(() => controller.abort(), 60000);
        let progressTimer: number | undefined;
        try {
            const image = await prepareImage(file);
            setStage("Uploading photo");
            progressTimer = window.setTimeout(() => setStage("Reading every product line"), 900);
            const response = await fetch("/api/scanner", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image, documentType: type }),
                signal: controller.signal,
            });
            setStage("Preparing review");
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.error || "The document could not be read.");
            const next = result.data as ScanData;
            setData(next);
            setMappings(next.inventory_items.map(line => ({ enabled: true, target: bestTarget(line) })));
            setStage(`${next.inventory_items.length} product line${next.inventory_items.length === 1 ? "" : "s"} found`);
        }
        catch (error) {
            if (cancelledByUser.current)
                setStage("Scan cancelled — the photo is still selected");
            else if (error instanceof DOMException && error.name === "AbortError") {
                setStage("Scan timed out — the photo is still selected");
                alert("The scan took longer than one minute. Try again; you do not need to choose the photo again.");
            }
            else {
                const message = error instanceof Error ? error.message : "The document could not be read.";
                setStage("Scan unsuccessful — the photo is still selected");
                alert(message);
            }
        }
        finally {
            window.clearTimeout(timeout);
            if (progressTimer)
                window.clearTimeout(progressTimer);
            scanController.current = null;
            setBusy(false);
        }
    }
    function cancelScan() {
        cancelledByUser.current = true;
        scanController.current?.abort();
    }
    function setHeader(key: keyof ScanData, value: string) { setData(current => current ? { ...current, [key]: key === 'net_tonnes' ? (value === '' ? null : Number(value)) : value } : current); }
    function setLine(index: number, key: keyof ScanLine, value: string) { setData(current => current ? { ...current, inventory_items: current.inventory_items.map((line, i) => i === index ? { ...line, [key]: ['quantity', 'unit_price', 'confidence'].includes(key) ? (value === '' ? null : Number(value)) : value } : line) } : current); }
    async function postInventory(uid: string) {
        if (!data)
            return { error: "Nothing to post", ids: [] as string[] };
        const selected = data.inventory_items.map((line, index) => ({ line, map: mappings[index] })).filter(x => x.map?.enabled);
        if (!selected.length)
            return { error: "Select at least one product.", ids: [] as string[] };
        if (!locationId)
            return { error: "Choose the receiving shed or warehouse.", ids: [] as string[] };
        if (selected.some(x => !x.map.target))
            return { error: "Match every selected product to an existing inventory item or approved catalogue product.", ids: [] as string[] };
        const ids: string[] = [];
        for (const { line, map } of selected) {
            let item: Item | undefined;
            if (map.target.startsWith("item:"))
                item = items.find(x => x.id === map.target.slice(5));
            else {
                const master = masters.find(x => x.id === map.target.slice(7)), location = locations.find(x => x.id === locationId);
                if (!master)
                    return { error: `Catalogue match missing for ${line.product_name}.`, ids };
                const created = await supabase.from("inventory_items").insert({ user_id: uid, season:currentSeason, master_product_id: master.id, name: master.name, category: master.product_class || master.category, unit: line.unit || master.pack_unit || "unit", quantity: 0, unit_cost: line.unit_price, minimum_quantity: null, supplier: data.supplier, batch_number: line.batch_number, location: location?.name || null, location_id: locationId, status: "Active", notes: "Created from AI-scanned receipt", owner_type: "Farmer", stock_status: "Available" }).select("id,name,unit,quantity,unit_cost,location_id").single();
                if (created.error)
                    return { error: created.error.message, ids };
                item = created.data as Item;
            }
            if (!item || line.quantity <= 0)
                return { error: `Confirm a valid quantity for ${line.product_name}.`, ids };
            const tx = await supabase.rpc("post_inventory_movement",{p_item_id:item.id,p_transaction_date:data.document_date||new Date().toISOString().slice(0,10),p_movement:"Receipt",p_quantity:line.quantity,p_unit_cost:line.unit_price??item.unit_cost,p_reference:data.reference||data.ticket_number,p_reason:`AI Scanner · ${data.supplier||"Receipt"} · ${line.product_name}`,p_field_id:null});
            if (tx.error)return { error: tx.error.message, ids };
            ids.push(item.id);
        }
        return { error: "", ids };
    }
    async function confirm() {
        if (!data || !file)
            return;
        const { data: auth } = await supabase.auth.getSession(), uid = auth.session?.user.id;
        if (!uid)
            return;
        setBusy(true);
        let ids: string[] = [];
        let errorMessage = "";
        if (data.document_type === "Transport delivery note") {
            const field = fields.find(x => x.id === fieldId);
            if (!field || !data.net_tonnes) {
                setBusy(false);
                return alert("Choose the field and confirm a net weight.");
            }
            const load = await supabase.from("transport_loads").insert({ user_id: uid, load_number: data.ticket_number || `SCAN-${Date.now()}`, load_date: data.document_date || new Date().toISOString().slice(0, 10), destination_name: data.destination_name, truck_registration: data.truck_registration, driver_name: data.driver_name, ticket_number: data.ticket_number, net_tonnes: data.net_tonnes, accepted_tonnes: data.net_tonnes, status: "Reconciled", source: "AI Scanner", created_by: uid, notes: data.notes }).select("id").single();
            if (load.error)
                errorMessage = load.error.message;
            else {
                ids = [load.data.id];
                const allocation = await supabase.from("transport_load_allocations").insert({ user_id: uid, load_id: load.data.id, field_id: field.id, allocated_tonnes: data.net_tonnes, crop_snapshot: field.crop, season_snapshot: field.season });
                if (allocation.error)
                    errorMessage = allocation.error.message;
            }
        }
        else {
            const posted = await postInventory(uid);
            errorMessage = posted.error;
            ids = posted.ids;
        }
        if (!errorMessage) {
            await supabase.from("document_scans").insert({ user_id: uid, document_type: data.document_type, file_name: file.name, scan_status: "Confirmed", extracted_data: { ...data, posted_record_ids: ids }, confidence: data.confidence, target_record_id: ids[0] || null, confirmed_at: new Date().toISOString() });
        }
        setBusy(false);
        if (errorMessage)
            return alert(errorMessage);
        setData(null);
        setFile(null);
        await loadLists();
        alert(`${ids.length} record${ids.length === 1 ? "" : "s"} confirmed and posted to CropNex.`);
    }
    return <ModulePage eyebrow="CropNex AI" title="Document Scanner" description="Scan delivery documents, review every extracted line, and confirm them into Transport or Inventory.">
        <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
            <section className="ag-panel h-fit rounded-2xl p-5">
                <label className="field-label">Document type<select className="field-input" value={type} onChange={e => setType(e.target.value)}><option>Transport delivery note</option><option>Inventory receipt</option></select></label>
                <label className="field-label">Photo<input className="field-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { setFile(e.target.files?.[0] || null); setStage(""); }}/></label>
                {!busy ? <button disabled={!file} onClick={scan} className="primary mt-5 w-full">{stage ? "Try again" : "Scan document"}</button> : <button type="button" onClick={cancelScan} className="mt-5 w-full rounded-xl border border-red-400/40 px-4 py-3 font-bold text-red-300">Cancel scan</button>}
                {stage && <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-[#a9b8af]"><div className="flex items-center gap-2">{busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#86cf3d] border-t-transparent"/>}<strong>{stage}</strong></div>{!busy && file && <p className="mt-1 text-xs text-[#718278]">Your selected photo is ready to scan again.</p>}</div>}
                <p className="mt-4 text-xs text-[#718278]">Large photos are automatically reduced for a faster scan. Nothing is posted until you review and confirm it.</p>
            </section>
            <section className="ag-panel rounded-2xl p-5">
                {!data ? <div className="grid min-h-80 place-items-center text-center text-[#718278]">{busy ? stage : "The extracted information will appear here for review."}</div> : <>
                    <div className="flex justify-between"><div><p className="ag-kicker">Review required</p><h2 className="mt-1 text-2xl font-bold">Confirm the document</h2></div><span className={`h-fit rounded-full px-3 py-2 text-xs font-bold ${data.confidence >= 80 ? 'bg-green-400/10 text-green-300' : 'bg-amber-400/10 text-amber-300'}`}>{data.confidence}% confidence</span></div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">{(['document_date', 'ticket_number', 'supplier', 'reference', 'driver_name', 'truck_registration', 'destination_name', 'net_tonnes', 'notes'] as (keyof ScanData)[]).filter(k => data.document_type === 'Inventory receipt' || !['supplier'].includes(k)).map(k => <label key={k} className="field-label">{k.replaceAll('_', ' ')}<input className="field-input" type={k === 'net_tonnes' ? 'number' : 'text'} value={String(data[k] ?? '')} onChange={e => setHeader(k, e.target.value)}/></label>)}</div>
                    {data.document_type === "Transport delivery note" ? <label className="field-label">Post to field<select className="field-input" value={fieldId} onChange={e => setFieldId(e.target.value)}><option value="">Choose field</option>{fields.map(x => <option key={x.id} value={x.id}>{x.field_name} · {x.crop || "Unplanned"}</option>)}</select></label> : <>
                        <div className="mt-6 flex flex-wrap items-end justify-between gap-3"><div><p className="ag-kicker">Products found</p><h3 className="mt-1 text-xl font-bold">{data.inventory_items.length} receipt lines</h3></div><label className="field-label min-w-64">Receiving shed<select className="field-input" value={locationId} onChange={e => setLocationId(e.target.value)}><option value="">Choose location</option>{locations.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
                        <div className="mt-3 space-y-3">{data.inventory_items.map((line, index) => <article key={index} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={mappings[index]?.enabled ?? true} onChange={e => setMappings(x => x.map((m, i) => i === index ? { ...m, enabled: e.target.checked } : m))}/>{line.product_name}</label><span className="text-xs text-[#829087]">{line.confidence}% confidence</span></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Product name" value={line.product_name} set={v => setLine(index, 'product_name', v)}/><Field label="Quantity" type="number" value={String(line.quantity)} set={v => setLine(index, 'quantity', v)}/><Field label="Unit" value={line.unit} set={v => setLine(index, 'unit', v)}/><Field label="Unit price" type="number" value={String(line.unit_price ?? '')} set={v => setLine(index, 'unit_price', v)}/><Field label="Batch" value={line.batch_number || ''} set={v => setLine(index, 'batch_number', v)}/><label className="field-label">Inventory match<select className="field-input" value={mappings[index]?.target || ''} onChange={e => setMappings(x => x.map((m, i) => i === index ? { ...m, target: e.target.value } : m))}><option value="">Choose product</option><optgroup label="Existing inventory">{items.map(x => <option key={x.id} value={`item:${x.id}`}>{x.name} · {x.quantity} {x.unit}</option>)}</optgroup><optgroup label="Create from approved catalogue">{masters.map(x => <option key={x.id} value={`master:${x.id}`}>+ {x.catalogue_code} · {x.name}</option>)}</optgroup></select></label></div></article>)}</div>
                    </>}
                    <button disabled={busy} onClick={confirm} className="primary mt-5 w-full">{busy ? "Posting records…" : "Confirm and post to CropNex"}</button>
                </>}
            </section>
        </div>
    </ModulePage>;
}
function Field({ label, value, set, type = "text" }: {
    label: string;
    value: string;
    set: (v: string) => void;
    type?: string;
}) { return <label className="field-label">{label}<input className="field-input" type={type} step={type === 'number' ? '0.01' : undefined} value={value} onChange={e => set(e.target.value)}/></label>; }
