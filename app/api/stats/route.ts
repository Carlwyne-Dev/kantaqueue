import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    // Fetch lifetime stats from the new global_stats table
    const { data } = await supabase
      .from('global_stats')
      .select('total_rooms, total_songs')
      .eq('id', 1)
      .single();

    return Response.json({
      rooms: data?.total_rooms || 0,
      songs: data?.total_songs || 0,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=3600',
      }
    });
  } catch (error) {
    return Response.json({ rooms: 0, songs: 0 }, { status: 500 });
  }
}

