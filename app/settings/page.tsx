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
    <div className="ag-settings-workspace grid gap-6 lg:grid-cols-[minmax(0,680px)_1fr]">
      <form onSubmit={save} className="rounded-2xl border border-[#c4cdd0] bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["full_name","farm_name","province"] as const).map((key) => <label key={key} htmlFor={`settings-${key}`} className="text-sm font-semibold capitalize text-[#37474f]">
            {key.replaceAll("_", " ")}
            <input id={`settings-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-2 w-full rounded-xl border border-[#9aa9ae] bg-white px-4 py-3 text-[#17251c]" />
          </label>)}
          <label htmlFor="settings-currency" className="text-sm font-semibold text-[#37474f]">Currency
            <select id="settings-currency" value={form.preferred_currency} onChange={(e) => setForm({ ...form, preferred_currency: e.target.value })} className="mt-2 w-full rounded-xl border border-[#9aa9ae] bg-white px-4 py-3 text-[#17251c]">
              <option>ZAR</option><option>USD</option><option>NAD</option><option>BWP</option>
            </select>
          </label>
        </div>
        <button className="mt-6 rounded-xl bg-[#86cf34] px-5 py-3 font-bold text-[#111516]">Save settings</button>
      </form>
      <aside className="h-fit rounded-2xl border border-[#c4cdd0] bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#37474f]">Signed in as</p>
        <p className="mt-2 break-all font-bold text-[#17251c]">{email || "No active session"}</p>
        <div className="my-5 h-px bg-[#c4cdd0]"/>
        <p className="text-sm leading-6 text-[#37474f]">Manage your account identity and reporting preferences here. Your existing farm records stay linked to their farming account.</p>
        <button type="button" onClick={signOut} className="mt-5 rounded-xl border border-[#b91c1c] bg-[#fff7f7] px-4 py-2 text-sm font-semibold text-[#b91c1c]">Sign out</button>
      </aside>
    </div>
  </ModulePage>;
}
