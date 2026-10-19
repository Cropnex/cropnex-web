"use client";

import { useEffect, useState } from "react";
import {
  deleteOfflineItem,
  getOfflineItems,
} from "@/lib/offline-db";
import { syncOfflineItems } from "@/lib/offline-sync";
import type { OfflineQueueItem } from "@/types/offline";
import {
  getQueuedRestMutations,
  removeQueuedRestMutation,
  type QueuedRestMutation,
} from "@/lib/offline-platform";

export default function OfflineSyncPage() {
  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const [operations, setOperations] = useState<QueuedRestMutation[]>([]);
  const [syncing, setSyncing] = useState(false);

  async function loadItems() {
    const [scouting, queuedOperations] = await Promise.all([
      getOfflineItems(),
      getQueuedRestMutations(),
    ]);
    setItems(scouting);
    setOperations(queuedOperations);
  }

  useEffect(() => {
    void loadItems();
  }, []);

  async function syncNow() {
    setSyncing(true);

    try {
      const result = await syncOfflineItems();
      alert(
        `${result.synced} synced, ${result.failed} failed.`
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Sync failed."
      );
    } finally {
      setSyncing(false);
      await loadItems();
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this queued record?")) return;

    await deleteOfflineItem(id);
    await loadItems();

    window.dispatchEvent(
      new CustomEvent("agcore-sync-updated")
    );
  }

  async function removeOperation(id: string) {
    if (!window.confirm("Delete this queued operation?")) return;
    await removeQueuedRestMutation(id);
    await loadItems();
  }

  return (
    <main className="min-h-screen bg-[#050b08] p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-400">
            CropNex · Field resilient
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Offline Sync Queue
          </h1>
          <p className="mt-2 text-gray-400">
            Scouting photos and app-wide changes saved without signal appear here.
          </p>
        </div>

        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {items.length === 0 && operations.length === 0 ? (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-6">
          <h2 className="text-2xl font-bold text-green-400">
            Queue is clear
          </h2>
          <p className="mt-2 text-gray-300">
            No offline records are waiting to sync.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">
                    Scouting observation
                  </p>
                  <h2 className="text-xl font-bold text-green-400">
                    {item.payload.issue_name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-400">
                    {item.payload.observation_date} ·{" "}
                    {item.payload.category}
                  </p>
                </div>

                <span
                  className={
                    item.status === "failed"
                      ? "text-red-400"
                      : "text-amber-400"
                  }
                >
                  {item.status}
                </span>
              </div>

              {item.last_error && (
                <p className="mt-3 text-sm text-red-400">
                  {item.last_error}
                </p>
              )}

              <button
                type="button"
                onClick={() => remove(item.id)}
                className="mt-4 rounded-xl border border-red-500/30 px-4 py-2 text-red-400"
              >
                Delete
              </button>
            </article>
          ))}
          {operations.map((item) => {
            const moduleName = new URL(item.url).pathname.split("/").pop()?.split("?")[0];
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500">App operation</p>
                    <h2 className="text-xl font-bold capitalize text-green-400">
                      {item.method.toLowerCase()} {moduleName?.replaceAll("_", " ")}
                    </h2>
                    <p className="mt-1 text-sm text-gray-400">
                      Saved {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={item.lastError ? "text-red-400" : "text-amber-400"}>
                    {item.lastError ? "failed" : "pending"}
                  </span>
                </div>
                {item.lastError && <p className="mt-3 text-sm text-red-400">{item.lastError}</p>}
                <button
                  type="button"
                  onClick={() => removeOperation(item.id)}
                  className="mt-4 rounded-xl border border-red-500/30 px-4 py-2 text-red-400"
                >
                  Delete
                </button>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
