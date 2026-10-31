import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudOff, Heart, MessageSquare, Scroll, Search, Trash2, Users } from 'lucide-react';
import { useStore } from '@/state/store';
import { useProgress, useStreaks, useTotals } from '@/state/derived';
import { cloudConfigured, useCloud } from '@/services/cloud';
import type { Comment, Post, PublicProfile } from '@/services/social';
import { fmt, fmtDate, fmtDuration, fmtVolume, toDisplay, startOfWeek } from '@/domain/util';
import { inRange, totals } from '@/domain/analytics';
import { Button, Empty, Field, Loading, PageHead, Segmented, confirmAction } from '@/ui/kit';
import { decodeShare } from '@/services/transfer';
import { ACCENTS } from '@/domain/progression';

const api = () => import('@/services/social');
type Tab = 'feed' | 'discover' | 'people' | 'leaderboard' | 'me';

export default function CommunityPage() {
  const user = useCloud((s) => s.user);
  const [tab, setTab] = useState<Tab>('feed');
  return (
    <div className="page">
      <PageHead kicker="The guild" title="Community" />
      {!cloudConfigured ? <Offline /> : !user ? (
        <Empty title="Sign in to join" art={<Users size={28} />} action={<Link to="/app/profile" className="btn btn-primary">Sign in</Link>}>Your training stays private by default. You only appear here if you choose to, and only what you publish is shared.</Empty>
      ) : (
        <>
          <div className="mb-5"><Segmented label="Community section" value={tab} onChange={setTab} options={[{ value: 'feed', label: 'Following' }, { value: 'discover', label: 'Discover' }, { value: 'people', label: 'People' }, { value: 'leaderboard', label: 'Leaderboard' }, { value: 'me', label: 'My profile' }]} /></div>
          {tab === 'feed' || tab === 'discover' ? <Feed scope={tab === 'feed' ? 'following' : 'discover'} /> : tab === 'people' ? <People /> : tab === 'leaderboard' ? <Leaderboard /> : <MyProfile />}
        </>
      )}
    </div>
  );
}

/** Honest local-mode screen. No sample people, posts or numbers are ever shown. */
function Offline() {
  return (
    <div className="max-w-2xl">
      <div className="ticks border border-line p-5">
        <CloudOff size={24} className="text-muted" />
        <h2 className="display mt-2 text-3xl">Community isn't connected on this site</h2>
        <p className="mt-2 text-sm">Profiles, following, feeds, comments and leaderboards need real accounts, which needs the optional free backend. Rather than show made-up people, this page stays empty until then. Everything else in Iron Quest works without it.</p>
        <p className="mt-3 text-sm">Sharing that works right now, with no account:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          <li><Link to="/app/routines" className="underline">Share a routine</Link> with a code anyone can import.</li>
          <li><Link to="/app/history" className="underline">Copy a workout summary</Link> from any session in your history.</li>
        </ul>
      </div>
    </div>
  );
}

function Failure({ error, retry }: { error: string; retry: () => void }) {
  return <Empty title="Couldn't reach the guild" action={<Button onClick={retry}>Try again</Button>}>{error} Your own training data isn't affected.</Empty>;
}
const Who = ({ p }: { p?: PublicProfile | null }) => (
  <span className="min-w-0"><span className="block truncate font-semibold text-bone">{p?.display_name ?? 'Adventurer'}</span>{p && <span className="block truncate text-xs text-muted">{p.handle ? `@${p.handle} · ` : ''}Level {p.level}{p.title ? ` ${p.title}` : ''}</span>}</span>
);

function Feed({ scope }: { scope: 'following' | 'discover' }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null); setPosts(null);
    try { setPosts(await (await api()).feed(scope)); } catch (e) { setError(e instanceof Error ? e.message : 'Network error.'); }
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <Failure error={error} retry={() => void load()} />;
  if (!posts) return <Loading label="Reading the feed" />;
  if (!posts.length) return <Empty title={scope === 'following' ? 'Nothing here yet' : 'No public posts yet'} art={<Users size={28} />}>{scope === 'following' ? 'Follow people, or share a session from your history, and it will appear here.' : 'When someone publishes publicly, you’ll see it here.'}</Empty>;
  return <ul className="m-0 max-w-2xl list-none space-y-3 p-0">{posts.map((p) => <PostCard key={p.id} post={p} onRemoved={() => setPosts((list) => list?.filter((x) => x.id !== p.id) ?? null)} />)}</ul>;
}

