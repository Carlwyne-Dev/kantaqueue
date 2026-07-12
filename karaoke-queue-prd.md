# Product Requirements Document: KanTara

**Status:** Draft v1
**Owner:** Build (AppBuildersPH)

---

## 0. Naming

**KanTara** — reads literally as "kanta" (sing) + "queue," and doubles as "Kantako" ("my song") when said aloud. Playful, Filipino-flavored, and describes exactly what the app does without being generic.

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

## 12. Success Metrics (post-launch)

- % of searches served from cache vs YouTube API (target: growing over time)
- Median time from "join room" to "first song added"
- Songs added per session
- Sessions with zero host manual intervention (skip/remove) — proxy for "it just worked"

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| YouTube API quota exhaustion during a live party | Pre-seeded cache, debounced search, quota monitoring |
| No auth means anyone with the room code can spam the queue | v1 accepts this risk (parties are trusted groups); consider queue item caps per guest if it becomes a problem |
| YouTube IFrame API embedding restrictions on some videos | Show a clear "unavailable" state and let host skip |

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

- Song voting
- Favorites / playlists
- Session history
- Password-protected rooms
- AI song recommendations from past sessions
- Multiple concurrent rooms per host
- Remote playback controls
- PWA + offline metadata cache
