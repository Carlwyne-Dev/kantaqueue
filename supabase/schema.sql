-- ============================================================
-- KanTara — Full Supabase schema + RLS policies
-- PRD §7 — Run this in the Supabase SQL editor
-- ============================================================

-- ---------- ROOMS ----------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,              -- short human-readable join code, e.g. "KJ48X"
  host_id uuid not null,                  -- auth.uid() of whoever created the room
  status text not null default 'active'   -- active | paused | ended
    check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz                  -- set when host clicks "Start Party"
);

alter table rooms enable row level security;

create policy "rooms are readable by anyone"
  on rooms for select
  using (true);

create policy "any anon user can create a room"
  on rooms for insert
  with check (auth.uid() = host_id);

create policy "only host can update their room"
  on rooms for update
  using (auth.uid() = host_id);

create policy "anyone can delete ended rooms"
  on rooms for delete
  using (status = 'ended');


-- ---------- SONGS (global cache, shared across all rooms) ----------
create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  normalized_title text not null,
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

create policy "songs are readable by anyone"
  on songs for select
  using (true);

create policy "any anon user can insert a cached song"
  on songs for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "any anon user can update play stats"
  on songs for update
  using (true);


-- ---------- GUESTS ----------
create table guests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  auth_uid uuid not null,
  display_name text not null,
  joined_at timestamptz not null default now()
);

alter table guests enable row level security;

create policy "guests are readable by anyone"
  on guests for select
  using (true);

create policy "guests can only insert their own record"
  on guests for insert
  with check (auth.uid() = auth_uid);

create policy "guests can update their own display_name"
  on guests for update
  using (auth.uid() = auth_uid);


-- ---------- QUEUE ITEMS ----------
create table queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  song_id uuid not null references songs(id),
  requested_by uuid not null,
  singer_name text not null,
  status text not null default 'queued'
    check (status in ('queued', 'playing', 'played', 'skipped', 'removed')),
  requested_at timestamptz not null default now(),
  position int
);

alter table queue_items enable row level security;

create policy "queue items are readable by anyone"
  on queue_items for select
  using (true);

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

create policy "guests can modify only their own pending items"
  on queue_items for update
  using (auth.uid() = requested_by and status = 'queued');

create policy "guests can delete only their own pending items"
  on queue_items for delete
  using (auth.uid() = requested_by and status = 'queued');

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
alter publication supabase_realtime add table queue_items;
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table guests;


-- ---------- INDEXES ----------
create index idx_queue_items_room_id on queue_items(room_id);
create index idx_queue_items_requested_by on queue_items(requested_by);
create index idx_songs_youtube_video_id on songs(youtube_video_id);
create index idx_rooms_code on rooms(code);
