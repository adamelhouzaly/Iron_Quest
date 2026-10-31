import type { Exercise, Routine, Workout } from '@/domain/types';
import { workoutDuration, workoutSets, workoutVolume } from '@/domain/analytics';
import { isWorking } from '@/domain/records';
import { supabase, useCloud } from './cloud';

export interface PublicProfile {
  user_id: string; handle: string | null; display_name: string; motto: string | null; is_public: boolean; on_leaderboard: boolean;
  level: number; title: string | null; armor_tier: number; accent: string | null; workouts_total: number; weeks_streak: number; week_sets: number;
}
export interface WorkoutSummary { durationSec: number; sets: number; volumeKg: number; prs: number; exercises: { name: string; sets: number; topKg: number; topReps: number }[] }
export interface RoutineShare { code: string; exercises: { name: string; sets: number }[] }
export interface Post { id: string; user_id: string; kind: 'workout' | 'routine'; title: string; caption: string | null; summary: WorkoutSummary & RoutineShare; visibility: 'followers' | 'public'; created_at: string; author?: PublicProfile | null; likes: number; liked: boolean; comments: number }
export interface Comment { id: string; post_id: string; user_id: string; body: string; created_at: string; author?: PublicProfile | null }

const me = () => { const u = useCloud.getState().user; if (!u) throw new Error('Sign in first.'); return u.id; };
const check = <T,>(r: { data: T; error: unknown }): T => { if (r.error) throw r.error; return r.data; };

export async function getMyProfile(): Promise<PublicProfile | null> {
  return check(await (await supabase()).from('profiles').select('*').eq('user_id', me()).maybeSingle()) as PublicProfile | null;
}
export async function saveMyProfile(p: Partial<PublicProfile>) {
  const client = await supabase();
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  check(await client.from('profiles').upsert({ user_id: me(), ...clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
}
export async function searchProfiles(q: string): Promise<PublicProfile[]> {
  const safe = q.replace(/[%_,()*]/g, '').trim();
  if (safe.length < 2) return [];
  return check(await (await supabase()).from('profiles').select('*').eq('is_public', true).or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`).limit(20)) as PublicProfile[];
}
export async function following(): Promise<string[]> {
  const rows = check(await (await supabase()).from('follows').select('followee_id').eq('follower_id', me())) as { followee_id: string }[];
  return rows.map((r) => r.followee_id);
}
export async function followersCount() {
  const { count, error } = await (await supabase()).from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', me());
  if (error) throw error;
  return count ?? 0;
}
export async function follow(id: string) { check(await (await supabase()).from('follows').insert({ follower_id: me(), followee_id: id })); }
export async function unfollow(id: string) { check(await (await supabase()).from('follows').delete().eq('follower_id', me()).eq('followee_id', id)); }

export const summarize = (w: Workout, prs: number, lookup: (id: string) => Exercise | undefined): WorkoutSummary => ({
  durationSec: workoutDuration(w), sets: workoutSets(w), volumeKg: workoutVolume(w), prs,
  exercises: w.exercises.map((e) => {
    const work = e.sets.filter((s) => s.done && isWorking(s));
    const top = [...work].sort((a, b) => (b.kg ?? 0) - (a.kg ?? 0))[0];
    return { name: lookup(e.exerciseId)?.name ?? 'Exercise', sets: work.length, topKg: top?.kg ?? 0, topReps: top?.reps ?? 0 };
  }),
});

export async function publishWorkout(w: Workout, prs: number, lookup: (id: string) => Exercise | undefined, caption: string, visibility: Post['visibility']) {
  check(await (await supabase()).from('posts').insert({ user_id: me(), kind: 'workout', title: w.name, caption: caption || null, summary: summarize(w, prs, lookup), visibility }));
}
export async function publishRoutine(r: Routine, code: string, lookup: (id: string) => Exercise | undefined, caption: string, visibility: Post['visibility']) {
  const summary: RoutineShare = { code, exercises: r.exercises.map((e) => ({ name: lookup(e.exerciseId)?.name ?? 'Exercise', sets: e.sets.length })) };
  check(await (await supabase()).from('posts').insert({ user_id: me(), kind: 'routine', title: r.name, caption: caption || null, summary, visibility }));
}
export async function deletePost(id: string) { check(await (await supabase()).from('posts').delete().eq('id', id)); }

async function authors(ids: string[]) {
  if (!ids.length) return new Map<string, PublicProfile>();
  const rows = check(await (await supabase()).from('profiles').select('*').in('user_id', [...new Set(ids)])) as PublicProfile[];
  return new Map(rows.map((p) => [p.user_id, p]));
}

/** Only ever shows rows RLS lets this user see. An empty feed stays empty — nothing here is simulated. */
export async function feed(scope: 'following' | 'discover', limit = 30): Promise<Post[]> {
  const client = await supabase();
  let q = client.from('posts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (scope === 'discover') q = q.eq('visibility', 'public');
  else q = q.in('user_id', [...(await following()), me()]);
  const posts = check(await q) as Omit<Post, 'likes' | 'liked' | 'comments' | 'author'>[];
  const ids = posts.map((p) => p.id);
  if (!ids.length) return [];
  const [people, likes, comments] = await Promise.all([
    authors(posts.map((p) => p.user_id)),
    client.from('likes').select('post_id,user_id').in('post_id', ids),
    client.from('comments').select('post_id').in('post_id', ids),
  ]);
  const likeRows = check(likes) as { post_id: string; user_id: string }[];
  const commentRows = check(comments) as { post_id: string }[];
  const uid = me();
  return posts.map((p) => ({ ...p, author: people.get(p.user_id) ?? null, likes: likeRows.filter((l) => l.post_id === p.id).length, liked: likeRows.some((l) => l.post_id === p.id && l.user_id === uid), comments: commentRows.filter((c) => c.post_id === p.id).length }));
}
export async function setLike(postId: string, liked: boolean) {
  const client = await supabase();
  if (liked) check(await client.from('likes').insert({ post_id: postId, user_id: me() }));
  else check(await client.from('likes').delete().eq('post_id', postId).eq('user_id', me()));
}
export async function listComments(postId: string): Promise<Comment[]> {
  const rows = check(await (await supabase()).from('comments').select('*').eq('post_id', postId).order('created_at')) as Comment[];
  const people = await authors(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, author: people.get(r.user_id) ?? null }));
}
export async function addComment(postId: string, body: string) { check(await (await supabase()).from('comments').insert({ post_id: postId, user_id: me(), body })); }
export async function deleteComment(id: string) { check(await (await supabase()).from('comments').delete().eq('id', id)); }

export async function leaderboard(metric: 'week_sets' | 'weeks_streak' | 'workouts_total'): Promise<PublicProfile[]> {
  return check(await (await supabase()).from('profiles').select('*').eq('on_leaderboard', true).eq('is_public', true).order(metric, { ascending: false }).limit(50)) as PublicProfile[];
}
