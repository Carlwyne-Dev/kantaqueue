# Product Requirements Document: KanTara

**Status:** Draft v1
**Owner:** Build (AppBuildersPH)

---

## 0. Naming

**KanTara** — "kanta" (sing) + "tara" (the Filipino "let's go / come on"). Reads like the actual invite line people say to get a karaoke session going — *"Tara, kanta tayo!"* Playful, Filipino-flavored, and describes exactly what the app does without being generic.

---

## 1. Overview

KanTara is a web app that fixes the "passing the phone around" problem at YouTube karaoke sessions. One device (TV/laptop) is the Host Screen. Guests scan a QR code to join a room from their own phones — no app install — and search, queue, and track songs while the host device handles playback automatically.

Not a YouTube replacement. A queue and coordination layer on top of it.

---

## 2. Problem Statement

Group karaoke over YouTube breaks down because there's no shared, visible queue:

- One phone gets passed around, or everyone crowds around it to search.
- No one knows who's next — constant "sino sunod?" interruptions.
- Songs get skipped by accident or forgotten entirely.
- The vibe keeps stalling between songs instead of flowing.

---

## 3. Goals

- Let any guest add a song from their own phone in under 15 seconds.
- Make the queue visible and self-explanatory — no one has to ask "what's next."
- Keep the host device hands-off during a session except for skip/pause.
- Make repeat searches instant by caching song metadata locally.

### Non-Goals (v1)
- Not building a music player — playback stays on YouTube's IFrame API.
- Not hosting or downloading video/audio.
- Not building accounts/login (rooms are ephemeral, no auth for MVP).
- Not supporting song voting, playlists, or history — v2+.

---

## 4. User Personas

**Host** — sets up the room on the TV/laptop before the party starts, controls playback, isn't glued to a phone.

**Guest** — joins mid-party via QR, wants to add 1-3 songs, check their position, and get back to socializing.

---

## 5. Core User Flows

### 5.1 Host Flow
1. Open app → "Create Room"
2. Room created, QR code + room code displayed full-screen
3. Screen shows: Now Playing / Up Next / Full Queue
4. When queue is empty, host screen shows an idle state — room code and QR still visible, prompting guests to add the next song
5. Host can: Skip, Remove a queued song, Reorder, Pause queue
6. When a song ends, next song auto-plays

### 5.2 Guest Flow
1. Scan QR (or enter room code manually)
2. Automatically assigned a random fun nickname (e.g. "Sunny Mango") — checked for uniqueness within the room before assigning, so no two guests in the same room ever collide. Guest can optionally rename themselves, but it's not required to join.
3. Search song → results show cache hits instantly, YouTube API results if not cached
4. Tap "Add to Queue" → song appears in shared queue with their name attached
5. See their own queue position + estimated wait time
6. Can remove only their own pending requests

---

## 6. MVP Feature Scope

| Feature | Host | Guest | In MVP? |
|---|---|---|---|
| Create room + QR code | ✅ | | Yes |
| Join via QR/code | | ✅ | Yes |
| Search songs (cache-first) | | ✅ | Yes |
| Add to queue | | ✅ | Yes |
| View live queue | ✅ | ✅ | Yes |
| Remove own song | | ✅ | Yes |
| Skip / remove / reorder | ✅ | | Yes |
| Pause queue | ✅ | | Yes |
| Queue position + est. wait time | | ✅ | Yes |
| Song voting | | | v2 |
| Playlists / favorites | | | v2 |
| Session history | | | v2 |
| Password-protected rooms | | | v2 |
| Multiple simultaneous rooms per host | | | v2 |

**Cut candidates if timeline is tight:** Reorder queue, estimated wait time — both are nice-to-haves that add UI complexity without being core to the "fix the chaos" promise.

---

## 6a. Room Lifecycle

Rooms aren't manually deleted by anyone — they auto-expire after **6 hours of inactivity** (no queue changes, no new guests joining). A scheduled cleanup job (Supabase cron function or edge function) marks expired rooms as `status = 'ended'` and can hard-delete the row (and cascade-delete its `guests`/`queue_items`) after some retention window, e.g. 24 hours past expiry, in case anyone wants to see "what did we sing tonight" shortly after.

6 hours covers a full party without cutting anyone off mid-session; tune later if real usage shows otherwise.

---

## 6b. Unavailable Cached Video

A song cached from a past session could later get taken down, made private, or region-blocked on YouTube. Handling for both the "guest tries to queue it" and "it's already queued and fails at play-time" cases is now specced in Section 9a (Build-Ready Mechanics).

---

## 7. Data Model

Auth model: no email/password. Every client (host or guest) calls `supabase.auth.signInAnonymously()` on first load. This gives each browser tab a real `auth.uid()` with zero visible login UI — which is what makes the RLS rules below actually enforceable (without it, "guests can only remove their own song" would just be a UI suggestion, not a real rule).

