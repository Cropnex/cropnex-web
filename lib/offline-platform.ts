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
  accountId: string;
  url: string;
  method: string;
  body: string | null;
  headers: [string, string][];
  createdAt: string;
  attempts: number;
  lastError: string | null;
};

const DATABASE = "agcore-platform-v3";
const VERSION = 2;
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
      } else {
        request.transaction!.objectStore(CACHE_STORE).clear();
      }
      if (!db.objectStoreNames.contains(MUTATION_STORE)) {
        db.createObjectStore(MUTATION_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
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

export async function getQueuedRestMutations(accountId: string) {
  if (!available()) return [];
  const items = await transact<QueuedRestMutation[]>(
    MUTATION_STORE,
    "readonly",
    (store) => store.getAll(),
  );
  return items.filter(item => accountId && item.accountId === accountId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueuedRestMutation(id: string) {
  await transact(MUTATION_STORE, "readwrite", (store) => store.delete(id));
  window.dispatchEvent(new CustomEvent("agcore-sync-updated"));
}

export async function updateQueuedRestMutation(item: QueuedRestMutation) {
  await transact(MUTATION_STORE, "readwrite", (store) => store.put(item));
}

// These claims partition local data. Supabase verifies the token on the server.
function requestSession(headers: Headers) {
  const match = /^Bearer ([^.]+)\.([^.]+)\.[^.]+$/i.exec(headers.get("authorization") || "");
  if (!match) return null;
  try {
    const claims = JSON.parse(atob(match[2].replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.role !== "authenticated" || typeof claims.sub !== "string" ||
        typeof claims.session_id !== "string" || !claims.sub || !claims.session_id ||
        typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    return { accountId: claims.sub, sessionId: claims.session_id };
  } catch {
    return null;
  }
}

function safeHeaders(headers: Headers) {
  return Array.from(headers.entries()).filter(
    ([name]) => !["authorization", "apikey"].includes(name.toLowerCase()),
  );
}

export function createOfflineFetch(supabaseUrl: string, baseFetch: typeof fetch = fetch): typeof fetch {
  const origin = new URL(supabaseUrl).origin;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith("/rest/v1/") || !available()) {
      return baseFetch(request);
    }
    const session = requestSession(request.headers);
    if (!session) return baseFetch(request);

    if (request.method === "GET" || request.method === "HEAD") {
      const key = JSON.stringify([session.accountId, session.sessionId, request.url,
        request.headers.get("accept-profile"), request.headers.get("accept"),
        request.headers.get("range"), request.headers.get("prefer")]);
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
          }).catch(() => {});
        }
        return response;
      } catch (error) {
        if (request.signal.aborted || navigator.onLine || request.method !== "GET") throw error;
        const cached = await getCachedResponse(key).catch(() => undefined);
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
      if (request.signal.aborted || navigator.onLine || url.pathname.startsWith("/rest/v1/rpc/")) throw error;
      await queueRestMutation({
        id: crypto.randomUUID(),
        accountId: session.accountId,
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
