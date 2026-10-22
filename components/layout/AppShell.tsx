"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import { AccessGate, AccessProvider } from "@/components/auth/AccessProvider";
import LegalFooter from "@/components/layout/LegalFooter";
import { SeasonProvider } from "@/components/season/SeasonProvider";
import Link from "next/link";
import { CROPNEX_LAUNCHED } from "@/lib/app-meta";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!CROPNEX_LAUNCHED) return <PreLaunchGate />;

  return <AccessProvider><AccessGate><SeasonProvider>
    <div className="ag-app-shell min-h-screen bg-[#F2F0E8] text-[#181a15]">
      <ServiceWorkerRegistration />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="ag-app-content min-h-screen lg:pl-64">
        <TopBar onOpenMenu={() => setSidebarOpen(true)} />

        <div className="min-h-[calc(100vh-5rem)]">
          {children}
        </div>
        <LegalFooter />
      </div>
    </div>
  </SeasonProvider></AccessGate></AccessProvider>;
}

function PreLaunchGate() {
  return <main className="grid min-h-screen place-items-center bg-[#101412] px-5 py-12 text-white">
    <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#1a2022] p-8 text-center shadow-2xl sm:p-10">
      <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#9adb49]">CropNex · Pre-subscription</p>
      <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">We’re getting ready to launch.</h1>
      <p className="mt-4 leading-7 text-white/70">Create your CropNex profile now. App access will open when CropNex launches.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/login?mode=register&presubscribe=1" className="rounded-xl bg-[#86cf34] px-6 py-3 font-bold text-[#111516] hover:bg-[#9adb49]">Pre-subscribe</Link>
        <Link href="/" className="rounded-xl border border-white/20 px-6 py-3 font-semibold text-white/85 hover:bg-white/5">Back to CropNex</Link>
      </div>
      <p className="mt-5 text-sm text-white/50"><Link href="/login" className="underline hover:text-white">Already have an account? Sign in</Link></p>
    </section>
  </main>;
}
