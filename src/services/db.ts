import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { COLLECTIONS, type ActiveWorkout, type CollectionName, type Collections } from '@/domain/types';

const DB_NAME = 'iron-quest';
const DRAFT_LS = 'ironQuest.draft.v2';

interface Schema extends DBSchema {
  records: { key: string; value: { key: string; collection: CollectionName; id: string; updatedAt: number; deleted?: boolean; data: unknown } ; indexes: { collection: string } };
  blobs: { key: string; value: { id: string; dataUrl: string } };
  meta: { key: string; value: { key: string; value: unknown } };
}

export type Loaded = { [K in CollectionName]: Collections[K][] };
export interface RawRecord { collection: CollectionName; id: string; updatedAt: number; deleted?: boolean; data: unknown }

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
/** True when IndexedDB could not be opened; the UI must warn loudly instead of pretending to save. */
export let storageFailed = false;

function db() {
  dbp ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(d) {
      const s = d.createObjectStore('records', { keyPath: 'key' });
      s.createIndex('collection', 'collection');
      d.createObjectStore('blobs', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  return dbp;
}
const k = (c: CollectionName, id: string) => `${c}/${id}`;

/** Test seam: drop the cached connection. */
export const _resetForTests = () => { dbp = null; storageFailed = false; };

export async function loadAll(): Promise<Loaded> {
  const out = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as Loaded;
  try {
    const rows = await (await db()).getAll('records');
    for (const r of rows) if (!r.deleted) (out[r.collection] as unknown[]).push(r.data);
  } catch (e) {
    storageFailed = true;
    console.warn('IndexedDB unavailable', e);
  }
  return out;
}

export async function putRecord<C extends CollectionName>(collection: C, rec: Collections[C] & { id: string; updatedAt: number }) {
  await (await db()).put('records', { key: k(collection, rec.id), collection, id: rec.id, updatedAt: rec.updatedAt, data: rec });
}

/** Deletion leaves a tombstone so a sync can't bring the record back from another device. */
export async function deleteRecord(collection: CollectionName, id: string, at = Date.now()) {
  await (await db()).put('records', { key: k(collection, id), collection, id, updatedAt: at, deleted: true, data: null });
}

export async function putMany(rows: RawRecord[]) {
  const tx = (await db()).transaction('records', 'readwrite');
  await Promise.all(rows.map((r) => tx.store.put({ key: k(r.collection, r.id), ...r })));
  await tx.done;
}

export async function allRaw(): Promise<RawRecord[]> { return (await (await db()).getAll('records')) as RawRecord[]; }
export async function isTombstoned(collection: CollectionName, id: string) { const r = await (await db()).get('records', k(collection, id)); return !!r?.deleted; }

export async function getMeta<T>(key: string): Promise<T | undefined> { return (await (await db()).get('meta', key))?.value as T | undefined; }
export async function setMeta(key: string, value: unknown) { await (await db()).put('meta', { key, value }); }

export async function putBlob(id: string, dataUrl: string) { await (await db()).put('blobs', { id, dataUrl }); }
export async function getBlob(id: string) { return (await (await db()).get('blobs', id))?.dataUrl; }
export async function deleteBlob(id: string) { await (await db()).delete('blobs', id); }
export async function allBlobs() { return (await db()).getAll('blobs'); }

export async function wipeAll() {
  const d = await db();
  const tx = d.transaction(['records', 'blobs', 'meta'], 'readwrite');
  await Promise.all([tx.objectStore('records').clear(), tx.objectStore('blobs').clear(), tx.objectStore('meta').clear()]);
  await tx.done;
}

// ---- Active workout draft ----
// Written to BOTH stores on every change. localStorage is synchronous, so a tab closed mid-keystroke
// can't lose the last edit; IndexedDB is the fallback for when localStorage is full or blocked.
export function saveDraft(d: ActiveWorkout | null) {
  try { if (d) localStorage.setItem(DRAFT_LS, JSON.stringify(d)); else localStorage.removeItem(DRAFT_LS); } catch { /* covered by IDB */ }
  return setMeta('draft', d).catch(() => undefined);
}
export async function loadDraft(): Promise<ActiveWorkout | null> {
  let ls: ActiveWorkout | null = null;
  try { const raw = localStorage.getItem(DRAFT_LS); if (raw) ls = JSON.parse(raw); } catch { /* corrupt or blocked */ }
  let idb: ActiveWorkout | null = null;
  try { idb = (await getMeta<ActiveWorkout | null>('draft')) ?? null; } catch { /* unavailable */ }
  if (ls && idb) return ls.updatedAt >= idb.updatedAt ? ls : idb;
  return ls ?? idb;
}
