import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const [roomsRes, songsRes] = await Promise.all([
      supabase.from('rooms').select('*', { count: 'exact', head: true }),
      supabase.from('queue_items').select('*', { count: 'exact', head: true }),
    ]);

    return Response.json({
      rooms: roomsRes.count || 0,
      songs: songsRes.count || 0,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      }
    });
  } catch (error) {
    return Response.json({ rooms: 0, songs: 0 }, { status: 500 });
  }
}
