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


-- ---------- TRENDING CACHE ----------
-- Caches the Trending PH result from YouTube for 24h to avoid burning quota.
-- To force-refresh: DELETE FROM trending_cache;
create table trending_cache (
  id int primary key,
  items jsonb not null default '[]',
  refreshed_at timestamptz not null default now()
);

alter table trending_cache enable row level security;

create policy "anyone can read trending cache"
  on trending_cache for select using (true);

create policy "service role can upsert trending cache"
  on trending_cache for all using (true) with check (true);


-- ---------- API QUOTA ----------
-- Tracks daily YouTube API usage to avoid burning quota limits
create table api_quota (
  date date primary key,
  units_used int not null default 0
);

alter table api_quota enable row level security;

create policy "anyone can read quota"
  on api_quota for select using (true);

create policy "service role can update quota"
  on api_quota for all using (true) with check (true);


-- ---------- REALTIME ----------
alter publication supabase_realtime add table queue_items;
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table guests;


-- ---------- INDEXES ----------
create index idx_queue_items_room_id on queue_items(room_id);
create index idx_queue_items_requested_by on queue_items(requested_by);
create index idx_songs_youtube_video_id on songs(youtube_video_id);
create index idx_rooms_code on rooms(code);

-- ---------- GLOBAL STATS ----------
-- Keeps track of lifetime totals so that when rooms are deleted, counts don't go down.
create table global_stats (
  id int primary key,
  total_rooms bigint not null default 0,
  total_songs bigint not null default 0
);

-- Backfill table with initial values
insert into global_stats (id, total_rooms, total_songs)
values (1, (select count(*) from rooms), (select count(*) from queue_items))
on conflict (id) do nothing;

alter table global_stats enable row level security;
create policy "anyone can read global_stats" on global_stats for select using (true);
create policy "service role can update global_stats" on global_stats for all using (true) with check (true);

-- Trigger: Increment total_rooms when a room is created
create or replace function increment_total_rooms() returns trigger as $$
begin
  update global_stats set total_rooms = total_rooms + 1 where id = 1;
  return new;
end;
$$ language plpgsql;

create trigger on_room_created
after insert on rooms for each row
execute function increment_total_rooms();

-- Trigger: Increment total_songs when a queue_item is created
create or replace function increment_total_songs() returns trigger as $$
begin
  update global_stats set total_songs = total_songs + 1 where id = 1;
  return new;
end;
$$ language plpgsql;

create trigger on_queue_item_created
after insert on queue_items for each row
execute function increment_total_songs();

-- ---------- AUTO DELETE OLD ROOMS ----------
-- Requires pg_cron extension to be enabled in Supabase Dashboard (Database -> Extensions)
-- This deletes rooms older than 6 hours, running every hour.
select cron.schedule(
  'delete-old-rooms',
  '0 * * * *',
  $$ delete from rooms where created_at < now() - interval '6 hours'; $$
);
