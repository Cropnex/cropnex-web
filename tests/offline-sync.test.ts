import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineQueueItem } from "@/types/offline";

const mocks = vi.hoisted(() => ({
  supabase: {
    auth: { getUser: vi.fn(), getSession: vi.fn() },
    storage: { from: vi.fn() },
    from: vi.fn(),
  },
  saveOfflineItem: vi.fn(),
  deleteOfflineItem: vi.fn(),
  getOfflineItems: vi.fn(),
  getQueuedRestMutations: vi.fn(),
  removeQueuedRestMutation: vi.fn(),
  updateQueuedRestMutation: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: mocks.supabase,
  supabaseAnonKey: "test-anon-key",
}));
vi.mock("@/lib/offline-db", () => ({
  saveOfflineItem: mocks.saveOfflineItem,
  deleteOfflineItem: mocks.deleteOfflineItem,
  getOfflineItems: mocks.getOfflineItems,
}));
vi.mock("@/lib/offline-platform", () => ({
  getQueuedRestMutations: mocks.getQueuedRestMutations,
  removeQueuedRestMutation: mocks.removeQueuedRestMutation,
  updateQueuedRestMutation: mocks.updateQueuedRestMutation,
}));

import { syncOfflineItems } from "@/lib/offline-sync";

function offlineItem(
  overrides: Partial<OfflineQueueItem> = {},
): OfflineQueueItem {
  return {
    id: "observation-1",
    status: "pending",
    attempts: 0,
    last_error: null,
    created_at: "2026-03-01T10:00:00.000Z",
    payload: {
      field_id: "field-1",
      observation_date: "2026-03-01",
      observation_time: "10:00",
      category: "Pest",
      issue_name: "Aphids",
      severity: "Low",
      latitude: null,
      longitude: null,
      crop_stage: "Flowering",
      affected_area_ha: 1,
      recommendation: null,
      follow_up_date: null,
      status: "Open",
      photo_url: null,
      notes: null,
    },
    photo_blob: null,
    photo_name: null,
    photo_type: null,
    ...overrides,
  };
}

function setupBrowser(online: boolean) {
  const dispatch = vi.fn();
  const setItem = vi.fn();
  vi.stubGlobal("navigator", { onLine: online });
  vi.stubGlobal("localStorage", { setItem });
  vi.stubGlobal("window", { dispatchEvent: dispatch });
  return { dispatch, setItem };
}

