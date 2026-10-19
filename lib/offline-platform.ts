"use client";

export type CachedRestResponse = {
  key: string;
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  cachedAt: string;
};

export type QueuedRestMutation = {
  id: string;
  url: string;
  method: string;
  body: string | null;
  headers: [string, string][];
  createdAt: string;
  attempts: number;
  lastError: string | null;
};

const DATABASE = "agcore-platform-v3";
const VERSION = 1;
const CACHE_STORE = "rest-cache";
const MUTATION_STORE = "mutation-queue";

function available() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!available()) {
      reject(new Error("Offline storage is not available."));
      return;
    }

    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function putCachedResponse(value: CachedRestResponse) {
  if (!available()) return;
  await transact(CACHE_STORE, "readwrite", (store) => store.put(value));
}

export async function getCachedResponse(key: string) {
  if (!available()) return undefined;
  return transact<CachedRestResponse | undefined>(CACHE_STORE, "readonly", (store) =>
    store.get(key),
  );
}

export async function queueRestMutation(value: QueuedRestMutation) {
  await transact(MUTATION_STORE, "readwrite", (store) => store.put(value));
  window.dispatchEvent(new CustomEvent("agcore-sync-updated"));
}

export async function getQueuedRestMutations() {
  if (!available()) return [];
  const items = await transact<QueuedRestMutation[]>(
    MUTATION_STORE,
    "readonly",
    (store) => store.getAll(),
  );
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueuedRestMutation(id: string) {
  await transact(MUTATION_STORE, "readwrite", (store) => store.delete(id));
  window.dispatchEvent(new CustomEvent("agcore-sync-updated"));
}

export async function updateQueuedRestMutation(item: QueuedRestMutation) {
  await transact(MUTATION_STORE, "readwrite", (store) => store.put(item));
}

function cacheKey(url: string, headers: Headers) {
  return `${url}|${headers.get("accept-profile") || "public"}`;
}

function safeHeaders(headers: Headers) {
  return Array.from(headers.entries()).filter(
    ([name]) => !["authorization", "apikey"].includes(name.toLowerCase()),
  );
}

export function createOfflineFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const isRestRequest =
      request.url.includes(".supabase.co/rest/v1/") ||
      request.url.includes("/rest/v1/");

    if (!isRestRequest || !available()) return baseFetch(request);

    if (request.method === "GET" || request.method === "HEAD") {
      const key = cacheKey(request.url, request.headers);
      try {
        const response = await baseFetch(request);
        if (response.ok && request.method === "GET") {
          const clone = response.clone();
          await putCachedResponse({
            key,
            body: await clone.text(),
            status: clone.status,
            statusText: clone.statusText,
            headers: Array.from(clone.headers.entries()),
            cachedAt: new Date().toISOString(),
          });
        }
        return response;
      } catch (error) {
        const cached = await getCachedResponse(key);
        if (cached) {
          return new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers: [...cached.headers, ["x-agcore-cache", "offline"]],
          });
        }
        throw error;
      }
    }

    const queuedBody = request.body ? await request.clone().text() : null;
    try {
      return await baseFetch(request);
    } catch (error) {
      if (navigator.onLine) throw error;
      await queueRestMutation({
        id: crypto.randomUUID(),
        url: request.url,
        method: request.method,
        body: queuedBody,
        headers: safeHeaders(request.headers),
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
      });
      return new Response("[]", {
        status: 202,
        headers: {
          "content-type": "application/json",
          "x-agcore-queued": "offline",
        },
      });
    }
  };
}
