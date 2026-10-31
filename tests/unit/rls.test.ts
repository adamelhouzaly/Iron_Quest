import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

/** Runs the real migration on an embedded Postgres, with a stand-in for Supabase's auth schema. */
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
let db: PGlite;

async function as<T = any>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role authenticated; select set_config('test.uid', '${user}', false);`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec('reset role;'); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${A}'), ('${B}'), ('${C}');
  `);
  await db.exec(readFileSync('supabase/migrations/0001_iron_quest.sql', 'utf8'));
  await db.exec(`grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;`);
}, 60_000);

const put = (u: string, id: string, at: number, v = 1) =>
  as(u, `insert into public.user_records (user_id, collection, id, data, client_updated_at) values ($1,'workouts',$2,$3,$4)
         on conflict (user_id, collection, id) do update set data = excluded.data, client_updated_at = excluded.client_updated_at`, [u, id, JSON.stringify({ v }), at]);

describe('private sync data', () => {
  it('users can only read their own records', async () => {
    await put(A, 'w1', 100);
    expect(await as(A, 'select * from public.user_records')).toHaveLength(1);
    expect(await as(B, 'select * from public.user_records')).toHaveLength(0);
  });
  it('users cannot write records as someone else', async () => {
    await expect(put.call(null, B, 'x', 1).then(() => as(B, `insert into public.user_records (user_id, collection, id, client_updated_at) values ('${A}','workouts','evil',1)`))).rejects.toThrow(/row-level security/);
  });
  it('users cannot modify or delete another user\'s records', async () => {
    await as(B, `update public.user_records set data = '{"hacked":true}' where user_id = '${A}'`);
    await as(B, `delete from public.user_records where user_id = '${A}'`);
    const rows = await as<any>(A, `select data from public.user_records where id = 'w1'`);
    expect(rows[0].data).toEqual({ v: 1 });
  });
  it('a stale device cannot overwrite newer data; newer writes win and move the cursor', async () => {
    await put(A, 'lww', 200, 2);
    const seq0 = (await as<any>(A, `select server_seq from public.user_records where id='lww'`))[0].server_seq;
    await put(A, 'lww', 100, 1);
    expect((await as<any>(A, `select data from public.user_records where id='lww'`))[0].data).toEqual({ v: 2 });
    await put(A, 'lww', 300, 3);
    const after = (await as<any>(A, `select data, server_seq from public.user_records where id='lww'`))[0];
    expect(after.data).toEqual({ v: 3 });
    expect(Number(after.server_seq)).toBeGreaterThan(Number(seq0));
  });
});

describe('social privacy', () => {
  it('profiles are private until opted in', async () => {
    await as(A, `insert into public.profiles (user_id, handle, display_name) values ('${A}', 'alice', 'A')`);
    expect(await as(B, 'select * from public.profiles')).toHaveLength(0);
    await as(A, `update public.profiles set is_public = true`);
    expect(await as(B, 'select * from public.profiles')).toHaveLength(1);
  });
  it('cannot follow a private profile', async () => {
    await as(C, `insert into public.profiles (user_id, handle, display_name) values ('${C}', 'carol', 'C')`);
    await expect(as(B, `insert into public.follows values ('${B}', '${C}')`)).rejects.toThrow(/row-level security/);
  });
  it('followers-only posts are invisible until you follow; comments and likes follow post visibility', async () => {
    const [{ id }] = await as<any>(A, `insert into public.posts (user_id, kind, title, summary) values ('${A}', 'workout', 'Push', '{}') returning id`);
    expect(await as(B, 'select * from public.posts')).toHaveLength(0);
    await expect(as(B, `insert into public.likes values ('${id}', '${B}')`)).rejects.toThrow(/row-level security/);
    await expect(as(B, `insert into public.comments (post_id, user_id, body) values ('${id}', '${B}', 'hi')`)).rejects.toThrow(/row-level security/);
    await as(B, `insert into public.follows values ('${B}', '${A}')`);
    expect(await as(B, 'select * from public.posts')).toHaveLength(1);
    await as(B, `insert into public.likes values ('${id}', '${B}')`);
    await as(B, `insert into public.comments (post_id, user_id, body) values ('${id}', '${B}', 'nice')`);
    expect(await as(A, 'select * from public.comments')).toHaveLength(1);
    expect(await as(C, 'select * from public.posts')).toHaveLength(0);
    expect(await as(C, 'select * from public.comments')).toHaveLength(0);
  });
  it('cannot publish as someone else or delete their post', async () => {
    await expect(as(B, `insert into public.posts (user_id, kind, title, summary) values ('${A}', 'workout', 'Fake', '{}')`)).rejects.toThrow(/row-level security/);
    await as(B, 'delete from public.posts');
    expect(await as(A, 'select * from public.posts')).toHaveLength(1);
  });
});