function PostCard({ post, onRemoved }: { post: Post; onRemoved: () => void }) {
  const unit = useStore((s) => s.settings.unit);
  const save = useStore((s) => s.save);
  const toast = useStore((s) => s.toast);
  const me = useCloud((s) => s.user?.id);
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [count, setCount] = useState(post.comments);
  const [body, setBody] = useState('');
  const toggle = async () => {
    const next = !liked; setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    try { await (await api()).setLike(post.id, next); } catch { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); toast({ kind: 'error', text: 'Could not update like' }); }
  };
  const openComments = async () => { setOpen((o) => !o); if (!comments) { try { setComments(await (await api()).listComments(post.id)); } catch { setComments([]); toast({ kind: 'error', text: 'Could not load comments' }); } } };
  const send = async () => {
    const text = body.trim(); if (!text) return;
    try { const s = await api(); await s.addComment(post.id, text); setBody(''); setCount((n) => n + 1); setComments(await s.listComments(post.id)); } catch { toast({ kind: 'error', text: 'Could not post comment' }); }
  };
  const importRoutine = async () => {
    try { const { routine, exercises } = await decodeShare(post.summary.code); for (const e of exercises) await save('exercises', { ...e, custom: true }); await save('routines', routine); toast({ kind: 'success', text: `Added ${routine.name} to your routines` }); }
    catch { toast({ kind: 'error', text: 'That routine could not be imported' }); }
  };
  const remove = async () => { if (await confirmAction({ title: 'Delete this post?', confirm: 'Delete', danger: true })) { try { await (await api()).deletePost(post.id); onRemoved(); } catch { toast({ kind: 'error', text: 'Could not delete' }); } } };
  const s = post.summary;
  return (
    <li className="border border-line p-3" data-testid="post">
      <div className="flex items-center justify-between gap-2"><Who p={post.author} /><span className="hud shrink-0">{fmtDate(new Date(post.created_at), { month: 'short', day: 'numeric' })}</span></div>
      <h3 className="display mt-2 text-2xl">{post.title}</h3>
      {post.caption && <p className="whitespace-pre-wrap break-words text-sm">{post.caption}</p>}
      {post.kind === 'workout' ? (
        <>
          <p className="num mt-1 text-xs text-muted">{s.sets} sets · {fmtVolume(s.volumeKg, unit)}{s.durationSec ? ` · ${fmtDuration(s.durationSec)}` : ''}{s.prs ? ` · ${s.prs} PR${s.prs === 1 ? '' : 's'}` : ''}</p>
          <ul className="m-0 mt-2 list-none p-0 text-xs">{s.exercises.slice(0, 8).map((e, i) => <li key={i} className="flex justify-between gap-2 py-0.5"><span className="truncate">{e.name}</span><span className="num shrink-0 text-muted">{e.sets} × {e.topKg ? `${fmt(toDisplay(e.topKg, unit), 1)} ${unit}` : `${e.topReps} reps`}</span></li>)}</ul>
        </>
      ) : (
        <div className="mt-1"><p className="text-xs text-muted">{s.exercises.map((e) => e.name).join(', ')}</p>{post.user_id !== me && <Button size="sm" className="mt-2" onClick={() => void importRoutine()}><Scroll size={13} /> Add to my routines</Button>}</div>
      )}
      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-pressed={liked} aria-label={`${liked ? 'Unlike' : 'Like'}, ${likes} likes`} onClick={() => void toggle()}><Heart size={14} fill={liked ? 'currentColor' : 'none'} className={liked ? 'text-[var(--accent)]' : ''} /> {likes}</Button>
        <Button size="sm" variant="ghost" aria-expanded={open} aria-label={`${count} comments`} onClick={() => void openComments()}><MessageSquare size={14} /> {count}</Button>
        {post.user_id === me && <Button size="sm" variant="ghost" className="ml-auto" aria-label="Delete post" onClick={() => void remove()}><Trash2 size={14} /></Button>}
      </div>
      {open && (
        <div className="mt-2 border-t border-line pt-2">
          <ul className="m-0 list-none space-y-2 p-0">{comments?.map((c) => <li key={c.id} className="text-sm"><b className="text-bone">{c.author?.display_name ?? 'Adventurer'}</b> <span className="break-words">{c.body}</span></li>)}</ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}><input className="input" maxLength={500} aria-label="Write a comment" placeholder="Write a comment" value={body} onChange={(e) => setBody(e.target.value)} /><Button type="submit" disabled={!body.trim()}>Send</Button></form>
        </div>
      )}
    </li>
  );
}