```sql
-- ---------- ROOMS ----------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,              -- short human-readable join code, e.g. "KJ48X"
  host_id uuid not null,                  -- auth.uid() of whoever created the room
  status text not null default 'active'   -- active | paused | ended
    check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

-- Anyone (any anon user) can read a room if they know its code —
-- the room code itself is the "access key" for guests.
create policy "rooms are readable by anyone"
  on rooms for select
  using (true);

-- Only an authenticated (anon) user can create a room, and they
-- become the host_id automatically.
create policy "any anon user can create a room"
  on rooms for insert
  with check (auth.uid() = host_id);

-- Only the host who created the room can update it (pause/end).
create policy "only host can update their room"
  on rooms for update
  using (auth.uid() = host_id);


-- ---------- SONGS (global cache, shared across all rooms) ----------
create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  normalized_title text not null,         -- lowercase, trimmed, punctuation-stripped title, used for dedup checks
  artist text,
  youtube_video_id text unique not null,
  thumbnail_url text,
  duration_seconds int,
  times_played int not null default 0,
  last_played_at timestamptz,
  date_added timestamptz not null default now()
);

create index idx_songs_normalized_title on songs(normalized_title);

alter table songs enable row level security;

-- Cache is global and read-only useful data — anyone can read.
create policy "songs are readable by anyone"
  on songs for select
  using (true);

-- Anyone (any anon session) can add a new cached song — this is
-- what happens on a YouTube API cache-miss. No ownership needed
-- since songs aren't tied to a single guest.
create policy "any anon user can insert a cached song"
  on songs for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'anon');

-- times_played / last_played_at get bumped when a song starts
-- playing — allow updates from any authenticated session.
create policy "any anon user can update play stats"
  on songs for update
  using (true);


-- ---------- GUESTS (lightweight, session-scoped) ----------
-- Nickname assignment: on join, client picks a random name from a
-- preset pool (e.g. "Sunny Mango", "Loud Tito", "Karaoke Bebang").
-- Before inserting, check if that name is already taken in this
-- room_id; if so, re-roll or append " 2" and retry. Guest can
-- rename afterward via update (still enforced to their own auth_uid).
create table guests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  auth_uid uuid not null,                 -- ties this guest row to their anon session
  display_name text not null,
  joined_at timestamptz not null default now()
);

alter table guests enable row level security;

-- Anyone in the room can see who else has joined (for display,
-- e.g. showing "X joined" or a guest list).
create policy "guests are readable by anyone"
  on guests for select
  using (true);

-- A guest can only create their own guest record, tied to their
-- own auth session — can't impersonate someone else's uid.
create policy "guests can only insert their own record"
  on guests for insert
  with check (auth.uid() = auth_uid);


-- ---------- QUEUE ITEMS ----------
create table queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  song_id uuid not null references songs(id),
  requested_by uuid not null,             -- auth.uid() of the guest who added it
  singer_name text not null,
  status text not null default 'queued'
    check (status in ('queued', 'playing', 'played', 'skipped', 'removed')),
  requested_at timestamptz not null default now(),
  position int
);

alter table queue_items enable row level security;

-- Anyone in the room can read the queue — it's meant to be shared/visible.
create policy "queue items are readable by anyone"
  on queue_items for select
  using (true);

-- A guest can only insert a queue item under their own auth.uid(),
-- and only if they currently have fewer than 3 pending ('queued') items
-- in that same room — this is the spam-cap rule (see Section 9).
create policy "guests can add songs up to their pending cap"
  on queue_items for insert
  with check (
    auth.uid() = requested_by
    and (
      select count(*) from queue_items qi
      where qi.room_id = queue_items.room_id
        and qi.requested_by = auth.uid()
        and qi.status = 'queued'
    ) < 3
  );

-- A guest can update/remove ONLY their own queue items, and only
-- while those items are still pending (can't un-skip something
-- the host already dismissed, can't edit a song that already played).
create policy "guests can modify only their own pending items"
  on queue_items for update
  using (auth.uid() = requested_by and status = 'queued');

create policy "guests can delete only their own pending items"
  on queue_items for delete
  using (auth.uid() = requested_by and status = 'queued');

-- The host needs broader control: skip, remove, or reorder ANY
-- item in a room they own — not just their own. This policy checks
-- against the rooms table to confirm host ownership.
create policy "host can update any queue item in their room"
  on queue_items for update
  using (
    exists (
      select 1 from rooms
      where rooms.id = queue_items.room_id
        and rooms.host_id = auth.uid()
    )
  );

create policy "host can delete any queue item in their room"
  on queue_items for delete
  using (
    exists (
      select 1 from rooms
      where rooms.id = queue_items.room_id
        and rooms.host_id = auth.uid()
    )
  );


-- ---------- REALTIME ----------
-- Enable Realtime broadcasts on the tables that need live sync.
-- (Run in the Supabase dashboard under Database > Replication,
-- or via SQL if using a self-managed publication.)
alter publication supabase_realtime add table queue_items;
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table guests;


-- ---------- INDEXES ----------
-- Speeds up the two most frequent queries: "give me this room's
-- queue" and "does this guest have < 3 pending songs".
create index idx_queue_items_room_id on queue_items(room_id);
create index idx_queue_items_requested_by on queue_items(requested_by);
create index idx_songs_youtube_video_id on songs(youtube_video_id);
create index idx_rooms_code on rooms(code);
```

---

## 8. Search Architecture

Cache-first, as in the original spec:

1. Guest searches → query `songs` table first (fuzzy match on title/artist).
2. If hit → return instantly, no external call.
3. If miss → call YouTube Data API v3 → before inserting the result, check `normalized_title` (lowercased, trimmed, punctuation-stripped) against existing rows — if a close match exists, reuse that cached row instead of creating a near-duplicate (e.g. "My Way" vs "My Way Frank Sinatra" vs "my way "). Only insert a new row if no reasonable match is found.

