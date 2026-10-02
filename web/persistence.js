const DB_NAME = "nukegrid-local";
const DB_VERSION = 1;
const STORE = "saves";
export const AUTOSAVE_DEBOUNCE_MS = 350;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "slot" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("INDEXEDDB_TRANSACTION_ABORTED"));
    tx.onerror = () => reject(tx.error || new Error("INDEXEDDB_TRANSACTION_FAILED"));
  });
}

export async function loadCurrentSave() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get("current");
      request.onsuccess = () => resolve(request.result?.save ?? null);
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_READ_FAILED"));
    });
  } finally {
    db.close();
  }
}

export async function persistSave(save) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const current = store.get("current");
    current.onsuccess = () => {
      if (current.result?.save) {
        store.put({ slot: "previous", save: current.result.save });
      }
      store.put({ slot: "current", save });
    };
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function loadPreviousSave() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get("previous");
      request.onsuccess = () => resolve(request.result?.save ?? null);
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_READ_FAILED"));
    });
  } finally {
    db.close();
  }
}

export function persistenceErrorCode(error) {
  if (error?.name === "QuotaExceededError") return "SAVE_STORAGE_QUOTA_EXCEEDED";
  return "SAVE_STORAGE_FAILED";
}

export function downloadSave(save) {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "nukegrid-valmorne-save.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readSaveFile(file) {
  return JSON.parse(await file.text());
}
