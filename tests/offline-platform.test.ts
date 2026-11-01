import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOfflineFetch,
  getCachedResponse,
  getQueuedRestMutations,
  putCachedResponse,
  queueRestMutation,
  removeQueuedRestMutation,
  updateQueuedRestMutation,
} from "@/lib/offline-platform";

describe("offline platform storage and fetch", () => {
  beforeEach(() => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    vi.stubGlobal("window", Object.assign(new EventTarget(), { indexedDB }));
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores cached responses and returns undefined outside the browser", async () => {
    const value = {
      key: "https://example.supabase.co/rest/v1/fields|public",
      body: "[]",
      status: 200,
      statusText: "OK",
      headers: [["content-type", "application/json"]] as [string, string][],
      cachedAt: "2026-03-01T00:00:00.000Z",
    };
    await putCachedResponse(value);
    await expect(getCachedResponse(value.key)).resolves.toEqual(value);

    vi.stubGlobal("window", undefined);
    await expect(getCachedResponse(value.key)).resolves.toBeUndefined();
    await expect(putCachedResponse(value)).resolves.toBeUndefined();
  });

  it("rejects queue writes and removals when offline storage is unavailable", async () => {
    vi.stubGlobal("window", undefined);
    const mutation = {
      id: "mutation-1",
      url: "https://example.supabase.co/rest/v1/fields",
      method: "POST",
      body: "{}",
      headers: [] as [string, string][],
      createdAt: "2026-03-01T00:00:00.000Z",
      attempts: 0,
      lastError: null,
    };
    await expect(queueRestMutation(mutation)).rejects.toThrow(
      "Offline storage is not available.",
    );
    await expect(removeQueuedRestMutation(mutation.id)).rejects.toThrow(
      "Offline storage is not available.",
    );
    await expect(updateQueuedRestMutation(mutation)).rejects.toThrow(
      "Offline storage is not available.",
    );
    await expect(getQueuedRestMutations()).resolves.toEqual([]);
  });

  it("queues, sorts, updates, and removes mutations while dispatching queue events", async () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const later = {
      id: "later",
      url: "https://example.supabase.co/rest/v1/fields",
      method: "POST",
      body: "{}",
      headers: [] as [string, string][],
      createdAt: "2026-03-02T00:00:00.000Z",
      attempts: 0,
      lastError: null,
    };
    const earlier = {
      ...later,
      id: "earlier",
      createdAt: "2026-03-01T00:00:00.000Z",
    };
    await queueRestMutation(later);
    await queueRestMutation(earlier);
    await expect(getQueuedRestMutations()).resolves.toEqual([earlier, later]);
    await updateQueuedRestMutation({
      ...earlier,
      attempts: 1,
      lastError: "offline",
    });
    await expect(getQueuedRestMutations()).resolves.toContainEqual({
      ...earlier,
      attempts: 1,
      lastError: "offline",
    });
    await removeQueuedRestMutation("earlier");
    await expect(getQueuedRestMutations()).resolves.toEqual([later]);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch.mock.calls[0][0].type).toBe("agcore-sync-updated");
  });

  it("passes non-REST requests and requests outside the browser directly through", async () => {
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("ok"));
    const offlineFetch = createOfflineFetch(baseFetch);
    await offlineFetch("https://example.test/api");
    expect(baseFetch).toHaveBeenCalledOnce();

    vi.stubGlobal("window", undefined);
    await offlineFetch("https://example.supabase.co/rest/v1/fields");
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it("caches successful GET responses by URL and accept-profile", async () => {
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('[{"id":"field-1"}]', {
          headers: { "content-type": "application/json" },
        }),
      );
    const offlineFetch = createOfflineFetch(baseFetch);
    const response = await offlineFetch(
      "https://example.supabase.co/rest/v1/fields",
      {
        headers: { "accept-profile": "tenant" },
      },
    );
    expect(await response.text()).toBe('[{"id":"field-1"}]');
    await expect(
      getCachedResponse("https://example.supabase.co/rest/v1/fields|tenant"),
    ).resolves.toMatchObject({ body: '[{"id":"field-1"}]', status: 200 });
  });

  it("uses a cached GET response after a network failure and rethrows when no cache exists", async () => {
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("cached", { status: 200 }))
      .mockRejectedValue(new Error("offline"));
    const offlineFetch = createOfflineFetch(baseFetch);
    await offlineFetch("https://example.supabase.co/rest/v1/fields");
    const cached = await offlineFetch(
      "https://example.supabase.co/rest/v1/fields",
    );
    expect(await cached.text()).toBe("cached");
    expect(cached.headers.get("x-agcore-cache")).toBe("offline");

    await expect(
      offlineFetch("https://example.supabase.co/rest/v1/other"),
    ).rejects.toThrow("offline");
  });

  it("does not cache HEAD requests or failed GET responses", async () => {
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("failure", { status: 503 }));
    const offlineFetch = createOfflineFetch(baseFetch);
    await offlineFetch("https://example.supabase.co/rest/v1/fields", {
      method: "HEAD",
    });
    await offlineFetch("https://example.supabase.co/rest/v1/fields");
    await expect(
      getCachedResponse("https://example.supabase.co/rest/v1/fields|public"),
    ).resolves.toBeUndefined();
  });

  it("queues failed offline mutations without authorization secrets", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("crypto", { randomUUID: () => "mutation-1" });
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const offlineFetch = createOfflineFetch(baseFetch);
    const response = await offlineFetch(
      "https://example.supabase.co/rest/v1/fields",
      {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          apikey: "secret-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ field: "North" }),
      },
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("x-agcore-queued")).toBe("offline");
    await expect(getQueuedRestMutations()).resolves.toContainEqual(
      expect.objectContaining({
        id: "mutation-1",
        body: '{"field":"North"}',
        headers: [["content-type", "application/json"]],
        attempts: 0,
        lastError: null,
      }),
    );
  });

  it("does not queue failed online mutations and preserves successful error responses", async () => {
    const offline = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    await expect(
      createOfflineFetch(offline)(
        "https://example.supabase.co/rest/v1/fields",
        {
          method: "DELETE",
        },
      ),
    ).rejects.toThrow("offline");
    const failedResponse = new Response("validation error", { status: 400 });
    const online = vi.fn<typeof fetch>().mockResolvedValue(failedResponse);
    await expect(
      createOfflineFetch(online)("https://example.supabase.co/rest/v1/fields", {
        method: "POST",
        body: "{}",
      }),
    ).resolves.toBe(failedResponse);
    await expect(getQueuedRestMutations()).resolves.toEqual([]);
  });
});
