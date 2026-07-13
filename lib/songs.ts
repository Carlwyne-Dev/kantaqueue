// ============================================================
// KanTara — Cache-first song search
// PRD §8: Search Architecture
// PRD §9a: normalized_title dedup before insert
// ============================================================

import { getSupabaseClient } from './supabase';
import type { Song, YouTubeSearchResult } from '@/types';

// ---- Normalization helpers ----

/**
 * Strips punctuation, lowercases, and trims a title so we can fuzzy-match
 * "My Way", "my way!", "MY WAY (Frank Sinatra)" as the same song.
 * PRD §8: "lowercased, trimmed, punctuation-stripped title"
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ')    // collapse whitespace
    .trim();
}

/**
 * Checks if two normalized titles are "close enough" to be the same song.
 * Uses simple substring containment — if one normalised string contains the
 * other, treat them as the same cached entry.
 */
function isSimilarTitle(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

// ---- Cache search ----

/**
 * Searches the Supabase songs cache first.
 * Returns rows ordered by times_played DESC so the most-sung version surfaces first.
 * PRD §8 Step 1: "query songs table first (fuzzy match on title/artist)"
 */
export async function searchSongsCache(query: string): Promise<Song[]> {
  const supabase = getSupabaseClient();
  const normalized = normalizeTitle(query);

  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .ilike('normalized_title', `%${normalized}%`)
    .neq('times_played', -1)   // Exclude permanently blocked songs
    .gte('times_played', 0)    // Belt-and-suspenders: also exclude any other negative values
    .order('times_played', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[songs] Cache search error:', error.message);
    return [];
  }

  return (data as Song[]) ?? [];
}

// ---- Upsert a song from a YouTube result ----

/**
 * Before inserting a new song from the YouTube API, check if a very similar
 * title already exists in the cache. If so, reuse it instead of creating a
 * near-duplicate. Only insert a new row if no reasonable match is found.
 * PRD §8: "check normalized_title against existing rows — if a close match
 * exists, reuse that cached row instead of creating a near-duplicate"
 */
export async function upsertSong(
  result: Omit<YouTubeSearchResult, 'from_cache' | 'times_played'>
): Promise<Song | null> {
  const supabase = getSupabaseClient();
  const normalized = normalizeTitle(result.title);

  // 1. Check by exact youtube_video_id first (fastest check)
  const { data: byId } = await supabase
    .from('songs')
    .select('*')
    .eq('youtube_video_id', result.youtube_video_id)
    .maybeSingle();

  if (byId) return byId as Song;

  // 2. Check by normalized_title similarity
  const { data: byTitle } = await supabase
    .from('songs')
    .select('*')
    .ilike('normalized_title', `%${normalized}%`)
    .limit(10);

  const similarExisting = (byTitle as Song[] | null)?.find((s) =>
    isSimilarTitle(s.normalized_title, normalized)
  );
  if (similarExisting) return similarExisting;

  // 3. No match — insert a new cached song
  const { data: inserted, error } = await supabase
    .from('songs')
    .insert({
      title: result.title,
      normalized_title: normalized,
      artist: result.artist,
      youtube_video_id: result.youtube_video_id,
      thumbnail_url: result.thumbnail_url,
      duration_seconds: result.duration_seconds,
    })
    .select()
    .single();

  if (error) {
    console.error('[songs] Insert error:', error.message);
    return null;
  }

  return inserted as Song;
}

// ---- Main cache-first search (used by guest search UI) ----

/**
 * Full cache-first search flow.
 * 1. Hit Supabase cache → return instantly if hits found.
 * 2. On cache miss → call /api/youtube-search (server-side proxy).
 * 3. Merge results: cached hits first (sorted by times_played), then YouTube results.
 *
 * PRD §8 ranking:
 *   1. Cached matches sorted by times_played DESC
 *   2. Other cached matches
 *   3. Fresh YouTube API results (karaoke-filtered)
 */
export async function searchSongs(query: string): Promise<YouTubeSearchResult[]> {
  const cachedSongs = await searchSongsCache(query);

  // Convert cached songs to YouTubeSearchResult shape
  const cachedResults: YouTubeSearchResult[] = cachedSongs.map((s) => ({
    youtube_video_id: s.youtube_video_id,
    title: s.title,
    artist: s.artist,
    thumbnail_url: s.thumbnail_url,
    duration_seconds: s.duration_seconds,
    from_cache: true,
    times_played: s.times_played,
  }));

  // If we have cache hits, return them — no API call needed
  if (cachedResults.length >= 3) {
    return cachedResults;
  }

  // Cache miss (or sparse results) → call YouTube API proxy
  try {
    const response = await fetch(
      `/api/youtube-search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      console.warn('[songs] YouTube API proxy returned', response.status);
      return cachedResults;
    }

    const freshResults: YouTubeSearchResult[] = await response.json();
    const freshIds = freshResults.map((r) => r.youtube_video_id);

    // Cross-reference fresh IDs with our database to filter out broken ones
    const { data: existingFresh } = await getSupabaseClient()
      .from('songs')
      .select('youtube_video_id, times_played')
      .in('youtube_video_id', freshIds);

    const existingMap = new Map(
      (existingFresh || []).map((s) => [s.youtube_video_id, s.times_played])
    );

    // De-duplicate against cache hits AND filter out broken songs (times_played < 0)
    const cachedIds = new Set(cachedResults.map((r) => r.youtube_video_id));
    const deduped = freshResults.filter((r) => {
      if (cachedIds.has(r.youtube_video_id)) return false;
      const timesPlayed = existingMap.get(r.youtube_video_id);
      if (timesPlayed !== undefined && timesPlayed < 0) return false;
      return true;
    });

    // Merge: cached first (PRD §8 ranking)
    return [...cachedResults, ...deduped];
  } catch (err) {
    console.error('[songs] YouTube search fetch failed:', err);
    // Fall back to cached results rather than a blank error (PRD §8)
    return cachedResults;
  }
}

// ---- Mark a song as played ----

/**
 * Bumps times_played and sets last_played_at when a song finishes.
 * PRD §9a: "Fired once, when a queue item's status flips to 'played'"
 */
export async function markSongPlayed(songId: string): Promise<void> {
  const supabase = getSupabaseClient();

  await supabase.rpc('increment_song_played', { song_id: songId });
  // If rpc not available, fall back to a read-then-write:
  // const { data } = await supabase.from('songs').select('times_played').eq('id', songId).single();
  // await supabase.from('songs').update({ times_played: (data?.times_played ?? 0) + 1, last_played_at: new Date().toISOString() }).eq('id', songId);
}

// ---- Mark a song as permanently unavailable ----

/**
 * Blocks a video from ever appearing in search results again.
 * Sets times_played = -1, which is filtered out by searchSongsCache (.gte('times_played', 0)).
 * If the youtube_video_id is not yet in the DB, it pre-inserts it as blocked
 * so fresh YouTube API results are also filtered out on next search.
 */
export async function markSongUnavailable(youtubeVideoId: string, songId?: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (songId) {
    // Fast path: we know the song's DB id
    await supabase.from('songs').update({ times_played: -1 }).eq('id', songId);
    return;
  }

  // Check if the video is already in the DB by youtube_video_id
  const { data: existing } = await supabase
    .from('songs')
    .select('id')
    .eq('youtube_video_id', youtubeVideoId)
    .maybeSingle();

  if (existing) {
    await supabase.from('songs').update({ times_played: -1 }).eq('id', existing.id);
  } else {
    // Pre-insert as blocked so it's permanently filtered from future searches
    await supabase.from('songs').insert({
      title: `[BLOCKED] ${youtubeVideoId}`,
      normalized_title: `blocked ${youtubeVideoId}`,
      youtube_video_id: youtubeVideoId,
      times_played: -1,
    });
  }
}
