import type { CollectionName } from '@/domain/types';
import * as db from './db';

/** Local-only collections never leave the device. Progress photos are private by design. */
const LOCAL_ONLY = new Set<CollectionName>(['photos']);
const PAGE = 500;

export interface RemoteRow { collection: CollectionName; id: string; data: unknown; deleted: boolean; client_updated_at: number; server_seq: number }
export interface Remote {
  pull(afterSeq: number, limit: number): Promise<RemoteRow[]>;
  push(rows: { collection: CollectionName; id: string; data: unknown; deleted: boolean; client_updated_at: number }[]): Promise<void>;
}

export interface SyncResult { pulled: number; pushed: number }

/**
 * Pull-then-push, last-write-wins per record. Offline-first: local IndexedDB stays the source of
 * truth for the UI and this can fail at any point without losing anything; the next run resumes.
 * Cursors live in meta and only advance after the corresponding data is durably written.
 */
export async function syncOnce(remote: Remote, ownerId: string): Promise<SyncResult> {
  const cursorKey = `sync:${ownerId}:cursor`, pushedKey = `sync:${ownerId}:pushedAt`;
  let cursor = (await db.getMeta<number>(cursorKey)) ?? 0;
  let pulled = 0;
  const local = new Map((await db.allRaw()).map((r) => [`${r.collection}/${r.id}`, r]));

  for (;;) {
    const page = await remote.pull(cursor, PAGE);
    if (!page.length) break;
    const fresh: db.RawRecord[] = [];
    for (const r of page) {
      const mine = local.get(`${r.collection}/${r.id}`);
      if (!mine || r.client_updated_at > mine.updatedAt) {
        const rec: db.RawRecord = { collection: r.collection, id: r.id, updatedAt: r.client_updated_at, deleted: r.deleted || undefined, data: r.deleted ? null : r.data };
        fresh.push(rec);
        local.set(`${r.collection}/${r.id}`, rec);
      }
    }
    if (fresh.length) await db.putMany(fresh);
    pulled += fresh.length;
    cursor = Math.max(cursor, ...page.map((r) => Number(r.server_seq)));
    await db.setMeta(cursorKey, cursor);
    if (page.length < PAGE) break;
  }

  const pushedAt = (await db.getMeta<number>(pushedKey)) ?? 0;
  const outgoing = [...local.values()].filter((r) => r.updatedAt > pushedAt && !LOCAL_ONLY.has(r.collection));
  let pushed = 0;
  for (let i = 0; i < outgoing.length; i += PAGE) {
    const chunk = outgoing.slice(i, i + PAGE);
    await remote.push(chunk.map((r) => ({ collection: r.collection, id: r.id, data: r.deleted ? null : r.data, deleted: !!r.deleted, client_updated_at: r.updatedAt })));
    pushed += chunk.length;
    await db.setMeta(pushedKey, Math.max(pushedAt, ...chunk.map((r) => r.updatedAt)));
  }
  return { pulled, pushed };
}
