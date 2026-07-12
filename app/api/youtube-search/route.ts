// ============================================================
// KanTara — YouTube Data API v3 server-side proxy
// PRD §10: "server-side YouTube API proxy (keeps key private)"
// PRD §8: karaoke keyword append + post-filter, debounce note
// PRD §9a: search.list costs 100 units; guard quota carefully
// ============================================================

import { type NextRequest } from 'next/server';

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

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || query.trim().length < 3) {
    return Response.json({ error: 'Query must be at least 3 characters' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'YouTube API key not configured' }, { status: 500 });
  }

  // PRD §8: append "karaoke" to the search term so raw results skew karaoke
  const searchQuery = `${query.trim()} karaoke`;

  try {
    // Step 1: search.list — costs 100 units per call
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', searchQuery);
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('videoCategoryId', '10'); // Music
    searchUrl.searchParams.set('maxResults', '15');
    searchUrl.searchParams.set('key', apiKey);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      const err = await searchRes.json();
      console.error('[youtube-search] search.list failed:', err);
      return Response.json([], { status: 200 }); // Fail silently — return empty array
    }

    const searchData = await searchRes.json();
    const items: YouTubeSearchItem[] = searchData.items ?? [];

    // Step 2: Post-filter — only keep karaoke-signal videos (PRD §8)
    const karaokeItems = items.filter((item) =>
      isKaraokeVideo(item.snippet.title, item.snippet.description)
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

    const videosRes = await fetch(videosUrl.toString());
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
