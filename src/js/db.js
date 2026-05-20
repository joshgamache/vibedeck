let db;

export function initDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('the-deck-v1', 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('decks')) d.createObjectStore('decks', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('cards')) {
        const s = d.createObjectStore('cards', { keyPath: 'id' });
        s.createIndex('deckId', 'deckId');
      }
      if (!d.objectStoreNames.contains('history')) {
        const s = d.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        s.createIndex('deckId', 'deckId');
      }
      if (!d.objectStoreNames.contains('drawState')) d.createObjectStore('drawState', { keyPath: 'deckId' });
    };
    req.onsuccess = e => {
      db = e.target.result;
      res(db);
    };
    req.onerror = e => rej(e);
  });
}

export const iGet = (s, k) => new Promise((r, j) => {
  const q = db.transaction(s, 'readonly').objectStore(s).get(k);
  q.onsuccess = () => r(q.result);
  q.onerror = () => j(q.error);
});

export const iPut = (s, o) => new Promise((r, j) => {
  const q = db.transaction(s, 'readwrite').objectStore(s).put(o);
  q.onsuccess = () => r(q.result);
  q.onerror = () => j(q.error);
});

export const iDel = (s, k) => new Promise((r, j) => {
  const q = db.transaction(s, 'readwrite').objectStore(s).delete(k);
  q.onsuccess = () => r();
  q.onerror = () => j(q.error);
});

export const iAll = (s) => new Promise((r, j) => {
  const q = db.transaction(s, 'readonly').objectStore(s).getAll();
  q.onsuccess = () => r(q.result);
  q.onerror = () => j(q.error);
});

export const iIdx = (s, i, v) => new Promise((r, j) => {
  const q = db.transaction(s, 'readonly').objectStore(s).index(i).getAll(v);
  q.onsuccess = () => r(q.result);
  q.onerror = () => j(q.error);
});

export function iDelIdx(store, index, value) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    const req = os.index(index).getAllKeys(value);
    req.onsuccess = () => {
      const keys = req.result;
      if (!keys.length) return res();
      keys.forEach(k => os.delete(k));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
}

export function iBulkPut(store, items) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    items.forEach(i => os.put(i));
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