describe("offline sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBrowser(true);
    mocks.supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mocks.supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
    });
    mocks.getOfflineItems.mockResolvedValue([]);
    mocks.getQueuedRestMutations.mockResolvedValue([]);
    mocks.supabase.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    });
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === "fields") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
  });

  it("does no work while offline", async () => {
    setupBrowser(false);
    await expect(syncOfflineItems()).resolves.toEqual({ synced: 0, failed: 0 });
    expect(mocks.supabase.auth.getUser).not.toHaveBeenCalled();
    expect(mocks.getOfflineItems).not.toHaveBeenCalled();
  });

  it("requires a signed-in user before reading the offline queue", async () => {
    mocks.supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(syncOfflineItems()).rejects.toThrow("You must be logged in.");
    expect(mocks.getOfflineItems).not.toHaveBeenCalled();
  });

  it("saves the last-sync time and dispatches an update when queues are empty", async () => {
    const { dispatch, setItem } = setupBrowser(true);
    await expect(syncOfflineItems()).resolves.toEqual({ synced: 0, failed: 0 });
    expect(setItem).toHaveBeenCalledWith(
      "agcore-last-sync",
      expect.any(String),
    );
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe("agcore-sync-updated");
  });

  it("uploads photos, syncs observations and activities, then posts queued mutations", async () => {
    const file = new ArrayBuffer(4);
    const item = offlineItem({
      photo_data: file,
      photo_name: "scout.JPG",
      photo_type: "image/jpeg",
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    mocks.supabase.storage.from.mockReturnValue({ upload, remove });
    const observationInsert = vi.fn().mockResolvedValue({ error: null });
    const fieldLookup = vi.fn().mockResolvedValue({
      data: { field_name: "North", crop: "Maize", area_ha: 12 },
    });
    const activityInsert = vi.fn().mockResolvedValue({ error: null });
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === "fields") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: fieldLookup }),
          }),
        };
      }
      return {
        insert:
          table === "scouting_observations"
            ? observationInsert
            : activityInsert,
      };
    });
    mocks.getOfflineItems.mockResolvedValue([item]);
    mocks.getQueuedRestMutations.mockResolvedValue([
      {
        id: "mutation-1",
        url: "https://example.supabase.co/rest/v1/fields",
        method: "POST",
        body: "{}",
        headers: [["content-type", "application/json"]],
        createdAt: "2026-03-01T10:00:00.000Z",
        attempts: 0,
        lastError: null,
      },
    ]);
    mocks.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "photo-id" });

    await expect(syncOfflineItems()).resolves.toEqual({ synced: 2, failed: 0 });

    expect(upload).toHaveBeenCalledWith(
      "user-1/photo-id.JPG",
      expect.any(Blob),
      {
        contentType: "image/jpeg",
        upsert: false,
      },
    );
    expect(observationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        field_id: "field-1",
        photo_path: "user-1/photo-id.JPG",
      }),
    );
    expect(activityInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        field_name: "North",
        crop: "Maize",
        area_ha: 12,
        notes: "Pest: Aphids (Low) · Synced from offline mode",
      }),
    );
    expect(mocks.deleteOfflineItem).toHaveBeenCalledWith(item.id);
    expect(mocks.removeQueuedRestMutation).toHaveBeenCalledWith("mutation-1");
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization"),
    ).toBe("Bearer access-token");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("apikey")).toBe(
      "test-anon-key",
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("records failed photo uploads and removes an uploaded photo when observation insertion fails", async () => {
    const item = offlineItem({
      photo_blob: new Blob(["photo"]),
      photo_name: "plant.j!pg",
      photo_type: null,
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    mocks.supabase.storage.from.mockReturnValue({ upload, remove });
    mocks.supabase.from.mockImplementation((table: string) => ({
      insert: vi.fn().mockResolvedValue({
        error:
          table === "scouting_observations"
            ? new Error("database unavailable")
            : null,
      }),
    }));
    mocks.getOfflineItems.mockResolvedValue([item]);
    vi.stubGlobal("crypto", { randomUUID: () => "photo-id" });

    await expect(syncOfflineItems()).resolves.toEqual({ synced: 0, failed: 1 });
    expect(upload).toHaveBeenCalledWith(
      "user-1/photo-id.jpg",
      expect.any(Blob),
      {
        contentType: "application/octet-stream",
        upsert: false,
      },
    );
    expect(remove).toHaveBeenCalledWith(["user-1/photo-id.jpg"]);
    expect(mocks.saveOfflineItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: item.id,
        status: "failed",
        attempts: 1,
        last_error: "database unavailable",
      }),
    );
  });

  it("ignores zero-byte photos and falls back to a jpg extension for a stored photo", async () => {
    const emptyPhoto = offlineItem({
      id: "empty-photo",
      photo_data: new ArrayBuffer(0),
      photo_blob: new Blob([]),
      photo_name: "empty.jpg",
    });
    const storedPhoto = offlineItem({
      id: "stored-photo",
      photo_blob: new Blob(["photo"]),
      photo_name: ".",
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    mocks.supabase.storage.from.mockReturnValue({
      upload,
      remove: vi.fn().mockResolvedValue({ error: null }),
    });
    mocks.getOfflineItems.mockResolvedValue([emptyPhoto, storedPhoto]);
    vi.stubGlobal("crypto", { randomUUID: () => "photo-id" });

    await expect(syncOfflineItems()).resolves.toEqual({ synced: 2, failed: 0 });

    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(
      "user-1/photo-id.jpg",
      expect.any(Blob),
      {
        contentType: "application/octet-stream",
        upsert: false,
      },
    );
    expect(mocks.supabase.from).toHaveBeenCalledTimes(6);
  });

  it("records generic mutation failures and continues without a session token", async () => {
    const mutation = {
      id: "mutation-1",
      url: "https://example.supabase.co/rest/v1/fields",
      method: "PATCH",
      body: "{}",
      headers: [["authorization", "Bearer old-token"]] as [string, string][],
      createdAt: "2026-03-01T10:00:00.000Z",
      attempts: 2,
      lastError: null,
    };
    mocks.getQueuedRestMutations.mockResolvedValue([mutation]);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not allowed", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncOfflineItems()).resolves.toEqual({ synced: 0, failed: 1 });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("apikey")).toBe("test-anon-key");
    expect(headers.get("authorization")).toBeNull();
    expect(mocks.updateQueuedRestMutation).toHaveBeenCalledWith({
      ...mutation,
      attempts: 3,
      lastError: "not allowed",
    });
  });

  it("uses the unknown-error fallback for non-Error mutation failures", async () => {
    const mutation = {
      id: "mutation-1",
      url: "https://example.supabase.co/rest/v1/fields",
      method: "POST",
      body: "{}",
      headers: [] as [string, string][],
      createdAt: "2026-03-01T10:00:00.000Z",
      attempts: 0,
      lastError: null,
    };
    mocks.getQueuedRestMutations.mockResolvedValue([mutation]);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue("failure"));

    await expect(syncOfflineItems()).resolves.toEqual({ synced: 0, failed: 1 });
    expect(mocks.updateQueuedRestMutation).toHaveBeenCalledWith({
      ...mutation,
      attempts: 1,
      lastError: "Unknown sync error",
    });
  });
});
