// ============================================================
// KantaQueue — Supabase schema types (mirrors Section 7 of PRD)
// ============================================================

export type RoomStatus = 'active' | 'paused' | 'ended';
export type QueueItemStatus = 'queued' | 'playing' | 'played' | 'skipped' | 'removed';

// ---------- ROOMS ----------
export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  created_at: string;
}

// ---------- SONGS (global cache) ----------
export interface Song {
  id: string;
  title: string;
  normalized_title: string;
  artist: string | null;
  youtube_video_id: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  times_played: number;
  last_played_at: string | null;
  date_added: string;
}

// ---------- GUESTS ----------
export interface Guest {
  id: string;
  room_id: string;
  auth_uid: string;
  display_name: string;
  joined_at: string;
}

// ---------- QUEUE ITEMS ----------
export interface QueueItem {
  id: string;
  room_id: string;
  song_id: string;
  requested_by: string;
  singer_name: string;
  status: QueueItemStatus;
  requested_at: string;
  position: number | null;
  // Joined fields (from songs table)
  song?: Song;
}

// ---------- YOUTUBE SEARCH ----------
export interface YouTubeSearchResult {
  youtube_video_id: string;
  title: string;
  artist: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  from_cache: boolean;
  times_played: number;
}

// ---------- APP STATE ----------
export interface RoomWithQueue {
  room: Room;
  queue: QueueItem[];
  nowPlaying: QueueItem | null;
}
