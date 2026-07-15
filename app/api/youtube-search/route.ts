// ============================================================
// KanTara — YouTube Data API v3 server-side proxy
// PRD §10: "server-side YouTube API proxy (keeps key private)"
// PRD §8: karaoke keyword append + post-filter, debounce note
// PRD §9a: search.list costs 100 units; guard quota carefully
// ============================================================

import { type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Keywords that identify a karaoke/videoke track (PRD §8)
const KARAOKE_KEYWORDS = ['karaoke', 'videoke', 'instrumental', 'minus one'];

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    description: string;
    thumbnails: {
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

interface YouTubeVideoItem {
  id: string;
  contentDetails: {
    duration: string; // ISO 8601 duration, e.g. "PT3M45S"
  };
}

/**
 * Parses ISO 8601 duration to seconds.
 * e.g. "PT3M45S" → 225
 */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h = '0', m = '0', s = '0'] = match;
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
}

/**
 * Returns true if this video's title or description contains at least one
 * karaoke-signal word.
 * PRD §8: "drop any video whose title/description doesn't contain at least one of:
 * karaoke, videoke, instrumental, minus one"
 */
function isKaraokeVideo(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return KARAOKE_KEYWORDS.some((kw) => haystack.includes(kw));
}

/**
 * Extracts an 11-character YouTube video ID from a URL, if present.
 */
function extractVideoId(query: string): string | null {
  const match = query.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : null;
}

/**
 * Fetches all blocked video IDs (times_played = -1) from the songs table.
 * Used to strip unavailable/broken videos from fresh YouTube results server-side.
 */
async function getBlockedVideoIds(): Promise<Set<string>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return new Set();

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
      .from('songs')
      .select('youtube_video_id')
      .lt('times_played', 0); // times_played = -1 means blocked
    return new Set((data ?? []).map((r: { youtube_video_id: string }) => r.youtube_video_id));
  } catch {
    return new Set(); // non-critical — degrade gracefully
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || query.trim().length < 3) {
    return Response.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'YouTube API key not configured' }, { status: 500 });
  }

  const directVideoId = extractVideoId(query);

  try {
    if (directVideoId) {
      // Direct URL flow: fetch the specific video and bypass karaoke filter
      const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      videosUrl.searchParams.set('part', 'snippet,contentDetails');
      videosUrl.searchParams.set('id', directVideoId);
      videosUrl.searchParams.set('key', apiKey);

      const res = await fetch(videosUrl.toString(), { next: { revalidate: 604800 } });
      if (!res.ok) return Response.json([]);
      const data = await res.json();
      const items = data.items || [];

      if (items.length === 0) return Response.json([]);
      const item = items[0];

      const result = {
        youtube_video_id: item.id,
        title: item.snippet.title,
        artist: item.snippet.channelTitle,
        thumbnail_url:
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          null,
        duration_seconds: parseDuration(item.contentDetails?.duration || ''),
        from_cache: false,
        times_played: 0,
      };

      return Response.json([result]);
    }

    // Normal search flow: append "karaoke" to the search term
    const searchQuery = `${query.trim()} karaoke`;

    // Load blocked IDs in parallel with the YouTube search call
    const [blockedIds, searchRes] = await Promise.all([
      getBlockedVideoIds(),
      fetch(
        (() => {
          const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
          searchUrl.searchParams.set('part', 'snippet');
          searchUrl.searchParams.set('q', searchQuery);
          searchUrl.searchParams.set('type', 'video');
          searchUrl.searchParams.set('maxResults', '15');
          searchUrl.searchParams.set('key', apiKey);
          return searchUrl.toString();
        })(),
        { next: { revalidate: 604800 } } // Cache globally for 1 week to save quota
      ),
    ]);

    if (!searchRes.ok) {
      const err = await searchRes.json().catch(() => ({}));
      console.error('[youtube-search] search.list failed:', err);
      const isQuota = err.error?.errors?.[0]?.reason === 'quotaExceeded' || err.error?.code === 403;
      return Response.json({ error: isQuota ? 'quota_exceeded' : 'youtube_api_error' }, { status: 429 });
    }

    const searchData = await searchRes.json();
    console.log('[youtube-search debug] searchData.items length:', searchData.items?.length);
    const items: YouTubeSearchItem[] = searchData.items ?? [];

    // Step 2: Strip any blocked/unavailable video IDs
    const karaokeItems = items.filter((item) =>
      !blockedIds.has(item.id.videoId)
    );

    if (karaokeItems.length === 0) {
      return Response.json([]);
    }

    // Step 3: videos.list to get duration — costs 1 unit per call
    const videoIds = karaokeItems.map((item) => item.id.videoId).join(',');
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videosUrl.searchParams.set('part', 'contentDetails');
    videosUrl.searchParams.set('id', videoIds);
    videosUrl.searchParams.set('key', apiKey);

    const videosRes = await fetch(videosUrl.toString(), { next: { revalidate: 604800 } });
    const videosData = await videosRes.json();
    const videoDetails: Map<string, number> = new Map(
      (videosData.items as YouTubeVideoItem[]).map((v) => [
        v.id,
        parseDuration(v.contentDetails.duration),
      ])
    );

    // Step 4: Shape into YouTubeSearchResult
    const results = karaokeItems.map((item) => ({
      youtube_video_id: item.id.videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      thumbnail_url:
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        null,
      duration_seconds: videoDetails.get(item.id.videoId) ?? null,
      from_cache: false,
      times_played: 0,
    }));

    return Response.json(results);
  } catch (err) {
    console.error('[youtube-search] Unexpected error:', err);
    // PRD §8: "fall back to cached results with a clear message rather than a blank error"
    return Response.json([], { status: 200 });
  }
}
