// ============================================================
// KanTara — YouTube video status checker
// Checks if a video is embeddable before letting it into the queue.
// Uses videos.list?part=status — costs only 1 quota unit (vs 100 for search).
// ============================================================

import { type NextRequest } from 'next/server';
import { logQuotaUsage } from '@/lib/quota';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!videoId) {
    return Response.json({ error: 'Missing videoId' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    // No API key — assume video is fine to avoid blocking everything
    return Response.json({ embeddable: true, reason: 'no_api_key' });
  }

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'status');
    url.searchParams.set('id', videoId);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    await logQuotaUsage(1); // videos.list = 1 unit

    if (!res.ok) {
      return Response.json({ embeddable: true, reason: 'api_error' });
    }

    const data = await res.json();
    const item = data.items?.[0];

    if (!item) {
      // Video not found — unavailable/deleted
      return Response.json({ embeddable: false, reason: 'not_found' });
    }

    const status = item.status;
    const embeddable =
      status?.embeddable === true &&
      status?.privacyStatus === 'public' &&
      status?.uploadStatus === 'processed';

    return Response.json({
      embeddable,
      reason: !embeddable
        ? status?.embeddable === false
          ? 'embedding_disabled'
          : status?.privacyStatus !== 'public'
          ? 'not_public'
          : 'not_processed'
        : 'ok',
    });
  } catch {
    // Network error — fail open so we don't block users unnecessarily
    return Response.json({ embeddable: true, reason: 'network_error' });
  }
}
