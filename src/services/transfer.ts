import type { Exercise, Routine, Workout } from '@/domain/types';
import { COLLECTIONS, type CollectionName } from '@/domain/types';
import { uid } from '@/domain/util';
import * as db from './db';

/** Delivers a file to the user's device. */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function makeBackup() {
  const raw = await db.allRaw();
  const data: Record<string, unknown[]> = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  const tombstones: { collection: string; id: string; updatedAt: number }[] = [];
  for (const r of raw) { if (r.deleted) tombstones.push({ collection: r.collection, id: r.id, updatedAt: r.updatedAt }); else data[r.collection].push(r.data); }
  return { app: 'iron-quest' as const, version: 1, exportedAt: Date.now(), data, tombstones, photos: await db.allBlobs() };
}

export interface ImportPreview { counts: Record<string, number>; rows: db.RawRecord[]; photos: { id: string; dataUrl: string }[]; rejected: string[] }

/** Validates a backup file without writing anything. The caller shows the preview, then commits. */
export async function previewBackup(text: string): Promise<ImportPreview> {
  const { backupSchema, importValidators } = await import('@/domain/schemas');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  const res = backupSchema.safeParse(parsed);
  if (!res.success) throw new Error('That file is not an Iron Quest backup.');
  const rows: db.RawRecord[] = [];
  const counts: Record<string, number> = {};
  const rejected: string[] = [];
  for (const [collection, list] of Object.entries(res.data.data)) {
    const v = importValidators[collection];
    for (const rec of list ?? []) {
      if (v && !v.safeParse(rec).success) { rejected.push(`${collection}/${String(rec.id)}`); continue; }
      rows.push({ collection: collection as CollectionName, id: String(rec.id), updatedAt: Number((rec as { updatedAt?: number }).updatedAt) || 0, data: rec });
      counts[collection] = (counts[collection] ?? 0) + 1;
    }
  }
  return { counts, rows, photos: res.data.photos ?? [], rejected };
}

/** Merges by last-write-wins per record, so re-importing an old backup can't clobber newer edits. */
export async function commitImport(p: Pick<ImportPreview, 'rows' | 'photos'>) {
  const existing = new Map((await db.allRaw()).map((r) => [`${r.collection}/${r.id}`, r]));
  const fresh = p.rows.filter((r) => { const e = existing.get(`${r.collection}/${r.id}`); return !e || r.updatedAt >= e.updatedAt; });
  await db.putMany(fresh);
  for (const b of p.photos) await db.putBlob(b.id, b.dataUrl);
  return fresh.length;
}

/** Routine share codes work with no backend at all: the routine travels inside the link. */
export function encodeShare(routine: Routine, lookup: (id: string) => Exercise | undefined): string {
  const exercises = routine.exercises.map((e) => lookup(e.exerciseId)).filter((e): e is Exercise => !!e && !!e.custom);
  const payload = JSON.stringify({ v: 1, routine: { ...routine, folderId: undefined }, exercises });
  const bytes = new TextEncoder().encode(payload);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function decodeShare(code: string): Promise<{ routine: Routine; exercises: Exercise[] }> {
  const { sharePayloadSchema } = await import('@/domain/schemas');
  let json: unknown;
  try {
    const bin = atob(code.trim().replace(/-/g, '+').replace(/_/g, '/'));
    json = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { throw new Error('That share code is not valid.'); }
  const r = sharePayloadSchema.safeParse(json);
  if (!r.success) throw new Error('That share code is not valid.');
  return { routine: { ...(r.data.routine as Routine), id: uid(), days: [], folderId: undefined, updatedAt: Date.now() }, exercises: r.data.exercises as Exercise[] };
}

export type { Workout };
