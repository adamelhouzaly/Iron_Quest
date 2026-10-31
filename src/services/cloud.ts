import { create } from 'zustand';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { setPushHook, useStore } from '@/state/store';
import * as db from './db';
import { syncOnce, type Remote, type RemoteRow } from './sync';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** Without build-time configuration the app simply is local-only: no network, no errors. */
export const cloudConfigured = !!(URL_ && KEY);

let clientP: Promise<SupabaseClient> | null = null;
export function supabase(): Promise<SupabaseClient> {
  if (!cloudConfigured) throw new Error('Cloud is not configured.');
  clientP ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } }));
  return clientP;
}

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error' | 'needs-owner-confirm';
interface CloudState { user: User | null; status: SyncStatus; lastSync: number | null; error: string | null }
export const useCloud = create<CloudState>(() => ({ user: null, status: cloudConfigured ? 'signed-out' : 'off', lastSync: null, error: null }));

const remoteFor = (client: SupabaseClient, userId: string): Remote => ({
  async pull(after, limit) {
    const { data, error } = await client.from('user_records').select('collection,id,data,deleted,client_updated_at,server_seq').gt('server_seq', after).order('server_seq').limit(limit);
    if (error) throw error;
    return (data ?? []) as RemoteRow[];
  },
  async push(rows) {
    const { error } = await client.from('user_records').upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,collection,id' });
    if (error) throw error;
  },
});

let running = false, again = false;
export async function syncNow() {
  const user = useCloud.getState().user;
  if (!cloudConfigured || !user || useCloud.getState().status === 'needs-owner-confirm') return;
  if (running) { again = true; return; }
  if (!navigator.onLine) { useCloud.setState({ status: 'offline' }); return; }
  running = true;
  useCloud.setState({ status: 'syncing', error: null });
  try {
    const client = await supabase();
    const res = await syncOnce(remoteFor(client, user.id), user.id);
    await db.setMeta('syncOwner', user.id);
    if (res.pulled) await useStore.getState().reload();
    useCloud.setState({ status: 'synced', lastSync: Date.now() });
  } catch (e) {
    console.warn('sync failed', e);
    useCloud.setState({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : 'Sync failed.' });
  } finally {
    running = false;
    if (again) { again = false; void syncNow(); }
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
const schedulePush = () => { clearTimeout(pushTimer); pushTimer = setTimeout(() => void syncNow(), 2500); };

/** Called when a session appears. Guards against silently merging one person's data into another's account. */
async function onUser(user: User | null) {
  useCloud.setState({ user, status: user ? 'syncing' : 'signed-out' });
  setPushHook(user ? schedulePush : null);
  if (!user) return;
  const owner = await db.getMeta<string>('syncOwner');
  const local = await db.allRaw();
  if (owner && owner !== user.id && local.length) { useCloud.setState({ status: 'needs-owner-confirm' }); return; }
  await syncNow();
}

export async function confirmDeviceMerge() {
  const user = useCloud.getState().user;
  if (!user) return;
  await db.setMeta('syncOwner', user.id);
  useCloud.setState({ status: 'syncing' });
  await syncNow();
}

export async function initCloud() {
  if (!cloudConfigured) return;
  try {
    const client = await supabase();
    const { data } = await client.auth.getSession();
    await onUser(data.session?.user ?? null);
    client.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void onUser(session?.user ?? null); });
    addEventListener('online', () => void syncNow());
    addEventListener('offline', () => useCloud.setState({ status: 'offline' }));
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  } catch (e) {
    // Backend unreachable: the app carries on locally.
    console.warn('cloud init failed', e);
    useCloud.setState({ status: 'offline' });
  }
}

export async function signUp(email: string, password: string) {
  const { data, error } = await (await supabase()).auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirm: !data.session };
}
export async function signIn(email: string, password: string) { const { error } = await (await supabase()).auth.signInWithPassword({ email, password }); if (error) throw error; }
export async function signOut() { const { error } = await (await supabase()).auth.signOut(); if (error) throw error; }
export async function resetPassword(email: string) { const { error } = await (await supabase()).auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; }
