import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('app_stats')
      .select('total_rooms_created, total_songs_queued')
      .eq('id', 1)
      .single();

    if (error || !data) {
      return Response.json({ rooms: 0, songs: 0 }, { status: 500 });
    }

    return Response.json({
      rooms: data.total_rooms_created,
      songs: data.total_songs_queued,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=3600',
      }
    });
  } catch (error) {
    return Response.json({ rooms: 0, songs: 0 }, { status: 500 });
  }
}

