const DB_NAME = 'AttentionQuadrantDB';
const DB_VERSION = 4;
const ANNOTATIONS_STORE = 'annotations';
const RECORDINGS_STORE = 'recordings';
const SESSIONS_STORE = 'sessions';
const REVIEW_STORE = 'reviewSessions';

function openDB() {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onblocked = () => { blocked = true; reject(new Error('請關閉其他舊版標註分頁，再重試載入。')); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close(); else resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ANNOTATIONS_STORE)) {
        db.createObjectStore(ANNOTATIONS_STORE, { keyPath: 'annotation_id' });
      }
      if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
        db.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'session_id' });
      }
      if (!db.objectStoreNames.contains(REVIEW_STORE)) {
        db.createObjectStore(REVIEW_STORE, { keyPath: 'session_id' });
      }
    };
  });
}

// A successful request can still be rolled back. Only transaction completion means saved.
async function transactionResult(storeName, mode, operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    let request;
    try {
      tx = db.transaction(storeName, mode);
      request = operation(tx.objectStore(storeName));
    } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('儲存未完成，請重試。')); };
  });
}

export function saveReviewSession(session, expectedRevision = session.revision - 1) {
  if (session.schema_version !== 2 || session.kind !== 'fixed-self-report-review') {
    return Promise.reject(new Error('不支援的回顧資料格式。'));
  }
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(REVIEW_STORE, 'readwrite');
    const store = tx.objectStore(REVIEW_STORE);
    let conflict = null;
    const read = store.get(session.session_id);
    read.onsuccess = () => {
      const existing = read.result;
      const identicalRetry = existing && JSON.stringify(existing) === JSON.stringify(session);
      if (!identicalRetry && (existing?.revision ?? 0) !== expectedRevision) {
        conflict = new Error('另一個分頁已更新這筆紀錄。請先下載目前草稿，再重新載入，避免覆蓋其他變更。');
        tx.abort(); return;
      }
      try { store.put(session); }
      catch (error) { conflict = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(conflict || tx.error || new Error('儲存未完成，請重試。')); };
  }));
}

export function getReviewSession(id) {
  return transactionResult(REVIEW_STORE, 'readonly', store => store.get(id));
}

export function getAllReviewSessions() {
  return transactionResult(REVIEW_STORE, 'readonly', store => store.getAll());
}

export async function saveAnnotation(annotation) {
  return transactionResult(ANNOTATIONS_STORE, 'readwrite', store => store.put(annotation));
}

export async function getAllAnnotations() {
  return transactionResult(ANNOTATIONS_STORE, 'readonly', store => store.getAll());
}

export async function saveSession(session) {
  return transactionResult(SESSIONS_STORE, 'readwrite', store => store.put(session));
}

export async function getAllSessions() {
  return transactionResult(SESSIONS_STORE, 'readonly', store => store.getAll());
}

export async function clearSessions() {
  return transactionResult(SESSIONS_STORE, 'readwrite', store => store.clear());
}

export async function getRecording(id) {
  const oldDB = await new Promise((resolve, reject) => {
    const request = indexedDB.open('BehaviorRecorderDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id' });
      }
    };
  });
  return new Promise((resolve, reject) => {
    const tx = oldDB.transaction('recordings', 'readonly');
    const store = tx.objectStore('recordings');
    const request = store.get(id);
    tx.oncomplete = () => { oldDB.close(); resolve(request.result); };
    tx.onabort = () => { oldDB.close(); reject(tx.error || request.error); };
  });
}