**Quota reality check:** YouTube Data API free tier is 10,000 units/day; a `search.list` call costs 100 units — roughly 100 fresh searches/day. For family/small-group scale this is plenty, and no manual song list curation is needed — the cache-first architecture builds the library organically. The first time a song is searched, it costs one API call and gets stored in Supabase forever; every session after that (by anyone, in any room) hits cache instantly at zero API cost. A few sessions in, most of your fam's usual songs will already be cached.

One lightweight guardrail still worth building into MVP:
- Debounce search input (~500ms, min 3 characters) so partial keystrokes don't burn calls unnecessarily.
- If a search fails or quota's exhausted, fall back to cached results with a clear message rather than a blank error.

Requesting a quota increase or building fairness algorithms around search volume are only worth revisiting if this grows past a single household/friend-group into something with many concurrent rooms.

### Search Query & Result Ranking

Two separate problems, both need handling:

**1. Raw YouTube search returns non-karaoke junk.** Searching "My Way" as-is returns music videos, lyric videos, live performances — not karaoke tracks. YouTube's public Search API has no true "karaoke tag" filter — uploader tags aren't searchable, only titles/descriptions are. So this needs two layers:

- **Query-level:** append "karaoke" to the search term (e.g. `"My Way karaoke"`, not `"My Way"`).
- **Result-level post-filter:** YouTube's search is relevance-based, not exact-match, so a "karaoke" query can still return results that don't actually say karaoke anywhere. After getting results back, drop any video whose title/description doesn't contain at least one of: `karaoke`, `videoke`, `instrumental`, `minus one`. What's left is the closest achievable approximation of "karaoke only" without a real tag filter.

**2. Cached results should still win the top spot.** Even with karaoke-filtered API results, a song already in your `songs` table (proven, already sung before) should surface before a fresh API call happens at all:

1. **Cached matches, sorted by `times_played` descending** — the version you've actually sung before, first.
2. **Other cached matches** (searched before but never played, or played less).
3. **Fresh YouTube API results, karaoke-filtered** — only pulled in on a cache miss, and only ever karaoke-scoped queries.

Net effect: a song picked once becomes the permanent "default" result for that title, and any new API pull only ever returns karaoke versions instead of a mixed bag.

---

## 9. Realtime & Concurrency Notes

Supabase Realtime pushes queue changes to all connected clients (host + guests) on `queue_items` inserts/updates/deletes.

Edge cases to handle explicitly:
- **Simultaneous adds:** two guests add a song at the same moment — both succeed, ordered by `requested_at`, no conflict since queue is append-only by default.
- **Guest disconnects mid-session:** their queued (not-yet-played) songs stay in the queue. Guests aren't "present" in any stateful sense — just an author tag on a queue item.
- **Host skips while a guest is mid-add:** the add still lands in the queue behind whatever is now playing; no special handling needed since queue order is server-authoritative.
- **Host device disconnects or refreshes:** no session state to lose — room and queue live in the DB, not on the host device. Host just reopens the room URL and current queue/now-playing state loads fresh. No reclaim flow needed for MVP since there's no host auth to reclaim.
- **One guest hogging the queue:** cap items with status `queued` per guest at **3**. This is a rolling cap, not a lifetime limit — once one of their songs plays (status flips to `played`), that slot frees up and they can add another. Enforced as a simple count check on add — reject with a clear message ("You've got 3 songs queued already") rather than a fairness algorithm.

---

## 9a. Build-Ready Mechanics

A few things that need a concrete answer before coding, not just a concept:

**Room code generation.** 5-character codes from an uppercase alphanumeric set with ambiguous characters removed (no `0`/`O`, no `1`/`I`/`L`) — e.g. `KJ48X`. On insert, if the code already exists in an active room, regenerate and retry. With ~30 usable characters and 5 slots, collisions are rare enough that a single retry is enough.

**Queue reordering (`position` field).** Don't renumber the whole queue on every drag — that causes a burst of realtime updates. Use gap-based integers: new items get `position = last_position + 1000`. Dragging an item between two others sets its `position` to the midpoint of its new neighbors' values (e.g. between 1000 and 2000 → 1500). Only do a full renumber pass if the gaps get too tight (rare, and can run as a background cleanup).

**`times_played` / `last_played_at` updates.** Fired once, when a queue item's status flips from `queued`/`playing` to `played` — not on every playback tick. The host client (which owns playback state) is responsible for calling this update when a video's `onStateChange` reports `ENDED`.

**Unavailable video handling (resolves the open question in 6b).** The YouTube IFrame API's `onError` event returns specific codes — `100`/`101`/`150` mean the video is private/removed/embedding-disabled. Handle it the same way regardless of when it's discovered:
- If it fails **at add-time** (rare, would need a pre-check call): guest sees "This song isn't available right now, try another version" and it's never added.
- If it fails **at play-time** (the realistic case, since a video could go down between being cached and being played weeks later): the host's IFrame listener catches the `onError` code, auto-marks that queue item as `skipped`, shows a brief "Skipping — video unavailable" toast (same toast mechanism as Section 11b), and advances to the next song automatically rather than stalling the party.

**QR code payload.** Encodes a direct join URL, not just the raw code — e.g. `yourapp.com/join?code=KJ48X`. Scanning drops the guest straight into the join flow with the code pre-filled, skipping the homepage and manual code entry entirely. The room code stays visible as plain text too, for anyone who needs to type it in manually (see Section 11a, late joiners).

