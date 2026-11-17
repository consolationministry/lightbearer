// Device-local storage for offline recordings (IndexedDB). Works with no network.
const DB_NAME = "lightbearer-offline-recordings";
const STORE = "recordings";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This device cannot store recordings offline.")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Device storage could not be opened."));
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result && "result" in result ? result.result : undefined); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error("Device storage failed.")); };
  });
}

export function saveLocalRecording(record) {
  if (!record || !record.id || !record.blob) return Promise.reject(new Error("Nothing to save on this device."));
  return run("readwrite", store => store.put(record));
}
export async function listLocalRecordings() {
  const rows = await run("readonly", store => store.getAll()) || [];
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export function getLocalRecording(id) { return run("readonly", store => store.get(id)); }
export function deleteLocalRecording(id) { return run("readwrite", store => store.delete(id)); }
