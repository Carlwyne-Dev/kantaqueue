import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { type, message, page } = await req.json();

    if (!type || !message || message.trim().length < 10) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { error } = await supabase.from('feedback').insert({
      type,
      message: message.trim(),
      page: page || null,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[feedback] error:', err);
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
  }
}