**Search debounce.** Purely client-side — a ~500ms timer that resets on each keystroke, with a 3-character minimum before firing. No backend/edge function involved; this only gates when the client calls the search function, so it needs zero extra infra.

---

## 10. Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend / DB / Realtime:** Supabase (Postgres + Supabase Realtime)
- **Video playback:** YouTube IFrame Player API
- **Song search:** YouTube Data API v3
- **QR generation:** QR code generator library

---

## 11. Design Direction

Clean, native-feeling, iOS-style — not a dark Spotify-clone, not a YouTube lookalike.

**Color:** light background (`#FFFFFF` primary, `#F7F7F8` for grouped sections), a single confident accent color used sparingly (buttons, active states, the "you're up next" highlight), dark text (`#1C1C1E`), muted gray for secondary text/timestamps (`#8E8E93`). No dark mode requirement for MVP — can be added later as a toggle, not a default.

**Type:** system font stack (`-apple-system`, `BlinkMacSystemFont`, SF Pro fallback) — no display/decorative fonts. iOS-clean means typography that gets out of the way; hierarchy comes from size and weight, not novelty fonts.

**Shape & elevation:** large corner radii (16-20px on cards), soft shadows instead of hard borders, generous padding — avoid dense/cramped layouts.

**Interaction patterns:** bottom sheets instead of custom modals, segmented controls for toggles (e.g. "Queue" vs "My Songs"), swipe-to-remove on a guest's own pending queue items, native-feeling pull-to-refresh on the live queue list.

**Mobile-first, TV-capable:** guest views are phone-only by design. Host views need to work on both a TV/laptop (Section 5.1) and a phone with no TV (Section 11a) — see Section 11c below for how each screen adapts.

---

## 11a. Host on Mobile (No TV)

Host device can be a phone acting as both screen and speaker — no casting, no TV. This introduces constraints the TV-host flow doesn't have:

**Autoplay restriction:** mobile browsers (Chrome/Safari) block auto-playing video with sound until the user directly interacts with the page. The "song ends → next auto-plays" flow works on desktop but will silently fail to produce audio on mobile. Fix: a one-time "Start Party" tap when the room is created unlocks playback for the rest of that browser session.

**Screen lock kills playback:** if the phone screen times out mid-song, playback can pause and the Realtime connection may drop. Fix: use the Screen Wake Lock API to keep the host screen awake for the duration of an active session.

**QR chicken-and-egg problem:** the host can't display a QR code to guests while also using that same screen as the player. Fix: a distinct "Room Setup" screen shown before the party starts, where the QR + short text room code are both visible. Guests scan once at setup; the room code (not just QR) stays accessible for late joiners to type in manually, since a live QR isn't always on screen once playback starts.

**Layout:** TV layout (Now Playing / Up Next / Full Queue side-by-side) doesn't fit a phone screen. Mobile host view collapses into a stacked layout — large player on top, collapsible/scrollable queue below, with Skip/Pause controls always visible.

**Battery:** screen-on + video + Wake Lock over a multi-hour session drains battery fast. Not a technical fix — just a "keep it plugged in" hint surfaced in the UI when the session starts.

---

## 11b. Host Screen Layout States

**Orientation prompt:** on session start, if the host device is in portrait, show a one-time prompt — "Rotate your screen for the best view." Video content and the split layout both work better in landscape.

**Default view (split layout):**
- Video/player as the primary element
- Queue list docked on the side, always visible
- QR code + room code visible in the layout, not overlapping the video

