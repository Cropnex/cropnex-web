import type { OfflineQueueItem } from "@/types/offline";

const DB_NAME = "agcore-offline";
const STORE_NAME = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineItem(
  item: OfflineQueueItem
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

export async function getOfflineItems(): Promise<
  OfflineQueueItem[]
> {
  const db = await openDb();

  const items = await new Promise<OfflineQueueItem[]>(
    (resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();

      request.onsuccess = () =>
        resolve((request.result || []) as OfflineQueueItem[]);
      request.onerror = () => reject(request.error);
    }
  );

  db.close();
  return items.sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
}

export async function deleteOfflineItem(
  id: string
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}
