// Simple IndexedDB helpers for storing GLB blobs locally so they persist across refreshes.
// DB: aircraft-studio, store: models, key: modelId (string), value: Blob

const DB_NAME = 'aircraft-studio';
const STORE_NAME = 'models';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return reject(new Error('IndexedDB not available'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveModelBlob(modelId, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('IDB transaction error'));
    tx.objectStore(STORE_NAME).put(blob, modelId);
  });
}

export async function getModelBlob(modelId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    tx.onerror = () => reject(tx.error || new Error('IDB transaction error'));
    const req = tx.objectStore(STORE_NAME).get(modelId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('IDB get error'));
  });
}

export async function deleteModelBlob(modelId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('IDB transaction error'));
    tx.objectStore(STORE_NAME).delete(modelId);
  });
}

export async function getModelObjectURL(modelId) {
  const blob = await getModelBlob(modelId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