**Fullscreen view (video-only):**
- Video expands to fill the entire screen; the side queue panel is hidden
- QR code collapses into a small semi-transparent overlay pinned to the bottom of the screen, so guests can still scan without the host leaving fullscreen
- Queue activity (new song added, who's up next) is no longer visible as a static panel, so it surfaces instead as a **toast notification** in the upper-right corner — brief, auto-dismissing, non-blocking. This keeps the host aware of queue changes without breaking the fullscreen video experience.

---

## 11c. Screen Inventory

### Guest Flow

**1. Join**
- Large friendly headline, minimal copy
- Room code auto-filled if arriving via QR link (Section 9a); manual entry field shown if not
- Auto-assigned nickname shown before joining (e.g. "You'll be Sunny Mango") with an inline edit option — not a required field (Section 5.2)
- Single primary "Join Room" button

**2. Search**
- Search bar pinned to the top, iOS-style rounded gray fill, placeholder like "Search a song..."
- Results as cards: thumbnail, title, artist, single "Add" button per card
- Cached/most-played results surface above fresh API results (Section 8)
- Empty state (no results): plain-language message, not a dead end — e.g. "No matches yet — try a different title"

**3. My Queue**
- Segmented control at the top: **Queue** (everyone's songs) / **My Songs** (just theirs)
- Each queue row shows: singer nickname, song title, position number
- Guest's own pending rows are swipeable to remove (Section 7 RLS enforces this server-side too)
- Estimated wait time shown on the guest's own upcoming song(s)

### Host Flow

**1. Room Setup**
- QR code centered, large and scannable
- Room code shown as large plain text underneath (for guests typing it manually)
- Single "Start Party" button — this is also what unlocks audio playback on mobile hosts (Section 11a)

**2. Split View (default, once party has started)**
- Video player takes primary space (left or top depending on orientation)
- Queue list docked on the side, always visible, showing Now Playing + Up Next + full list
- QR code and room code tucked into a small corner card — visible but not competing with the video

**3. Fullscreen View**
- Video expands to fill the entire screen, queue panel hidden
- QR code collapses into a small semi-transparent pill pinned to the bottom of the screen
- New queue activity surfaces as a toast in the upper-right corner — brief, auto-dismissing, non-blocking (Section 11b)

**4. Idle State**
- Shown whenever the queue is empty — room code/QR stay visible, with a prompt like "Waiting for the next song" instead of a blank/broken-looking screen (Section 6, MVP feature scope)

---

## 11d. Landing Page Stats Counter

A live counter on the landing page showing cumulative totals (e.g. "17 rooms created, 31 songs queued") — social proof, especially useful once Public Rooms (Section 14b) starts bringing in people who've never used the app before.

**Important: don't count live rows.** `count(*)` against `rooms` or `queue_items` directly will work today, but breaks once rooms start hitting the 6-hour auto-expiry and cascade-delete (Section 6a) — the counter would shrink as old rooms get cleaned up, defeating the "always grows" intent.

**Fix:** a separate, permanent `stats` table (single row, or one row per stat) — e.g. `total_rooms_created`, `total_songs_queued` — incremented once on insert (via a DB trigger or an explicit increment call), fully decoupled from whether the original `rooms`/`queue_items` row still exists. This guarantees the number only ever goes up, regardless of cleanup.

**Status: implemented** — already built as a separate table, decoupled from room/queue deletion.

---

## 12. Success Metrics (post-launch)

- % of searches served from cache vs YouTube API (target: growing over time)
- Median time from "join room" to "first song added"
- Songs added per session
- Sessions with zero host manual intervention (skip/remove) — proxy for "it just worked"

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| YouTube API quota exhaustion during a live party | Organic cache growth from real usage (no manual pre-seeding, per Section 8/9a), debounced search, quota monitoring |
| No auth means anyone with the room code can spam the queue | v1 accepts this risk (parties are trusted groups); 3-song pending cap already enforced via RLS (Section 7) |
| YouTube IFrame API embedding restrictions on some videos | Show a clear "unavailable" state and let host skip (Section 9a) |
| Supabase free tier auto-pauses projects after 7 days of no API requests | Not a storage concern — the `songs` cache is lightweight metadata and won't approach the 500 MB free-tier limit for a very long time. The real risk is the app going fully offline after a quiet week with zero warning. Mitigate with a lightweight scheduled ping (e.g. a daily cron hitting the Supabase URL) if usage could realistically go quiet. |
| Supabase free tier has no automatic backups | **Resolved.** A GitHub Actions workflow runs daily, dumping the full database via `pg_dump` and storing it as a downloadable artifact (30-day retention). No paid service needed — same free-infra spirit as the rest of the project. Restore process documented and should be test-run once before it's ever actually needed in a real emergency. |

---

## 14a. Project Scaffold

### Setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + YouTube keys
```

Run the SQL block from Section 7 against your Supabase project via the SQL editor.

Then enable **Anonymous sign-ins** in Supabase Dashboard → Authentication → Providers. This is off by default and easy to miss — without it, `signInAnonymously()` silently fails and nothing else in the app works, since every RLS policy depends on `auth.uid()` from an anon session.

```bash
npm run dev
```

### Environment variables (`.env.local`)

```
# Supabase (from your Supabase project settings)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# YouTube Data API v3 — server-side only, never prefix with NEXT_PUBLIC_
YOUTUBE_API_KEY=
```

### File structure

```
app/
  page.tsx                     → Home / "Start a Room"
  join/page.tsx                 → QR scan landing + manual code entry
  room/[code]/host/page.tsx     → Host screen (TV or mobile)
  room/[code]/guest/page.tsx    → Guest screen (search + queue)
  api/youtube-search/route.ts   → Server-side YouTube API proxy (keeps key private)
lib/
  supabase.ts     → Client + ensureAnonSession()
  roomCode.ts     → Room code generation (Section 9a)
  nickname.ts     → Auto-assigned guest nicknames (Section 5.2)
  songs.ts        → Cache-first search + normalize/dedup logic (Sections 8, 9a)
types/index.ts    → Types matching the Supabase schema (Section 7)
supabase/schema.sql → Full schema + RLS policies (same SQL as Section 7)
```

### What's already implemented vs. stubbed

**Working:**
- `lib/supabase.ts` — anonymous auth session handling
- `lib/roomCode.ts` — ambiguous-character-free code generator with collision retry
- `lib/nickname.ts` — random nickname pool ("Sunny Mango", etc.)
- `lib/songs.ts` — cache-first search + normalized-title dedup check before any API call
- `app/page.tsx` — full "Start a Room" flow, including retry-on-code-collision

**Stubbed with TODO comments pointing to the relevant PRD section:**
- Host screen — realtime queue subscription, YouTube IFrame player, split/fullscreen layout, wake lock, portrait-rotation prompt
- Guest screen — join flow, nickname assignment, search UI, live queue display
- `app/api/youtube-search/route.ts` — actual YouTube Data API call, karaoke keyword post-filter, dedup-before-insert
- `app/join/page.tsx` — reads `?code=` from the QR URL, routes to the guest screen

### Build order

1. Wire `ensureAnonSession()` into a root client provider so it fires once on app load, before any DB writes.
2. Build the **guest join flow** end-to-end first (join → nickname → search → add to queue). It's simpler than the host screen and validates the schema/RLS policies actually work as designed.
3. Then build the **host screen**: realtime queue subscription, YouTube IFrame player, split/fullscreen states.
4. Wire the YouTube API route last — until then, `searchSongs()` just returns cache hits (empty at first, which is expected and fine for testing the queue/realtime logic independently).

---

## 14b. Roadmap (post-MVP)

### Public vs. Private Rooms (v2)

MVP has one room behavior: join by code, period — no password concept at all. v2 splits rooms into two types:

- **Private** (current MVP behavior, unchanged) — not listed anywhere. The only way in is the room code, entered manually or via QR scan. Code = required gate.
- **Public** — listed on a new "Browse Rooms" page inside the app. A guest taps a room from that list and joins immediately — no code needed to get in. The room's code still exists, but only as a shareable/searchable reference (e.g. "just search KJ48X" in a group chat), not as an access gate. Capped at **10 guests** — the 11th join attempt is rejected with a clear "This room is full" message.

**Schema note:** this needs a `visibility` column on `rooms` (`'public' | 'private'`, default `'private'`) and a guest-count check on join for public rooms (reject at 10). The RLS insert policy on `guests` would need an added condition for public rooms: allow insert only if current guest count for that room_id is under 10. Private rooms keep today's behavior — no cap, no visibility check, code is the only gate.

**Open question for later:** does a "Browse Rooms" listing need any filtering/sorting (e.g. by activity, by number of guests), or is a flat list fine at this scale? Not worth deciding now — revisit once public rooms are actually being used.

### Dedications (v2)

A guest can optionally tag who a song is for when queuing it (e.g. "Para kay Tita Rosa"). Shows next to the singer name in the queue and on the host's Now Playing card.

**Schema note:** one nullable `dedication` text column on `queue_items`. No new table, no RLS changes needed beyond what already governs that row.

### Session Recap (v2)

When a room ends (auto-expiry per Section 6a, or host explicitly ends it), generate a shareable summary card: total songs sung, total session duration, top singer (most songs played), and a list of song titles from that session. Downloadable/shareable as a PNG.

**Mechanics:**
- All the data needed already exists in `queue_items` + `songs` (status = `played`, `requested_at`, `singer_name`) — no new tables required, just an aggregation query once a room's status flips to `ended`.
- Render the recap as a styled off-screen DOM card, then convert to a PNG client-side (e.g. via `html-to-image` or `dom-to-image`) for download/share — no server-side image generation needed.
- Think Spotify Wrapped energy: bold numbers, one or two fun stats, KanTara branding — built to actually get posted/shared, not just a plain data table.

### Reactions (v2)

Guests can tap a quick reaction (🔥, 👏) while a song is playing; it appears as a brief animated burst on the host screen.

**Mechanics:** this should NOT be a `queue_items`-adjacent DB table — that would mean a write to Postgres per tap, which doesn't scale well and isn't data worth persisting. Instead, use **Supabase Realtime Broadcast** (channel-based, ephemeral pub/sub, not tied to a table) scoped to the room's `id` as the channel name. Guests broadcast `{ emoji }` events; the host client (and other guests, optionally) subscribe and render a transient animation — nothing touches the database, so there's no RLS or storage concern at all. Purely in-the-moment fun — not tracked, counted, or fed into the Session Recap.

### Discover: Popular + Trending (v2, replaces earlier vague "AI recommendations" idea)

A "Discover" section on the guest search screen, surfacing songs before anyone has to type anything. Two data sources, both scoped to avoid the per-singer personalization problem (Section 14b intro — that data cascade-deletes with the room):

- **"Popular on KanTara"** — pulled straight from the `songs` table's `times_played`, which is global and persists forever regardless of any single room's 6-hour lifespan. Free, already-available data — no new infrastructure.
- **"Trending in the Philippines"** — pulled from YouTube's own trending data (`videos.list` with `chart=mostPopular`, `regionCode=PH`), cross-referenced against the existing karaoke-filtered search (Section 8/9) to surface actual karaoke versions of currently-trending songs, not just the trending music videos themselves.

**Mechanics:** don't call the trending endpoint per-user — that burns quota fast for something that only changes daily. Refresh it once a day via a scheduled job (Supabase cron/edge function), store results in a small `trending_suggestions` table, and serve that cached list to every guest. This keeps the feature essentially free on quota, same spirit as the cache-first search architecture in Section 8.

No per-singer personalization, no AI model needed — just two well-sourced "what's popular" lists, one from your own usage data and one from what's actually charting in PH right now.

**Real user feedback (informal testing):** a user commented that when they don't know what to search for, they'd rather browse a full list of available karaoke songs than only see Trending/Popular highlights. This is a genuine gap — Trending and Popular are curated highlights (a handful of songs), not a way to browse broadly, so someone whose taste doesn't match either list still hits a dead end.

**Fix — additive, not a replacement.** Keep Trending PH + Popular on KanTara as-is (both are working correctly), and add underneath them:
- **Browse by category** — bring back the original genre groupings from the first rough concept (Section 1's original brainstorm): OPM, Classics, Recently Played, Most Requested. Each pulls from the same `songs` cache, just filtered/sorted differently (e.g. `times_played` descending for Most Requested, `last_played_at` descending for Recently Played).
- **"See all cached songs"** as a final fallback — a simple browsable/searchable list of the entire `songs` cache, not specially curated. This is the literal "show everything" the commenter wanted, but positioned as a fallback underneath the curated sections rather than the default view, so it doesn't turn into an unsorted wall of songs as the cache grows over time.

This keeps the default screen scannable (a few curated highlights first) while still giving an escape hatch for "I just want to see what's available" — without the long-term mess of dumping the whole cache as the primary view.

**API cost check:** Browse by category and "See all cached songs" are pure database reads against the existing `songs` table (sorted/filtered differently) — zero YouTube API calls, same cost as any other page load. Trending PH is the only piece that calls YouTube, using the cheap `videos.list` chart endpoint (1 unit vs. `search.list`'s 100), refreshed once a day total rather than per-guest. Net effect: this whole feature adds negligible quota cost on top of what's already planned.

Genre tagging (for OPM/Classics filters) happens once, at the moment a song is first cached — using genre/category metadata YouTube already returns, or a simple keyword/artist match — not a new API call every time someone browses.

**Status: on hold, not dropped.** With the cache at ~31 songs (as of first real usage), splitting into 4+ categories would leave most of them nearly empty — worse than not having categories at all. Revisit once the cache is meaningfully larger (a few hundred songs) or Public Rooms brings in more varied usage, whichever comes first.

**Build order note:** Public/Private Rooms is planned before Browse — not just prioritization, but a real dependency. Opening Public Rooms brings in more varied usage, which grows the `songs` cache faster than family-only usage alone, directly moving Browse toward its "revisit" trigger above.

**Decision: no manual pre-seeding for Browse.** The cache starts thin and grows organically through real usage, same as the rest of the app. Fine for family/small-group scale — worth revisiting only if/when Public Rooms opens this up to strangers, since an empty or sparse Browse tab reads worse to someone who's never used the app before than to your own family.

### Public Voice Rooms (v2)

Public rooms (Section 14b intro) need live voice, since guests are remote and can't share a physical speaker/mic like private rooms do. Scope: audio-only, max 8 guests per room, one active mic at a time (rotates with the singer), everyone else listen-only.

**Architecture: LiveKit Cloud's free "Build" tier**, not self-hosted. Self-hosting on Oracle Cloud was the original plan, but Oracle's identity verification step became a real, hard blocker (no traditional credit card, prepaid/e-wallet cards like GCash/Maya explicitly rejected, and even a legitimate bank debit card ran into account-creation errors). LiveKit Cloud's Build tier requires **no credit card at all** and includes 5,000 WebRTC minutes/month + 50GB data transfer for free — more than enough runway to build, test, and soft-launch this feature before ever needing to think about billing.

**Rough capacity math:** these platforms bill in participant-minutes (everyone connected counts, not just room duration) — LiveKit Cloud doesn't cap the *number* of rooms, only cumulative monthly minutes (5,000 free) and data transfer (50GB free). Room size itself is capped at up to 50 participants on the free tier, well above the 8-person design here.

| Room size | Session length | Minutes used | Sessions/month on 5,000 free minutes |
|---|---|---|---|
| 8 people (max) | 1 hour | 480 | ~10 |
| 8 people | 2 hours | 960 | ~5 |
| 4 people | 1 hour | 240 | ~20 |

Mapped against the original capacity targets (Section 14b intro): 3 simultaneous 8-person rooms running for 1 hour ≈ 1,440 minutes in that single hour — meaning that exact scenario could run about 3-4 times total per month before hitting the free ceiling. This isn't built for always-on, all-day public voice rooms at scale — but for validating the feature and running it during actual planned sessions, it's comfortable headroom for now. Revisit self-hosting only once real usage data shows this ceiling actually becoming a constraint.

**What this removes entirely:** Oracle VM provisioning, Docker/Compose setup, OS + cloud-level firewall configuration, TURN server setup, and the identity-verification blocker altogether. What's still needed: an API key/secret from the LiveKit Cloud dashboard, and the same mic-rotation logic described below — that part doesn't change based on where the server runs.

**Mic rotation mechanics.** Ties directly into the existing queue system rather than needing new state:

1. Guests join the room's voice channel once and stay connected for the whole session — no rejoining between songs.
2. When a `queue_items` row's `status` flips to `'playing'` (already the exact trigger point used for `times_played`/`last_played_at` updates, per Section 9a), the backend grants that singer's connection publish permission (mic live) and revokes everyone else's in that room.
3. When the song ends and the next item flips to `'playing'`, the previous singer's mic permission is revoked and the new singer's is granted — same continuous voice room, just a permission handoff.
4. This is enforced server-side via LiveKit's participant permission API, not just a muted button in the guest's UI — consistent with the "don't trust the client" principle already used for the 3-song pending cap (Section 7 RLS).

**Status: infra done.** LiveKit Cloud account created, project set up, API Key/Secret/WebSocket URL obtained — no code written yet.

**Build plan, step by step:**

1. **Store credentials.** Add `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL` (the `wss://` project URL) to `.env.local`, matching the pattern already used for Supabase/YouTube keys (Section 14a). The secret is server-side only, never exposed to the client.

2. **Install SDKs.** Server-side: `livekit-server-sdk` (Node), used to generate access tokens and manage participant permissions. Client-side: `livekit-client`, used by the browser to actually connect, publish, and subscribe to audio.

3. **Token generation endpoint.** A new API route (e.g. `app/api/voice/token/route.ts`) that, given a room code and the guest's identity (their `auth.uid()` from Supabase anon auth, Section 14a), generates a LiveKit access token scoped to that specific voice room. Every guest gets `canPublish: false` by default when they first join — listen-only until the rotation logic (step 5) explicitly grants them the mic.

4. **Guest joins the voice channel.** On the client, once a guest has a token from step 3, connect to the LiveKit room using `livekit-client` and stay connected for the whole session — matches the "join once, stay connected" mechanic already specced above. This should happen automatically when a guest enters a Public Room, not require a separate manual "join voice" step.

5. **Mic rotation listener.** A small server-side listener — reacting to the same `queue_items.status` → `'playing'` transition already used for `times_played` updates (Section 9a) — calls LiveKit's Server SDK to update participant permissions: revoke the previous singer's `canPublish`, grant it to the new singer. This is the one new piece of backend logic this whole feature actually needs; everything else is wiring.

6. **Singer-side mic publish.** When a guest's permission flips to `canPublish: true`, their client requests browser mic access (`getUserMedia`) and publishes their local audio track to the room. If mic permission is denied by the browser, fail gracefully — they can still listen, they just won't be heard (worth a small UI note, not a blocker).

7. **Listener-side "who's live" UI.** Guests who aren't currently singing need a simple visual cue for who is — driven by LiveKit's track-subscribed/active-speaker events, not by re-deriving it from the queue state separately (avoids two sources of truth going out of sync).

8. **Host-side integration.** The host screen (Section 11c) also connects to the same voice room as a listen-only participant, so the "audio system" is fully virtual — no separate physical speaker setup assumed, consistent with the original problem statement for Public Rooms (guests are remote, can't share a physical mic/speaker).

9. **Test with 2 real devices first**, not just one browser tab — confirm the rotation actually happens automatically when a queue item's status changes, before testing at full 8-person capacity.

10. **Gate behind Public Rooms only.** Private Rooms keep working exactly as they do today (Section 5.1/5.2) — voice is additive, not a change to the existing private-room experience.

### Song Challenge & Karaoke Roulette (v2)

A guest can challenge another guest to sing a specific song. The challenged guest gets a real-time popup with **Accept** or **Pass**. If they pass, the same challenge gets re-offered to a different random guest, and a pass counter increments. After **5 passes** on that specific challenge (not room-wide — each challenge tracks its own count), **Karaoke Roulette** triggers: a random guest is selected and the song is queued under their name with no accept/pass option at all.

**Genuinely separate system from normal song requests.** A Challenge (or a Roulette-forced song) does not count against a guest's 3-song pending cap (Section 9a/7) — that cap exists to stop self-serve spam, not to limit songs someone else assigned to you. This needs a real schema distinction, not just a UI one, or the RLS insert policy would incorrectly block a challenge-accepted song for a guest who's already at their normal cap.

**Schema:**
- New `source` column on `queue_items` (`'self' | 'challenge' | 'roulette'`, default `'self'`) — the existing RLS pending-cap check (Section 7) only counts `source = 'self'` rows, so challenge/roulette-originated songs never get blocked by or count toward that cap.
- New `song_challenges` table: `id`, `room_id`, `initiator_guest_id`, `song_id`, `current_target_guest_id`, `status` (`pending | accepted | roulette_resolved`), `pass_count`, `passed_guest_ids` (array, so the same challenge isn't re-offered to someone who already declined it), `created_at`.

**Flow:**
1. Guest A picks a song and a target guest → inserts a `song_challenges` row.
2. Target guest gets a real-time popup (Supabase Realtime subscription on `song_challenges` filtered to their `auth.uid()`, not an ephemeral broadcast like Reactions — this needs actual resolvable state, not fire-and-forget).
3. **Accept** → inserts a `queue_items` row with `source = 'challenge'`, `requested_by` = the target guest, challenge marked `accepted`.
4. **Pass** → `pass_count += 1`, target guest's ID added to `passed_guest_ids`, challenge re-offered to a different random guest (excluding whoever's already passed and whoever's currently singing).
5. At `pass_count = 5` → **Karaoke Roulette**: a guest is randomly selected from the whole room (this pool intentionally *includes* guests who already passed on the direct challenge — Roulette is meant to be inescapable, unlike a direct challenge). Song is auto-queued with `source = 'roulette'`, no accept/pass shown, just a notification.

**Real consent consideration, not just a technical one.** The app can't literally force anyone to sing — "cannot decline" just means no opt-out button, not physical enforcement. For a genuinely shy guest or someone not feeling it that round, being auto-queued with zero say could turn a fun mechanic into a bad moment for that specific person. Worth adding a one-time **"Include me in Challenges & Roulette"** toggle guests can set when they join (defaulting on, to keep the party energy), so people who genuinely don't want to play this particular game can opt out without it feeling like refusing to participate in the karaoke session itself.

### Other Future Ideas (v2, not yet detailed)

Lighter items on the radar that haven't been fleshed out into full specs yet:

- Song voting
- Favorites / playlists
- Session history
- Password-protected rooms
- Multiple concurrent rooms per host
- Remote playback controls
- PWA + offline metadata cache
