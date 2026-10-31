# Iron Quest

**A cinematic fitness RPG and complete workout tracker.** Every rep writes your story.

Live: https://adamelhouzaly.github.io/Iron_Quest/

Free for everyone: no subscription, no limits, no paid unlocks, and no account required. It works offline, installs as an app, and your data stays on your device unless you choose to sync it.

## What's inside

- **Workout logging:** blank or routine-based sessions; weight, reps, time, distance and RPE; warm-up, drop and failure sets; supersets and circuits; previous values on every row; rest timers; live PR alerts; drafts that survive a closed tab.
- **Exercise library:** 111 curated exercises with instructions, form cues and original muscle maps, plus unlimited custom exercises.
- **Routines:** unlimited routines, folders and programs; six starter programs; training-day scheduling; share codes that need no backend.
- **Analytics:** volume, frequency, duration, estimated 1RM, per-muscle hard sets, consistency, records, and monthly and yearly reports, all calculated from your log. Body weight, measurements, body fat and on-device progress photos.
- **Tools:** plate, warm-up, 1RM and volume calculators; unit conversion; rule-based, always-explained progressive overload suggestions.
- **RPG:** levels, attributes, titles, 32 achievements, daily/weekly/long quests, skill paths, armor that visibly evolves, and a 3D Character Chamber.
- **Optional cloud:** accounts, sync across devices, profiles, following, feeds, likes, comments, leaderboards and shared routines, via a free Supabase project.

## How progress works

Nothing about your character is stored. XP, levels, records, quests and achievements are a pure replay of your saved workouts (`src/domain/progression.ts`), so editing or deleting a session always recalculates everything, and there's no separate number to fall out of sync.

XP rewards plausible training rather than clicks. Sets are credited at up to 1.5 per minute of session time and 40 per session, repeat sessions in a day pay less, load earns nothing extra, and implausible PR jumps earn no XP. Nothing ever subtracts: rest days and time off cost nothing. The full rules are in the app under Quests → How XP works.

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173/Iron_Quest/
npm test           # unit tests, including RLS against an embedded Postgres
npm run build
npx playwright install chromium
npm run test:e2e   # browser tests against the production build (run build first)
```

Requires Node 24+.

## Architecture

| Path | Purpose |
| --- | --- |
| `src/domain/` | Pure logic with no UI: workouts, records, analytics, XP, overload rules, migration, CSV, schemas |
| `src/data/` | Exercise library and program templates. Add an exercise with one `x(...)` row |
| `src/services/` | IndexedDB, sync engine, Supabase, social, import/export, notifications |
| `src/state/` | Zustand store and derived selectors |
| `src/three/` | Original procedural warrior and scenes (lazy-loaded, adaptive quality) |
| `src/ui/`, `src/features/` | Design system, and one folder per screen |
| `public/sw.js` | Service worker for offline use |
| `supabase/migrations/` | Database schema and Row Level Security |

**Choices worth knowing:**

- **Hash URLs** (`#/app/...`) keep deep links working on GitHub Pages, which has no server-side rewrites.
- **Plain Three.js** rather than React Three Fiber: one imperative scene with no React re-renders, and adaptive quality that drops bloom, then resolution, then falls back to drawn art.
- **Durable-first saves:** the store writes to IndexedDB before updating the screen, so "saved" means saved. The active workout is also mirrored to localStorage synchronously on every change.
- **All art is original** and generated in code. No third-party images, models or exercise media are used.

### Data safety

- The original app's `ironQuestDataV1` key is **read but never modified**. Migration is idempotent and only marks itself done after its transaction commits.
- v1 stored totals, not sets, so those sessions import as summaries. Their volume, sets, XP and PRs all still count.
- Deletions leave tombstones so a sync can't bring them back. Imports merge by most-recent edit, so an old backup can't overwrite newer work.

## Deploy to GitHub Pages

**Do this before merging:** in **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.

If Pages is still set to deploy from the `main` branch when this merges, it will serve the unbuilt source and the site will show a blank page. Changing the source first is safe, since the current site stays up until the first new deployment.

After that, every push to `main` runs the tests and deploys (`.github/workflows/deploy.yml`).

## Optional: accounts, sync and community

Without this the app runs in local mode, fully functional, and the Community page says plainly that it isn't connected. It never shows sample people or posts.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run `supabase/migrations/0001_iron_quest.sql`.
3. Under **Authentication → URL Configuration**, set the Site URL to `https://adamelhouzaly.github.io/Iron_Quest/`.
4. Under **Project Settings → API**, copy the Project URL and the `anon` public key.
5. In GitHub, under **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then re-run the deploy.

For local development, copy `.env.example` to `.env.local` instead.

The anon key is designed to be public: Row Level Security restricts every table to its owner, and social data is private unless explicitly published. **Never put a `service_role` key in this project.** Progress photos are never uploaded.

### Other integrations

Strava and similar services require a registered application and a server to hold the client secret, so they can't be added safely to a static site. To add one, create a Supabase Edge Function for the OAuth exchange, then call it from a new module in `src/services/`. Nothing in the app depends on this.

## Limitations

- **Notifications:** with no push server, rest-timer alerts and reminders fire only while the app is open or running as an installed app.
- **Exercise count:** the library has 111 exercises. Lists use `content-visibility` and filtering is in memory, so it's built to handle 400+, but the extra content hasn't been written yet.

Iron Quest is a training log, not medical advice.
