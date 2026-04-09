// Mutation queue for offline support
// Option B from Phase 3 spec: Service Worker + IndexedDB mutation queue
// Single-user MVP, only session writes need to survive offline

const DB_NAME = "offline-mutations";
const STORE_NAME = "pending";
const DB_VERSION = 1;

interface Mutation {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
  });
  return dbPromise;
}

export async function queueMutation(mutation: Omit<Mutation, "id" | "timestamp">): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record: Mutation = { ...mutation, timestamp: Date.now() };
      const request = store.add(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to queue mutation", err);
  }
}

export async function getPendingMutations(): Promise<Mutation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function removeMutation(id: number): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to remove mutation", err);
  }
}

export async function replayMutations(onProgress?: (count: number) => void): Promise<void> {
  const mutations = await getPendingMutations();
  for (const mutation of mutations) {
    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: mutation.headers,
        body: mutation.body,
      });
      if (res.ok && mutation.id !== undefined) {
        await removeMutation(mutation.id);
        onProgress?.(mutations.length);
      }
    } catch {
      // Network still unavailable, stop replaying
      break;
    }
  }
}

// Wrapper around fetch that queues on failure
export async function fetchWithQueue(
  url: string,
  options: RequestInit = {}
): Promise<{ offline?: boolean; queued?: boolean; data?: any }> {
  try {
    const res = await fetch(url, options);
    return { data: await res.json() };
  } catch (err) {
    const isNetworkError = err instanceof TypeError && err.message.includes("Failed to fetch");
    if (isNetworkError || !navigator.onLine) {
      await queueMutation({
        url,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers as Record<string, string>),
        },
        body: options.body as string || null,
      });
      return { offline: true, queued: true };
    }
    throw err;
  }
}

// Clear all pending mutations (after successful session save)
export async function clearQueue(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.error("Failed to clear queue", err);
  }
}

// Initialize network listener
export function initNetworkListener(onOnline: () => void): void {
  window.addEventListener("online", () => {
    // Small delay to let connection stabilize
    setTimeout(onOnline, 1000);
  });
}