"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { homeItem, navigationGroups as allNavigationGroups } from "@/components/layout/navigation";
import { useAccess } from "@/components/auth/AccessProvider";
import { APP_STAGE, APP_VERSION } from "@/lib/app-meta";
import CropNexLogo from "@/components/brand/CropNexLogo";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({
  open,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const access=useAccess();
  const roleGroups=(access.isAdmin||access.roles.includes("Farmer"))?allNavigationGroups:allNavigationGroups.map(group=>({...group,items:group.items.filter(item=>item.href==="/grain-marketing"||item.href==="/assistant"||item.href==="/settings")})).filter(group=>group.items.length);
  const navigationGroups=access.isAdmin?[...roleGroups,{label:"Administration",icon:"ADM",items:[{href:"/admin",label:"Verification Centre",description:"Applications and access",icon:"✓"},{href:"/admin/organizations",label:"Organisations",description:"Users, roles and farmer assignments",icon:"ORG"}]}]:roleGroups;
  const activeGroup=navigationGroups.find(group=>group.items.some(item=>pathname===item.href||pathname.startsWith(`${item.href}/`)))?.label||"";
  const[openGroup,setOpenGroup]=useState(activeGroup);
  useEffect(()=>{if(activeGroup)setOpenGroup(activeGroup)},[activeGroup]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`ag-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-white/[0.09] bg-[#11120f] shadow-2xl transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="ag-sidebar-photo" aria-hidden="true" />
        <div className="ag-sidebar-shade" aria-hidden="true" />
        <div className="relative z-10 flex h-20 items-center justify-between border-b border-white/[0.09] px-5">
          <Link href="/dashboard" onClick={onClose}>
            <CropNexLogo />
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white lg:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-2">
            {[homeItem].map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                    active
                      ? "bg-[#c7b38a] text-[#171812] shadow-[0_8px_25px_rgba(0,0,0,.24)]"
                      : "text-[#d4cbb8] hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${active ? "bg-black/10" : "bg-black/25 group-hover:bg-black/35"}`}>
                    {item.icon}
                  </span>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className={`truncate text-[10px] ${active ? "text-[#554a37]" : "text-[#8d897d]"}`}>
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
            {navigationGroups.map(group=>{const expanded=openGroup===group.label;return <div key={group.label}><button type="button" onClick={()=>setOpenGroup(expanded?"":group.label)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-bold ${activeGroup===group.label?"text-[#e0cda5]":"text-[#c1baaa] hover:bg-white/[0.06] hover:text-white"}`}><span className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-black/30 text-sm">{group.icon}</span>{group.label}</span><span className="text-xs opacity-50">{expanded?"−":"+"}</span></button>{expanded&&<div className="ml-4 mt-1 space-y-1 border-l border-white/[.09] pl-2">{group.items.map(item=>{const active=pathname===item.href||pathname.startsWith(`${item.href}/`);return <Link key={item.href} href={item.href} onClick={onClose} className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition ${active?"bg-[#c7b38a] text-[#171812]":"text-[#bbb5a8] hover:bg-white/[.06] hover:text-white"}`}><span className={`flex h-7 w-7 items-center justify-center rounded text-sm font-bold ${active?"bg-black/10":"bg-black/30"}`}>{item.icon}</span><span className="text-sm font-semibold">{item.label}</span></Link>})}</div>}</div>})}
          </div>
        </nav>

        <div className="relative z-10 border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-black/35 p-4 backdrop-blur-md">
            <p className="text-sm font-bold text-[#dfc796]">
              CropNex v{APP_VERSION} · {APP_STAGE}
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase leading-5 tracking-[.2em] text-[#aaa08c]">
              People · Land · Insight
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
