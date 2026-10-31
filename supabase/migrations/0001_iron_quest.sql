-- Iron Quest backend. Run once in a Supabase project (SQL editor or `supabase db push`).
-- Every table has Row Level Security; private is the default for everything a user creates.

-- ============ Private per-user sync: one row per local record ============
create table if not exists public.user_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  collection text not null check (collection in ('workouts','routines','folders','exercises','body','photos','goals','profile','settings','legacy')),
  id text not null check (length(id) <= 120),
  data jsonb,
  deleted boolean not null default false,
  client_updated_at bigint not null,
  server_seq bigint generated always as identity,
  primary key (user_id, collection, id)
);
create index if not exists user_records_pull on public.user_records (user_id, server_seq);

-- Last write wins, enforced on the server so a stale device can never clobber newer data.
create or replace function public.user_records_lww() returns trigger language plpgsql as $$
begin
  if new.client_updated_at < old.client_updated_at then return null; end if;
  new.server_seq := nextval(pg_get_serial_sequence('public.user_records', 'server_seq'));
  return new;
end $$;
drop trigger if exists user_records_lww on public.user_records;
create trigger user_records_lww before update on public.user_records for each row execute function public.user_records_lww();

alter table public.user_records enable row level security;
drop policy if exists "own records" on public.user_records;
create policy "own records" on public.user_records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Public profile (optional, off by default) ============
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'Adventurer' check (length(display_name) <= 40),
  motto text check (length(motto) <= 140),
  is_public boolean not null default false,
  on_leaderboard boolean not null default false,
  level int not null default 1 check (level between 1 and 1000),
  title text check (length(title) <= 40),
  armor_tier int not null default 0 check (armor_tier between 0 and 5),
  accent text check (length(accent) <= 20),
  workouts_total int not null default 0 check (workouts_total >= 0),
  weeks_streak int not null default 0 check (weeks_streak >= 0),
  week_sets int not null default 0 check (week_sets >= 0),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read public or own profile" on public.profiles;
create policy "read public or own profile" on public.profiles for select to authenticated using (is_public or user_id = auth.uid());
drop policy if exists "manage own profile" on public.profiles;
create policy "manage own profile" on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Following ============
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table public.follows enable row level security;
drop policy if exists "see own follow edges" on public.follows;
create policy "see own follow edges" on public.follows for select to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());
drop policy if exists "follow public profiles" on public.follows;
create policy "follow public profiles" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and exists (select 1 from public.profiles p where p.user_id = followee_id and p.is_public));
drop policy if exists "unfollow or remove follower" on public.follows;
create policy "unfollow or remove follower" on public.follows for delete to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());

-- ============ Things a user explicitly chooses to publish ============
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('workout','routine')),
  title text not null check (length(title) between 1 and 120),
  caption text check (length(caption) <= 1000),
  summary jsonb not null,
  visibility text not null default 'followers' check (visibility in ('followers','public')),
  created_at timestamptz not null default now()
);
create index if not exists posts_feed on public.posts (created_at desc);
create index if not exists posts_user on public.posts (user_id, created_at desc);
alter table public.posts enable row level security;

create or replace function public.can_see_post(p public.posts) returns boolean language sql stable as $$
  select p.user_id = auth.uid()
      or (p.visibility = 'public' and exists (select 1 from public.profiles x where x.user_id = p.user_id and x.is_public))
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.user_id);
$$;

drop policy if exists "read visible posts" on public.posts;
create policy "read visible posts" on public.posts for select to authenticated using (public.can_see_post(posts));
drop policy if exists "publish own posts" on public.posts;
create policy "publish own posts" on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own posts" on public.posts;
create policy "delete own posts" on public.posts for delete to authenticated using (user_id = auth.uid());

create table if not exists public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (post_id, user_id)
);
alter table public.likes enable row level security;
drop policy if exists "read likes on visible posts" on public.likes;
create policy "read likes on visible posts" on public.likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "like visible posts" on public.likes;
create policy "like visible posts" on public.likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "remove own like" on public.likes;
create policy "remove own like" on public.likes for delete to authenticated using (user_id = auth.uid());

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_post on public.comments (post_id, created_at);
alter table public.comments enable row level security;
drop policy if exists "read comments on visible posts" on public.comments;
create policy "read comments on visible posts" on public.comments for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "comment on visible posts" on public.comments;
create policy "comment on visible posts" on public.comments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "delete own comment or on own post" on public.comments;
create policy "delete own comment or on own post" on public.comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));
