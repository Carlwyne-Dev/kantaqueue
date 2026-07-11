'use client';

import { useEffect } from 'react';
import { ensureAnonSession } from '@/lib/supabase';

/**
 * Fires ensureAnonSession() once on app mount so every page has a valid
 * auth.uid() before making any DB writes.
 * PRD §14a: "Wire ensureAnonSession() into a root client provider so it
 * fires once on app load, before any DB writes."
 */
export default function AnonSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    ensureAnonSession().catch((err) =>
      console.error('[KantaQueue] Anon session error:', err)
    );
  }, []);

  return <>{children}</>;
}
