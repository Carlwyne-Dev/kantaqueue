// ============================================================
// KanTara — YouTube API quota tracker
// Logs unit usage to Supabase api_quota table.
// Daily limit: 10,000 units
// search.list = 100 units, videos.list = 1 unit
// ============================================================

import { createClient } from '@supabase/supabase-js';

export const DAILY_QUOTA = 10_000;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/**
 * Increments the daily YouTube API quota usage counter.
 * Fails silently — never throws.
 */
export async function logQuotaUsage(units: number): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const supabase = getSupabase();
    // Try update first
    const { data } = await supabase
      .from('api_quota')
      .select('units_used')
      .eq('date', today)
      .maybeSingle();

    if (data) {
      await supabase
        .from('api_quota')
        .update({ units_used: data.units_used + units })
        .eq('date', today);
    } else {
      await supabase
        .from('api_quota')
        .insert({ date: today, units_used: units });
    }
  } catch {
    // Non-critical — never block the response
  }
}

/**
 * Returns today's quota usage and remaining units.
 */
export async function getQuotaStatus(): Promise<{ used: number; remaining: number; date: string }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const supabase = getSupabase();
    const { data } = await supabase
      .from('api_quota')
      .select('units_used')
      .eq('date', today)
      .maybeSingle();

    const used = data?.units_used ?? 0;
    return { used, remaining: DAILY_QUOTA - used, date: today };
  } catch {
    return { used: 0, remaining: DAILY_QUOTA, date: new Date().toISOString().slice(0, 10) };
  }
}
