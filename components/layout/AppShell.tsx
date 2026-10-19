"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import { AccessGate, AccessProvider } from "@/components/auth/AccessProvider";
import LegalFooter from "@/components/layout/LegalFooter";
import { SeasonProvider } from "@/components/season/SeasonProvider";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return <AccessProvider><AccessGate><SeasonProvider>
    <div className="ag-app-shell min-h-screen bg-[#d8ccb1] text-[#181a15]">
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
