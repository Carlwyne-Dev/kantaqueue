// ============================================================
// KanTara — Trending PH karaoke songs (YouTube Videos API)
// PRD §14b Discover: chart=mostPopular, regionCode=PH
// Caches result in Supabase for 24h to avoid burning quota
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const KARAOKE_KEYWORDS = ['karaoke', 'videoke', 'instrumental', 'minus one'];

function isKaraokeVideo(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return KARAOKE_KEYWORDS.some((kw) => haystack.includes(kw));
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h = '0', m = '0', s = '0'] = match;
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
}

interface TrendingItem {
  youtube_video_id: string;
  title: string;
  artist: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
}

export async function GET() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Check Supabase cache ──────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from('trending_cache')
    .select('items, refreshed_at')
    .eq('id', 1)
    .maybeSingle();

  if (cached?.items && cached?.refreshed_at) {
    const age = Date.now() - new Date(cached.refreshed_at).getTime();
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ items: cached.items, source: 'cache' });
    }
  }

  // ── Fetch from YouTube ────────────────────────────────────────────────────
  if (!apiKey) {
    // No API key — return cached data even if stale, or empty
    if (cached?.items) {
      return NextResponse.json({ items: cached.items, source: 'stale_cache' });
    }
    return NextResponse.json({ items: [], source: 'no_api_key' });
  }

  try {
    // Step 1: Get popular PH music videos (category 10 = Music)
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&chart=mostPopular&regionCode=PH&videoCategoryId=10&maxResults=50&key=${apiKey}`
    );

    if (!videosRes.ok) {
      throw new Error(`YouTube API error: ${videosRes.status}`);
    }

    const videosData = await videosRes.json();

    // Step 2: For each trending song, search for a karaoke version
    const items: TrendingItem[] = [];

    for (const video of videosData.items ?? []) {
      const snippet = video.snippet;
      const title: string = snippet?.title ?? '';
      const channelTitle: string = snippet?.channelTitle ?? '';
      const description: string = snippet?.description ?? '';

      // Skip if already a karaoke video — use it directly
      if (isKaraokeVideo(title, description)) {
        const duration = parseDuration(video.contentDetails?.duration ?? '');
        items.push({
          youtube_video_id: video.id,
          title,
          artist: channelTitle || null,
          thumbnail_url: snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? null,
          duration_seconds: duration || null,
        });
        if (items.length >= 10) break;
        continue;
      }

      // Extract song/artist and search for karaoke version
      const searchTerm = `${title} karaoke`;
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&type=video&maxResults=3&key=${apiKey}`
      );

      if (!searchRes.ok) continue;

      const searchData = await searchRes.json();
      const karaokeResult = (searchData.items ?? []).find((item: { snippet: { title: string; description: string } }) =>
        isKaraokeVideo(item.snippet?.title ?? '', item.snippet?.description ?? '')
      );

      if (karaokeResult) {
        items.push({
          youtube_video_id: karaokeResult.id?.videoId ?? '',
          title: karaokeResult.snippet?.title ?? title,
          artist: channelTitle || null,
          thumbnail_url: karaokeResult.snippet?.thumbnails?.medium?.url ?? null,
          duration_seconds: null,
        });
        if (items.length >= 10) break;
      }
    }

    // ── Write to cache ────────────────────────────────────────────────────
    await supabase
      .from('trending_cache')
      .upsert({ id: 1, items, refreshed_at: new Date().toISOString() });

    return NextResponse.json({ items, source: 'youtube' });
  } catch (err) {
    console.error('[KanTara trending]', err);
    // Fallback to stale cache on error
    if (cached?.items) {
      return NextResponse.json({ items: cached.items, source: 'stale_cache' });
    }
    return NextResponse.json({ items: [], error: 'fetch_failed' }, { status: 200 });
  }
}
