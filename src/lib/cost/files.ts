const DB_NAME = "bund-house-files";
const STORE = "files";

export type DishFile = {
  id: string;
  dishId: string;
  name: string;
  type: string;
  size: number;
  added: string;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("dishId", "dishId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listDishFiles(dishId: string): Promise<DishFile[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const index = tx.objectStore(STORE).index("dishId");
  const rows = await new Promise<DishFile[]>((resolve, reject) => {
    const req = index.getAll(dishId);
    req.onsuccess = () => resolve(req.result as DishFile[]);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows.sort((a, b) => a.added.localeCompare(b.added));
}

export async function addDishFiles(dishId: string, files: File[]) {
  if (files.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const added = new Date().toISOString();
  for (const file of files) {
    store.add({
      id: `file-${Math.random().toString(36).slice(2, 10)}`,
      dishId,
      name: file.name || "file",
      type: file.type || "application/octet-stream",
      size: file.size,
      added,
      blob: file,
    });
  }
  await txDone(tx);
  db.close();
}

export async function removeDishFile(id: string) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  db.close();
}

export async function clearDishFiles(dishId: string) {
  const rows = await listDishFiles(dishId);
  if (rows.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const row of rows) store.delete(row.id);
  await txDone(tx);
  db.close();
}

export async function clearAllFiles() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await txDone(tx);
  db.close();
}
