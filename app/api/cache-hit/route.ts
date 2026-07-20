// ============================================================
// KanTara — Cache hit tracker
// Called client-side (fire-and-forget) when getCachedSearchResults
// returns results, so we can compute cache hit rate in admin.
// Costs 0 quota units.
// ============================================================

import { type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false }, { status: 500 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from('api_quota')
      .select('cache_hits_today')
      .eq('date', today)
      .maybeSingle();

    await supabase.from('api_quota').upsert({
      date: today,
      cache_hits_today: (data?.cache_hits_today ?? 0) + 1,
    });

    return Response.json({ ok: true });
  } catch {
    // Non-critical — never block the caller
    return Response.json({ ok: false }, { status: 500 });
  }
}
