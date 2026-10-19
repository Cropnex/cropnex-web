"use client";

import { useEffect, useState } from "react";
import { getOfflineItems } from "@/lib/offline-db";
import { syncOfflineItems } from "@/lib/offline-sync";
import { getQueuedRestMutations } from "@/lib/offline-platform";

export default function SyncStatus() {
  const [online, setOnline] = useState(true);
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    setOnline(navigator.onLine);
    const [scouting, operations] = await Promise.all([
      getOfflineItems(),
      getQueuedRestMutations(),
    ]);
    setCount(scouting.length + operations.length);
  }

  async function syncNow() {
    if (!navigator.onLine) return;

    setSyncing(true);
    try {
      await syncOfflineItems();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }

  useEffect(() => {
    void refresh();

    const onlineHandler = () => {
      setOnline(true);
      void syncNow();
    };

    const offlineHandler = () => setOnline(false);
    const refreshHandler = () => void refresh();

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener(
      "agcore-sync-updated",
      refreshHandler
    );

    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener(
        "offline",
        offlineHandler
      );
      window.removeEventListener(
        "agcore-sync-updated",
        refreshHandler
      );
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span
        className={`hidden rounded-xl px-3 py-2 text-xs font-bold md:inline-flex ${
          online
            ? "bg-green-500/10 text-green-400"
            : "bg-amber-500/10 text-amber-400"
        }`}
      >
        {online ? "Online · synced" : "Offline · local mode"}
      </span>

      {count > 0 && (
        <button
          type="button"
          onClick={syncNow}
          disabled={!online || syncing}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs disabled:opacity-50"
        >
          {syncing ? "Syncing..." : `Sync ${count}`}
        </button>
      )}
    </div>
  );
}
