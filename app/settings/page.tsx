"use client";

import { useEffect, useState } from "react";
import { ModulePage } from "@/components/layout/ModulePage";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({ full_name: "", farm_name: "", province: "", preferred_currency: "ZAR", area_unit: "ha" });
  useEffect(() => { void (async () => { const { data: auth } = await supabase.auth.getSession(); const user = auth.session?.user; setEmail(user?.email || ""); if (!user) return; const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(); if (data) setForm({ full_name: data.full_name || "", farm_name: data.farm_name || "", province: data.province || "", preferred_currency: data.preferred_currency || "ZAR", area_unit: data.area_unit || "ha" }); })(); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); const { data } = await supabase.auth.getSession(); if (!data.session?.user) return alert("Sign in to save your profile."); const { error } = await supabase.from("profiles").upsert({ id: data.session.user.id, ...form, updated_at: new Date().toISOString() }); alert(error ? error.message : "Settings saved."); }
  async function signOut() { await supabase.auth.signOut(); window.location.href = "/login"; }
  return <ModulePage eyebrow="Account & farm" title="Settings" description="Keep the farm identity and reporting preferences used throughout CropNex consistent.">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,680px)_1fr]"><form onSubmit={save} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><div className="grid gap-4 sm:grid-cols-2">{(["full_name","farm_name","province"] as const).map((key) => <label key={key} className="text-sm font-semibold capitalize text-gray-400">{key.replaceAll("_", " ")}<input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" /></label>)}<label className="text-sm font-semibold text-gray-400">Currency<select value={form.preferred_currency} onChange={(e) => setForm({ ...form, preferred_currency: e.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-[#09130e] px-4 py-3 text-white"><option>ZAR</option><option>USD</option><option>NAD</option><option>BWP</option></select></label></div><button className="mt-6 rounded-xl bg-green-400 px-5 py-3 font-bold text-[#031009]">Save settings</button></form><aside className="h-fit rounded-2xl border border-white/10 bg-[#0a1710] p-6"><p className="text-xs uppercase tracking-widest text-gray-500">Signed in as</p><p className="mt-2 font-bold text-white">{email || "No active session"}</p><div className="my-5 h-px bg-white/10"/><p className="text-sm leading-6 text-gray-400">Your current Supabase account remains the owner of all existing fields, polygons and operational records.</p><button type="button" onClick={signOut} className="mt-5 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400">Sign out</button></aside></div>
  </ModulePage>;
}
