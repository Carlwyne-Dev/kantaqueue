'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession } from '@/lib/supabase';
import { generateUniqueRoomCode } from '@/lib/roomCode';

function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: 'linear-gradient(160deg, #1a1a1a 0%, #2d2d2d 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
      }}
    >
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="11" rx="3" fill="white" />
        <path d="M5 10a7 7 0 0 0 14 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <line x1="12" y1="17" x2="12" y2="21" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8" y1="21" x2="16" y2="21" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

const features = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="2" width="14" height="20" rx="3" stroke="#1c1c1e" strokeWidth="1.8" />
        <circle cx="12" cy="18" r="1" fill="#1c1c1e" />
      </svg>
    ),
    title: 'Queue from any phone',
    desc: 'Guests scan a QR code — no app install needed.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <line x1="8" y1="7" x2="19" y2="7" stroke="#1c1c1e" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8" y1="12" x2="19" y2="12" stroke="#1c1c1e" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8" y1="17" x2="16" y2="17" stroke="#1c1c1e" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="5" cy="7" r="1.2" fill="#1c1c1e" />
        <circle cx="5" cy="12" r="1.2" fill="#1c1c1e" />
        <circle cx="5" cy="17" r="1.2" fill="#1c1c1e" />
      </svg>
    ),
    title: 'One shared live queue',
    desc: 'Everyone sees who\'s up next in real time.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <polygon points="5,3 19,12 5,21" fill="#1c1c1e" />
      </svg>
    ),
    title: 'Auto playback',
    desc: 'Songs play back-to-back on the host screen.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="#1c1c1e" strokeWidth="1.8" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#1c1c1e" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    title: 'Smart song search',
    desc: 'Cache-first search keeps results fast and quota-safe.',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCreateRoom() {
    setLoading(true);
    try {
      const userId = await ensureAnonSession();
      if (!userId) { toast.error('Could not start session. Please refresh.'); return; }

      const supabase = getSupabaseClient();
      const code = await generateUniqueRoomCode(async (c) => {
        const { data } = await supabase.from('rooms').select('id').eq('code', c).eq('status', 'active').maybeSingle();
        return !!data;
      });

      const { data: room, error } = await supabase.from('rooms').insert({ code, host_id: userId, status: 'active' }).select().single();
      if (error || !room) { toast.error('Failed to create room. Try again.'); return; }
      router.push(`/room/${room.code}/host`);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: '#fff', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif' }}>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 40px', borderBottom: '1px solid #f2f2f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={32} />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.3px' }}>KantaQueue</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            id="nav-join-btn"
            onClick={() => router.push('/join')}
            style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 500, color: '#3a3a3c', cursor: 'pointer', padding: '8px 14px', borderRadius: 10, fontFamily: 'inherit', letterSpacing: '-0.1px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f2f2f7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            Join a Room
          </button>
          <button
            id="nav-help-btn"
            onClick={() => router.push('/help')}
            style={{ background: '#f2f2f7', border: 'none', borderRadius: 20, padding: '8px 16px', fontSize: 14, fontWeight: 500, color: '#1c1c1e', cursor: 'pointer', letterSpacing: '-0.1px', fontFamily: 'inherit' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e5ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#f2f2f7'; }}
          >
            Help
          </button>
        </div>
      </nav>

      {/* ── Hero — two columns ───────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '64px 40px', gap: 80, maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* LEFT — headline + CTA */}
        <div style={{ flex: '0 0 420px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <LogoMark size={64} />

          <h1 style={{ fontSize: 52, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-1.5px', lineHeight: 1.1, margin: '28px 0 0' }}>
            Karaoke,<br />minus the chaos.
          </h1>

          <p style={{ fontSize: 18, color: '#8e8e93', margin: '18px 0 0', lineHeight: 1.6, letterSpacing: '-0.2px', fontWeight: 400 }}>
            One screen, every guest's phone. No passing the phone around. Just sing.
          </p>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 32, marginTop: 36 }}>
            {[
              { n: '&lt;15s', label: 'to queue a song' },
              { n: '0', label: 'app installs needed' },
              { n: '3', label: 'songs per guest cap' },
            ].map(({ n, label }) => (
              <div key={label}>
                <p style={{ fontSize: 28, fontWeight: 700, color: '#1c1c1e', margin: 0, letterSpacing: '-0.8px' }} dangerouslySetInnerHTML={{ __html: n }} />
                <p style={{ fontSize: 12, color: '#8e8e93', margin: '3px 0 0', letterSpacing: '-0.1px' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
            <button
              id="create-room-btn"
              onClick={handleCreateRoom}
              disabled={loading}
              style={{
                flex: 1,
                padding: '16px 24px',
                background: '#1c1c1e',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.3px',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontFamily: 'inherit',
                transition: 'opacity 0.15s, transform 0.1s',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1'; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {loading ? (
                <>
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  Creating&hellip;
                </>
              ) : 'Start a Room'}
            </button>

            <button
              id="join-room-btn"
              onClick={() => router.push('/join')}
              style={{
                flex: 1,
                padding: '16px 24px',
                background: '#f2f2f7',
                color: '#1c1c1e',
                border: 'none',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '-0.3px',
                fontFamily: 'inherit',
                transition: 'background 0.15s, transform 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e5ea'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f2f2f7'; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Join a Room
            </button>
          </div>

          <p style={{ fontSize: 12, color: '#c7c7cc', marginTop: 16, letterSpacing: '-0.1px' }}>
            No account required &middot; Rooms expire after 6 hours
          </p>
        </div>

        {/* RIGHT — feature grid */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {features.map(({ icon, title, desc }) => (
            <div
              key={title}
              style={{
                background: '#f9f9fb',
                borderRadius: 20,
                padding: '24px 22px',
                border: '1px solid #f0f0f5',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {icon}
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', margin: 0, letterSpacing: '-0.2px' }}>{title}</p>
                <p style={{ fontSize: 13, color: '#8e8e93', margin: '5px 0 0', lineHeight: 1.55, letterSpacing: '-0.1px' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #f2f2f7', padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#c7c7cc', letterSpacing: '-0.1px' }}>
          &copy; {new Date().getFullYear()} KantaQueue
        </span>
        <div style={{ display: 'flex', gap: 24 }}>
          {[{ label: 'Help', href: '/help' }, { label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{ fontSize: 13, color: '#8e8e93', textDecoration: 'none', letterSpacing: '-0.1px' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#1c1c1e'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#8e8e93'; }}
            >
              {label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