function People() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [following, setFollowing] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [compare, setCompare] = useState<PublicProfile | null>(null);
  const toast = useStore((s) => s.toast);
  useEffect(() => { void api().then((s) => s.following()).then(setFollowing).catch(() => undefined); }, []);
  const search = async () => { setErr(null); try { setResults(await (await api()).searchProfiles(q)); } catch (e) { setErr(e instanceof Error ? e.message : 'Search failed.'); } };
  const toggle = async (id: string) => {
    const on = following.includes(id);
    try { const s = await api(); if (on) await s.unfollow(id); else await s.follow(id); setFollowing((f) => (on ? f.filter((x) => x !== id) : [...f, id])); } catch { toast({ kind: 'error', text: 'That didn\'t work', detail: 'They may have made their profile private.' }); }
  };
  return (
    <div className="max-w-2xl">
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <div className="relative flex-1"><Search size={15} aria-hidden className="absolute left-3 top-3.5 text-muted" /><input type="search" className="input pl-9" aria-label="Search people" placeholder="Name or handle" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button type="submit" disabled={q.trim().length < 2}>Search</Button>
      </form>
      {err && <p role="alert" className="text-sm text-crimson">{err}</p>}
      {results && !results.length && <p className="py-6 text-center text-sm text-muted">No public profiles match.</p>}
      <ul className="m-0 list-none p-0">{results?.map((p) => (
        <li key={p.user_id} className="flex flex-wrap items-center gap-2 border-b border-line py-2"><div className="min-w-0 flex-1"><Who p={p} />{p.motto && <p className="truncate text-xs text-muted">{p.motto}</p>}</div>
          <Button size="sm" onClick={() => setCompare(p)}>Compare</Button>
          <Button size="sm" variant={following.includes(p.user_id) ? 'default' : 'primary'} onClick={() => void toggle(p.user_id)}>{following.includes(p.user_id) ? 'Following' : 'Follow'}</Button></li>
      ))}</ul>
      {compare && <Comparison p={compare} />}
    </div>
  );
}

function Comparison({ p }: { p: PublicProfile }) {
  const me = useProgress(); const t = useTotals(); const st = useStreaks();
  const workouts = useStore((s) => s.workouts);
  const week = totals(inRange(workouts, startOfWeek(Date.now()).getTime())).sets;
  const rows: [string, number, number][] = [['Level', me.level.level, p.level], ['Workouts', t.workouts, p.workouts_total], ['Week streak', st.currentWeeks, p.weeks_streak], ['Sets this week', week, p.week_sets]];
  return (
    <section className="mt-5 border border-line p-3" aria-label={`Comparison with ${p.display_name}`}>
      <table className="w-full text-sm"><thead><tr className="hud text-left"><th className="py-1 font-medium">Stat</th><th className="py-1 text-right font-medium">You</th><th className="py-1 text-right font-medium">{p.display_name}</th></tr></thead>
        <tbody>{rows.map(([l, a, b]) => <tr key={l} className="border-t border-line/60"><td className="py-1.5">{l}</td><td className="num py-1.5 text-right text-bone">{a}</td><td className="num py-1.5 text-right text-bone">{b}</td></tr>)}</tbody></table>
      <p className="mt-2 text-xs text-muted">Only stats they've made public. Everyone's journey is different.</p>
    </section>
  );
}

