'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession, isSupabaseConfigured } from '@/lib/supabase';
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
    if (!isSupabaseConfigured()) {
      toast.error('Supabase is not configured. Add your keys to .env.local and restart the dev server.');
      return;
    }

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
    <div className="landing-page">

      <nav className="landing-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <LogoMark size={32} />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.3px' }}>KanTara</span>
        </div>
        <div className="landing-nav-actions">
          <button
            id="nav-join-btn"
            className="landing-nav-join"
            onClick={() => router.push('/join')}
            style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: 500, color: '#3a3a3c', cursor: 'pointer', padding: '8px 14px', borderRadius: 10, fontFamily: 'inherit', letterSpacing: '-0.1px' }}
          >
            Join a Room
          </button>
          <button
            id="nav-help-btn"
            onClick={() => router.push('/help')}
            style={{ background: '#f2f2f7', border: 'none', borderRadius: 20, padding: '8px 14px', fontSize: 14, fontWeight: 500, color: '#1c1c1e', cursor: 'pointer', letterSpacing: '-0.1px', fontFamily: 'inherit' }}
          >
            Help
          </button>
        </div>
      </nav>

      <main className="landing-main">
        <div className="landing-hero">
          <LogoMark size={56} />

          <h1 className="landing-headline">
            Karaoke,<br />minus the chaos.
          </h1>

          <p className="landing-subhead">
            One screen, every guest&apos;s phone. No passing the phone around. Just sing.
          </p>

          <div className="landing-stats">
            {[
              { n: '<15s', label: 'to queue a song' },
              { n: '0', label: 'app installs needed' },
              { n: '3', label: 'songs per guest cap' },
            ].map(({ n, label }) => (
              <div key={label}>
                <p className="landing-stat-value">{n}</p>
                <p className="landing-stat-label">{label}</p>
              </div>
            ))}
          </div>

          <div className="landing-ctas">
            <button
              id="create-room-btn"
              className="landing-cta-btn landing-cta-primary"
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                  Creating&hellip;
                </>
              ) : 'Start a Room'}
            </button>

            <button
              id="join-room-btn"
              className="landing-cta-btn landing-cta-secondary"
              onClick={() => router.push('/join')}
            >
              Join a Room
            </button>
          </div>

          <p className="landing-note">
            No account required &middot; Rooms expire after 6 hours
          </p>
        </div>

        <div className="landing-features">
          {features.map(({ icon, title, desc }) => (
            <div key={title} className="landing-feature-card">
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

      <footer className="landing-footer">
        <span style={{ fontSize: 13, color: '#c7c7cc', letterSpacing: '-0.1px' }}>
          &copy; {new Date().getFullYear()} KanTara
        </span>
        <div className="landing-footer-links">
          {[{ label: 'Help', href: '/help' }, { label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{ fontSize: 13, color: '#8e8e93', textDecoration: 'none', letterSpacing: '-0.1px' }}
            >
              {label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
