import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteOfflineItem,
  getOfflineItems,
  saveOfflineItem,
} from "@/lib/offline-db";
import type { OfflineQueueItem } from "@/types/offline";

function item(id: string, createdAt: string): OfflineQueueItem {
  return {
    id,
    status: "pending",
    attempts: 0,
    last_error: null,
    created_at: createdAt,
    payload: {
      field_id: "field-1",
      observation_date: "2026-03-01",
      observation_time: null,
      category: "Pest",
      issue_name: "Aphids",
      severity: "Low",
      latitude: null,
      longitude: null,
      crop_stage: null,
      affected_area_ha: null,
      recommendation: null,
      follow_up_date: null,
      status: "Open",
      photo_url: null,
      notes: null,
    },
    photo_blob: null,
    photo_name: null,
    photo_type: null,
  };
}

describe("offline observation database", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates its store, saves items, sorts reads, and deletes an item", async () => {
    await saveOfflineItem(item("later", "2026-03-02T00:00:00.000Z"));
    await saveOfflineItem(item("earlier", "2026-03-01T00:00:00.000Z"));

    await expect(getOfflineItems()).resolves.toEqual([
      item("earlier", "2026-03-01T00:00:00.000Z"),
      item("later", "2026-03-02T00:00:00.000Z"),
    ]);

    await deleteOfflineItem("earlier");
    await expect(getOfflineItems()).resolves.toEqual([
      item("later", "2026-03-02T00:00:00.000Z"),
    ]);
  });

  it("returns an empty list when IndexedDB returns no result", async () => {
    const request = {
      result: null,
      error: null,
      onsuccess: null as IDBRequest["onsuccess"],
      onerror: null as IDBRequest["onerror"],
    };
    vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(() => {
      queueMicrotask(() =>
        request.onsuccess?.call(request as IDBRequest, new Event("success")),
      );
      return request as IDBRequest;
    });

    await expect(getOfflineItems()).resolves.toEqual([]);
  });
});
