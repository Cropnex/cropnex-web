"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/components/layout/navigation";
import PWAInstallButton from "@/components/pwa/PWAInstallButton";
import SyncStatus from "@/components/offline/SyncStatus";
import { useSeason } from "@/components/season/SeasonProvider";

type TopBarProps = {
  onOpenMenu: () => void;
};

export default function TopBar({
  onOpenMenu,
}: TopBarProps) {
  const pathname = usePathname();
  const {currentSeason,seasons,setCurrentSeason,loading:seasonLoading}=useSeason();
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] =
    useState(false);

  const currentModule =
    navigationItems.find(
      (item) =>
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`)
    )?.label || "CropNex";

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return [];

    return navigationItems.filter((item) =>
      `${item.label} ${item.description}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [query]);

  return (
    <header className="sticky top-0 z-30 border-b border-black/20 bg-[#151611]/95 text-white shadow-[0_8px_30px_rgba(0,0,0,.16)] backdrop-blur-xl">
      <div className="flex h-20 items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-xl border border-white/10 px-3 py-2 text-xl text-white lg:hidden"
          aria-label="Open navigation"
        >
          ☰
        </button>
<SyncStatus />
        <div className="hidden min-w-[170px] lg:block">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
            Current module
          </p>
          <h1 className="text-lg font-bold text-white">
            {currentModule}
          </h1>
        </div>

        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search CropNex..."
            className="w-full rounded-xl border border-[#c7b38a]/20 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none placeholder:text-[#8e8a7f] focus:border-[#c7b38a]/60"
          />

          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-xl border border-white/10 bg-[#0a1510] shadow-2xl">
              {results.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setQuery("")}
                  className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 text-sm font-bold text-[#dfc796]">
                    {item.icon}
                  </span>

                  <div>
                    <p className="font-medium text-white">
                      {item.label}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <PWAInstallButton />

        <label className="hidden min-w-[145px] sm:block"><span className="sr-only">Current season</span><select aria-label="Current season" value={currentSeason} disabled={seasonLoading||!seasons.length} onChange={event=>void setCurrentSeason(event.target.value)} className="w-full rounded-xl border border-[#c7b38a]/25 bg-[#22231d] px-3 py-3 text-sm font-bold text-[#e1cda4] outline-none"><option value="">Season</option>{seasons.map(season=><option key={season} value={season}>{season}</option>)}</select></label>

        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setNotificationsOpen((current) => !current)
            }
            className="relative rounded-xl border border-white/10 px-4 py-3 text-white"
            aria-label="Notifications"
          >
            🔔
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#050b08] bg-amber-400" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-80 rounded-xl border border-white/10 bg-[#0a1510] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-white">
                  Notifications
                </h2>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="text-sm text-gray-500"
                >
                  Close
                </button>
              </div>

              <Notification
                title="Check Smart Alerts"
                description="Review live operational priorities and risks."
                href="/alerts"
              />

              <Notification
                title="Review Weather"
                description="Check current field conditions before spraying."
                href="/weather"
              />

              <Notification
                title="Review Open Jobs"
                description="Confirm assignments and complete finished work."
                href="/jobs"
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Notification({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="mb-2 block rounded-xl bg-white/5 p-3 last:mb-0 hover:bg-white/10"
    >
      <p className="text-sm font-bold text-green-400">
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        {description}
      </p>
    </Link>
  );
}
