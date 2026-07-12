// ============================================================
// KanTara — Supabase client + anonymous session helper
// PRD §7: auth model — every client calls signInAnonymously() on first load
// PRD §14a: lib/supabase.ts
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

// Singleton client for client-side usage
let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local (see .env.local.example).'
    );
  }

  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return clientInstance;
}

/**
 * Ensures the current browser tab has an anonymous Supabase session.
 * PRD §7: Every client (host or guest) calls signInAnonymously() on first load.
 * This gives each browser tab a real auth.uid() with zero visible login UI —
 * which makes RLS rules (guests can only remove their own songs, etc.) enforceable.
 *
 * PRD §14a: Wire this into a root client provider so it fires once on app load,
 * before any DB writes.
 */
export async function ensureAnonSession(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    console.warn('[KanTara] Supabase env vars missing — skipping anonymous sign-in.');
    return null;
  }

  const supabase = getSupabaseClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.id) {
    return session.user.id;
  }

  // No session — sign in anonymously
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    console.error('[KanTara] Failed to sign in anonymously:', error.message);
    return null;
  }

  return data.user?.id ?? null;
}

/**
 * Returns the current user's auth.uid(), or null if not signed in.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// Server-side Supabase client (for API routes — uses service role if available,
// otherwise falls back to anon key for read operations)
export function getSupabaseServer(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
