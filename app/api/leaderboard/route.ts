import { getSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    // Fetch top 5 most played songs globally
    const { data, error } = await supabase
      .from('songs')
      .select('id, title, artist, thumbnail_url, times_played')
      .gt('times_played', 0)
      .order('times_played', { ascending: false })
      .limit(5);

    if (error) throw error;

    return NextResponse.json({ songs: data || [] }, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60',
      }
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ songs: [] }, { status: 500 });
  }
}
