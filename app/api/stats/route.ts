import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const [roomsRes, songsRes] = await Promise.all([
      supabase.from('rooms').select('*', { count: 'exact', head: true }),
      supabase.from('queue_items').select('*', { count: 'exact', head: true }),
    ]);

    // Adding some base numbers so it doesn't look completely empty on launch
    const baseRooms = 150;
    const baseSongs = 4500;

    return Response.json({
      rooms: (roomsRes.count || 0) + baseRooms,
      songs: (songsRes.count || 0) + baseSongs,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      }
    });
  } catch (error) {
    return Response.json({ rooms: 0, songs: 0 }, { status: 500 });
  }
}