function Leaderboard() {
  const [metric, setMetric] = useState<'week_sets' | 'weeks_streak' | 'workouts_total'>('week_sets');
  const [rows, setRows] = useState<PublicProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setRows(null); setError(null); try { setRows(await (await api()).leaderboard(metric)); } catch (e) { setError(e instanceof Error ? e.message : 'Network error.'); } }, [metric]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="max-w-2xl">
      <div className="mb-3"><Segmented label="Leaderboard metric" value={metric} onChange={setMetric} options={[{ value: 'week_sets', label: 'Sets this week' }, { value: 'weeks_streak', label: 'Week streak' }, { value: 'workouts_total', label: 'Workouts' }]} /></div>
      <p className="mb-3 text-xs text-muted">Opt-in only, from My profile. Ranks consistency rather than load, so it doesn't reward any particular body.</p>
      {error ? <Failure error={error} retry={() => void load()} /> : !rows ? <Loading /> : !rows.length ? <Empty title="No one has opted in yet">Be the first: turn it on in My profile.</Empty> : (
        <ol className="m-0 list-none p-0">{rows.map((p, i) => <li key={p.user_id} className="flex items-center gap-3 border-b border-line py-2"><span className="display w-8 text-2xl text-muted">{i + 1}</span><div className="min-w-0 flex-1"><Who p={p} /></div><span className="num text-bone">{p[metric]}</span></li>)}</ol>
      )}
    </div>
  );
}

function MyProfile() {
  const profile = useStore((s) => s.profile);
  const toast = useStore((s) => s.toast);
  const workouts = useStore((s) => s.workouts);
  const p = useProgress(); const t = useTotals(); const st = useStreaks();
  const [mine, setMine] = useState<PublicProfile | null>(null);
  const [form, setForm] = useState({ handle: '', display_name: profile.name || 'Adventurer', motto: profile.motto ?? '', is_public: false, on_leaderboard: false });
  const [loaded, setLoaded] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { const s = await api(); const m = await s.getMyProfile(); setMine(m); setFollowers(await s.followersCount()); if (m) setForm({ handle: m.handle ?? '', display_name: m.display_name, motto: m.motto ?? '', is_public: m.is_public, on_leaderboard: m.on_leaderboard }); } catch (e) { setErr(e instanceof Error ? e.message : 'Network error.'); } finally { setLoaded(true); } })(); }, []);
  const handleOk = /^[a-z0-9_]{3,24}$/.test(form.handle);
  const save = async () => {
    setErr(null);
    try {
      await (await api()).saveMyProfile({
        handle: form.handle, display_name: form.display_name.trim() || 'Adventurer', motto: form.motto.trim() || null, is_public: form.is_public, on_leaderboard: form.is_public && form.on_leaderboard,
        // Published stats are summaries you can see right here; set-level data is never included.
        level: p.level.level, title: p.title, armor_tier: p.armorTier, accent: ACCENTS.find((a) => a.id === profile.equipped.accent)?.id ?? 'ember',
        workouts_total: t.workouts, weeks_streak: st.currentWeeks, week_sets: totals(inRange(workouts, startOfWeek(Date.now()).getTime())).sets,
      });
      toast({ kind: 'success', text: 'Profile saved' }); setMine({ ...(mine as PublicProfile), ...form });
    } catch (e) { setErr(e instanceof Error && /duplicate|unique/i.test(e.message) ? 'That handle is taken.' : e instanceof Error ? e.message : 'Could not save.'); }
  };
  if (!loaded) return <Loading />;
  return (
    <form className="max-w-md space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <p className="text-sm">{followers} follower{followers === 1 ? '' : 's'}. Saving publishes only the summary shown below; your sets, body data and photos stay private.</p>
      <Field label="Handle" error={form.handle && !handleOk ? '3 to 24 lowercase letters, numbers or underscores.' : null}><input className="input" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })} /></Field>
      <Field label="Display name"><input className="input" maxLength={40} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></Field>
      <Field label="Motto"><input className="input" maxLength={140} value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} /></Field>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" style={{ accentColor: 'var(--accent)' }} checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked, on_leaderboard: e.target.checked && form.on_leaderboard })} /> Public profile (off by default)</label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" style={{ accentColor: 'var(--accent)' }} disabled={!form.is_public} checked={form.on_leaderboard} onChange={(e) => setForm({ ...form, on_leaderboard: e.target.checked })} /> Show me on leaderboards</label>
      <div className="border border-line p-2 text-xs"><span className="hud">Published summary</span><p className="num mt-1">Level {p.level.level} {p.title} · {t.workouts} workouts · {st.currentWeeks}-week streak</p></div>
      {err && <p role="alert" className="text-sm text-crimson">{err}</p>}
      <Button type="submit" variant="primary" disabled={!handleOk}>Save and update stats</Button>
    </form>
  );
}
