import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '@/services/db';
import { syncOnce, type Remote, type RemoteRow } from '@/services/sync';
import { IDBFactory } from 'fake-indexeddb';

/** In-memory stand-in with the same last-write-wins rule as the server trigger. */
function fakeServer() {
  const rows = new Map<string, RemoteRow>();
  let seq = 0;
  const remote: Remote & { fail?: boolean } = {
    async pull(after, limit) { return [...rows.values()].filter((r) => r.server_seq > after).sort((a, b) => a.server_seq - b.server_seq).slice(0, limit); },
    async push(list) {
      if (remote.fail) throw new Error('network');
      for (const r of list) {
        const k = `${r.collection}/${r.id}`;
        const cur = rows.get(k);
        if (cur && r.client_updated_at < cur.client_updated_at) continue;
        rows.set(k, { ...r, server_seq: ++seq });
      }
    },
  };
  return { remote, rows };
}
const device = (fn: () => Promise<unknown>) => fn();
const wk = (id: string, at: number, name = 'A'): any => ({ id, name, startedAt: 0, completedAt: 1, exercises: [], updatedAt: at });

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); db._resetForTests(); });
/** Switch to a separate browser profile for "the other device". */
const newDevice = () => { const f = new IDBFactory(); return () => { globalThis.indexedDB = f; db._resetForTests(); }; };

describe('sync engine', () => {
  it('pushes guest data on first sync and pulls it on another device', async () => {
    const { remote, rows } = fakeServer();
    await db.putRecord('workouts', wk('w1', 100));
    expect(await syncOnce(remote, 'u')).toEqual({ pulled: 0, pushed: 1 });
    expect(rows.size).toBe(1);
    newDevice()();
    expect((await syncOnce(remote, 'u')).pulled).toBe(1);
    expect((await db.loadAll()).workouts[0].id).toBe('w1');
  });
  it('resolves conflicts per record: newest edit wins on both devices', async () => {
    const { remote } = fakeServer();
    const a = newDevice(), b = newDevice();
    a(); await db.putRecord('workouts', wk('w', 100, 'orig')); await syncOnce(remote, 'u');
    b(); await syncOnce(remote, 'u'); await db.putRecord('workouts', wk('w', 300, 'from-b')); await syncOnce(remote, 'u');
    a(); await db.putRecord('workouts', wk('w', 200, 'stale-a')); await syncOnce(remote, 'u');
    expect((await db.loadAll()).workouts[0].name).toBe('from-b');
    b(); await syncOnce(remote, 'u');
    expect((await db.loadAll()).workouts[0].name).toBe('from-b');
  });
  it('deletions propagate and do not resurrect', async () => {
    const { remote } = fakeServer();
    const a = newDevice(), b = newDevice();
    a(); await db.putRecord('workouts', wk('w', 100)); await syncOnce(remote, 'u');
    b(); await syncOnce(remote, 'u');
    a(); await db.deleteRecord('workouts', 'w', 200); await syncOnce(remote, 'u');
    b(); await syncOnce(remote, 'u');
    expect((await db.loadAll()).workouts).toHaveLength(0);
    await syncOnce(remote, 'u');
    expect((await db.loadAll()).workouts).toHaveLength(0);
  });
  it('a failed push loses nothing and retries next time', async () => {
    const { remote, rows } = fakeServer();
    await db.putRecord('workouts', wk('w', 100));
    remote.fail = true;
    await expect(syncOnce(remote, 'u')).rejects.toThrow();
    expect((await db.loadAll()).workouts).toHaveLength(1);
    remote.fail = false;
    expect((await syncOnce(remote, 'u')).pushed).toBe(1);
    expect(rows.size).toBe(1);
  });
  it('never uploads progress photos', async () => {
    const { remote, rows } = fakeServer();
    await db.putRecord('photos', { id: 'p', date: '2026-01-01', pose: 'front', updatedAt: 5 });
    await syncOnce(remote, 'u');
    expect(rows.size).toBe(0);
    void device;
  });
});

describe('local persistence', () => {
  it('survives a reconnect (simulated reload)', async () => {
    await db.putRecord('workouts', wk('w', 100));
    db._resetForTests();
    expect((await db.loadAll()).workouts).toHaveLength(1);
  });
  it('tombstones hide deleted records but keep them for sync', async () => {
    await db.putRecord('workouts', wk('w', 100));
    await db.deleteRecord('workouts', 'w', 200);
    expect((await db.loadAll()).workouts).toHaveLength(0);
    expect((await db.allRaw())[0].deleted).toBe(true);
  });
});
