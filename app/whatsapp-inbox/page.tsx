"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccess } from "@/components/auth/AccessProvider";
import { supabase } from "@/lib/supabase";

type Sender = { id: string; user_id: string; phone_e164: string; display_name: string; default_shed_name: string | null; active: boolean };
type InboxMessage = { id: string; sender_phone_e164: string; sender_name: string | null; message_type: string; message_text: string | null; media_id: string | null; media_mime_type: string | null; media_filename: string | null; default_shed_name: string | null; status: "new" | "reviewed" | "ignored"; received_at: string };

export default function WhatsAppInboxPage() {
  const access = useAccess();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [shed, setShed] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!access.userId) return;
    setLoading(true);
    setError("");
    const [senderResult, messageResult] = await Promise.all([
      supabase.from("whatsapp_senders").select("id,user_id,phone_e164,display_name,default_shed_name,active").eq("user_id", access.userId).order("created_at", { ascending: false }),
      supabase.from("whatsapp_inbox").select("id,sender_phone_e164,sender_name,message_type,message_text,media_id,media_mime_type,media_filename,default_shed_name,status,received_at").eq("user_id", access.userId).order("received_at", { ascending: false }).limit(100),
    ]);
    if (senderResult.error || messageResult.error) setError(senderResult.error?.message || messageResult.error?.message || "Could not load the Farm Inbox.");
    setSenders((senderResult.data || []) as Sender[]);
    setMessages((messageResult.data || []) as InboxMessage[]);
    setLoading(false);
  }, [access.userId]);

  useEffect(() => { void load(); }, [load]);

  async function addSender(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(""); setError("");
    const normalized = `+${phone.replace(/\D/g, "")}`;
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) { setError("Enter a complete international number, including its country code (for example +27…)."); return; }
    if (!name.trim()) { setError("Add the sender’s name so the team can identify incoming messages."); return; }
    setSaving(true);
    const { error: insertError } = await supabase.from("whatsapp_senders").insert({ user_id: access.userId, phone_e164: normalized, display_name: name.trim(), default_shed_name: shed.trim() || null, active: true });
    setSaving(false);
    if (insertError) { setError(insertError.code === "23505" ? "This number is already authorised on a CropNex farm. Each WhatsApp number can route to one farm at a time." : insertError.message); return; }
    setPhone(""); setName(""); setShed(""); setNotice("Foreman added. Their messages will appear here after the CropNex WhatsApp number is connected.");
    await load();
  }

  async function setMessageStatus(message: InboxMessage, status: "reviewed" | "ignored") {
    const { error: updateError } = await supabase.from("whatsapp_inbox").update({ status, reviewed_at: new Date().toISOString() }).eq("id", message.id).eq("user_id", access.userId);
    if (updateError) setError(updateError.message); else await load();
  }

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="ag-kicker">Messages from the farm</p><h1 className="mt-2 text-3xl font-extrabold">Farm Inbox</h1><p className="mt-2 max-w-2xl text-sm text-[#8d9d94]">Let authorised foremen send delivery notes, photos, voice notes and quick updates to CropNex on WhatsApp. Incoming messages are held here for review.</p></div><button onClick={() => void load()} className="rounded-xl border border-[#789B58]/30 px-4 py-3 text-sm font-bold text-[#B6CB8D]">Refresh inbox</button></header>

    <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <form onSubmit={addSender} className="ag-panel rounded-2xl p-5"><p className="ag-kicker">Step 1 · Authorise a sender</p><h2 className="mt-1 text-xl font-bold">Add a foreman</h2><p className="mt-2 text-xs leading-5 text-[#8d9d94]">Only numbers you add here can deliver messages into this farm’s inbox. Enter the number with country code.</p><label className="field-label mt-4">Foreman’s name<input required value={name} onChange={e=>setName(e.target.value)} className="field-input" placeholder="e.g. Farm foreman"/></label><label className="field-label">WhatsApp number<input required type="tel" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="field-input" placeholder="+27 82 123 4567"/></label><label className="field-label">Default shed or store<input value={shed} onChange={e=>setShed(e.target.value)} className="field-input" placeholder="e.g. Main Farm Shed"/><span className="mt-1 block text-[11px] font-normal text-[#8d9d94]">Used as a suggested destination for delivery messages. You can leave it blank.</span></label><button disabled={saving} className="mt-3 w-full rounded-xl bg-[#86CF34] px-4 py-3 text-sm font-black text-[#111516] disabled:opacity-50">{saving?"Adding…":"Authorise WhatsApp number"}</button></form>

      <div className="ag-panel rounded-2xl p-5"><p className="ag-kicker">Step 2 · Connect the CropNex number</p><h2 className="mt-1 text-xl font-bold">WhatsApp connection setup</h2><ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#c4cec7]"><li>Create or choose CropNex’s WhatsApp Business Platform account and phone number in Meta.</li><li>Set the webhook callback URL to <code className="break-all rounded bg-black/30 px-1.5 py-1 text-xs text-[#B6CB8D]">https://www.cropnex.com/api/whatsapp/webhook</code>.</li><li>Subscribe the Meta webhook to the <code className="rounded bg-black/30 px-1.5 py-1 text-xs text-[#B6CB8D]">messages</code> field, then add the private Meta and Supabase server credentials in Vercel.</li></ol><div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100/80">The inbox stores messages only from authorised numbers. Voice notes and files are captured as pending items; this first connection does not transcribe audio or automatically post stock transactions. A person reviews each item before it changes farm records.</div></div>
    </section>

    {(error||notice)&&<div role="status" className={`mb-4 rounded-xl border p-3 text-sm ${error?"border-red-300/20 bg-red-400/[.06] text-red-200":"border-[#789B58]/25 bg-[#789B58]/[.08] text-[#C9E5A7]"}`}>{error||notice}</div>}

    <section className="mb-6"><div className="mb-3 flex items-center justify-between"><div><p className="ag-kicker">Authorised contacts</p><h2 className="text-xl font-bold">Farm senders</h2></div><span className="text-xs text-[#8d9d94]">{senders.length} active</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{senders.map(sender=><div key={sender.id} className="ag-panel rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{sender.display_name}</p><p className="mt-1 text-sm text-[#B6CB8D]">{sender.phone_e164}</p></div><button onClick={async()=>{const{error:toggleError}=await supabase.from("whatsapp_senders").update({active:!sender.active,updated_at:new Date().toISOString()}).eq("id",sender.id).eq("user_id",access.userId);if(toggleError)setError(toggleError.message);else await load()}} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${sender.active?"bg-[#789B58]/15 text-[#B6CB8D]":"bg-white/[.06] text-[#8d9d94]"}`}>{sender.active?"Active · pause":"Paused · activate"}</button></div><p className="mt-3 text-xs text-[#8d9d94]">Default destination: {sender.default_shed_name||"Not set"}</p></div>)}{!senders.length&&!loading&&<p className="ag-panel rounded-xl p-4 text-sm text-[#8d9d94]">No foremen added yet.</p>}</div></section>

    <section><div className="mb-3 flex items-end justify-between"><div><p className="ag-kicker">Review before recording</p><h2 className="text-xl font-bold">Incoming messages</h2></div><span className="text-xs text-[#8d9d94]">Latest 100</span></div>{loading?<div className="ag-panel rounded-2xl p-6 text-sm text-[#8d9d94]">Loading messages…</div>:messages.length===0?<div className="ag-panel rounded-2xl p-6"><p className="font-bold">Your inbox is ready</p><p className="mt-1 text-sm text-[#8d9d94]">Once Meta is connected and a foreman sends CropNex a message, it will appear here. Nothing has been recorded in inventory yet.</p></div>:<div className="space-y-3">{messages.map(message=><article key={message.id} className="ag-panel rounded-2xl p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{message.sender_name||message.sender_phone_e164}</h3><span className="rounded-full bg-white/[.07] px-2 py-1 text-[10px] font-bold uppercase text-[#B6CB8D]">{message.message_type}</span><span className="rounded-full bg-white/[.05] px-2 py-1 text-[10px] font-bold text-[#8d9d94]">{message.status}</span></div><p className="mt-1 text-xs text-[#8d9d94]">{message.sender_phone_e164} · {new Date(message.received_at).toLocaleString("en-ZA")}</p></div><span className="text-xs text-[#8d9d94]">Suggested shed: {message.default_shed_name||"Choose after review"}</span></div>{message.message_text&&<p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#e3e8e2]">{message.message_text}</p>}{message.media_id&&<div className="mt-4 rounded-xl border border-white/[.08] bg-black/15 p-3 text-xs text-[#c1cbc3]">Attachment received{message.media_filename?` · ${message.media_filename}`:""}{message.media_mime_type?` · ${message.media_mime_type}`:""}<p className="mt-1 text-[#8d9d94]">Meta media reference saved. Media download and document/voice processing need to be enabled in the connected WhatsApp account.</p></div>}<div className="mt-4 flex gap-2"><button disabled={message.status==="reviewed"} onClick={()=>void setMessageStatus(message,"reviewed")} className="rounded-lg bg-[#789B58] px-3 py-2 text-xs font-black text-[#17382E] disabled:opacity-40">Mark reviewed</button><button disabled={message.status==="ignored"} onClick={()=>void setMessageStatus(message,"ignored")} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-[#aeb9b1] disabled:opacity-40">Ignore</button></div></article>)}</div>}</section>
  </main>;
}
