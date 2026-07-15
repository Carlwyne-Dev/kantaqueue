import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const [{ count: roomsCount }, { count: songsCount }] = await Promise.all([
      supabase.from('rooms').select('*', { count: 'exact', head: true }).not('started_at', 'is', null),
      supabase.from('queue_items').select('*', { count: 'exact', head: true })
    ]);

    return Response.json({
      rooms: roomsCount || 0,
      songs: songsCount || 0,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=3600',
      }
    });
  } catch (error) {
    return Response.json({ rooms: 0, songs: 0 }, { status: 500 });
  }
}

