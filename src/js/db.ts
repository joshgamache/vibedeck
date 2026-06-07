let db: IDBDatabase;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open("the-deck-v1", 1);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const d = (e.target as IDBOpenDBRequest).result;
      if (!d.objectStoreNames.contains("decks")) d.createObjectStore("decks", { keyPath: "id" });
      if (!d.objectStoreNames.contains("cards")) {
        const s = d.createObjectStore("cards", { keyPath: "id" });
        s.createIndex("deckId", "deckId");
      }
      if (!d.objectStoreNames.contains("history")) {
        const s = d.createObjectStore("history", { keyPath: "id", autoIncrement: true });
        s.createIndex("deckId", "deckId");
      }
      if (!d.objectStoreNames.contains("drawState"))
        d.createObjectStore("drawState", { keyPath: "deckId" });
    };
    req.onsuccess = (e) => {
      db = (e.target as IDBOpenDBRequest).result;
      res(db);
    };
    req.onerror = (e) => rej((e.target as IDBOpenDBRequest).error);
  });
}

export const iGet = <T>(s: string, k: IDBValidKey): Promise<T | undefined> =>
  new Promise((r, j) => {
    const q = db.transaction(s, "readonly").objectStore(s).get(k);
    q.onsuccess = () => r(q.result as T | undefined);
    q.onerror = () => j(q.error);
  });

export const iPut = <T>(s: string, o: T): Promise<IDBValidKey> =>
  new Promise((r, j) => {
    const q = db.transaction(s, "readwrite").objectStore(s).put(o);
    q.onsuccess = () => r(q.result);
    q.onerror = () => j(q.error);
  });

export const iDel = (s: string, k: IDBValidKey): Promise<void> =>
  new Promise((r, j) => {
    const q = db.transaction(s, "readwrite").objectStore(s).delete(k);
    q.onsuccess = () => r();
    q.onerror = () => j(q.error);
  });

export const iAll = <T>(s: string): Promise<T[]> =>
  new Promise((r, j) => {
    const q = db.transaction(s, "readonly").objectStore(s).getAll();
    q.onsuccess = () => r(q.result as T[]);
    q.onerror = () => j(q.error);
  });

export const iIdx = <T>(s: string, i: string, v: IDBValidKey | IDBKeyRange): Promise<T[]> =>
  new Promise((r, j) => {
    const q = db.transaction(s, "readonly").objectStore(s).index(i).getAll(v);
    q.onsuccess = () => r(q.result as T[]);
    q.onerror = () => j(q.error);
  });

export function iDelIdx(
  store: string,
  index: string,
  value: IDBValidKey | IDBKeyRange,
): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const req = os.index(index).getAllKeys(value);
    req.onsuccess = () => {
      const keys = req.result;
      if (!keys.length) return res();
      keys.forEach((k) => os.delete(k));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
}

export function iBulkPut<T>(store: string, items: T[]): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    items.forEach((i) => os.put(i));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
