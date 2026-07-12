'use client';

import { use, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession } from '@/lib/supabase';
import { generateUniqueNickname } from '@/lib/nickname';

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.24, background: 'linear-gradient(160deg,#1a1a1a 0%,#2d2d2d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="11" rx="3" fill="white" />
        <path d="M5 10a7 7 0 0 0 14 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <line x1="12" y1="17" x2="12" y2="21" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8" y1="21" x2="16" y2="21" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: initialCode } = use(searchParams);
  const router = useRouter();

  const [code, setCode] = useState(initialCode?.toUpperCase() ?? '');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingNick, setGeneratingNick] = useState(true);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function assignNickname() {
      setGeneratingNick(true);
      try {
        await ensureAnonSession();
        if (!initialCode) {
          setNickname(generateUniqueNickname(new Set()));
          return;
        }
        const supabase = getSupabaseClient();
        const { data: room } = await supabase
          .from('rooms').select('id').eq('code', initialCode.toUpperCase()).eq('status', 'active').maybeSingle();
        if (room) {
          const { data: guests } = await supabase.from('guests').select('display_name').eq('room_id', room.id);
          const taken = new Set((guests ?? []).map((g: { display_name: string }) => g.display_name));
          setNickname(generateUniqueNickname(taken));
        } else {
          setNickname(generateUniqueNickname(new Set()));
        }
      } catch (err) {
        console.error(err);
        setNickname(generateUniqueNickname(new Set()));
      } finally {
        setGeneratingNick(false);
      }
    }
    assignNickname();
  }, [initialCode]);

  async function handleJoin() {
    const trimCode = code.trim().toUpperCase();
    const trimName = nickname.trim();
    if (trimCode.length !== 5) { toast.error('Room codes are 5 characters long.'); return; }
    if (!trimName) { toast.error('Please enter a nickname.'); return; }

    setLoading(true);
    try {
      const userId = await ensureAnonSession();
      if (!userId) { toast.error('Could not start session. Please refresh.'); return; }

      const supabase = getSupabaseClient();
      const { data: room, error: roomErr } = await supabase
        .from('rooms').select('id, status').eq('code', trimCode).eq('status', 'active').maybeSingle();

      if (roomErr || !room) { toast.error('Room not found or has ended.'); return; }

      const { data: existing } = await supabase
        .from('guests').select('id').eq('room_id', room.id).eq('display_name', trimName).maybeSingle();

      if (existing) {
        const newName = generateUniqueNickname(new Set([trimName]));
        toast(`"${trimName}" is taken — you'll be "${newName}" instead.`);
        setNickname(newName);
        return;
      }

      const { data: existingGuest } = await supabase
        .from('guests').select('id').eq('room_id', room.id).eq('auth_uid', userId).maybeSingle();

      if (!existingGuest) {
        const { error: guestErr } = await supabase.from('guests').insert({
          room_id: room.id, auth_uid: userId, display_name: trimName,
        });
        if (guestErr) { toast.error('Failed to join room. Try again.'); console.error(guestErr); return; }
      }

      sessionStorage.setItem(`kq_nickname_${trimCode}`, trimName);
      router.push(`/room/${trimCode}/guest`);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  // Individual character boxes for code input
  const codeChars = code.split('').concat(Array(5 - code.length).fill(''));

  return (
    <div className="join-page" style={{ minHeight: '100svh', background: '#fff', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', overflowX: 'hidden' }}>

      {/* Nav */}
      <nav className="join-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 58, padding: '12px 16px', borderBottom: '1px solid #f2f2f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={28} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.3px' }}>KanTara</span>
        </div>
        <button
          onClick={() => router.push('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f2f2f7', border: 'none', borderRadius: 20, padding: '8px 16px', fontSize: 14, fontWeight: 500, color: '#1c1c1e', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.1px' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e5ea'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#f2f2f7'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Home
        </button>
      </nav>

      {/* Two-column layout */}
      <main className="join-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 26, width: '100%', maxWidth: 900, margin: '0 auto', padding: '24px 16px 32px', boxSizing: 'border-box' }}>

        {/* LEFT — context */}
        <div className="join-copy" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
          <div className="join-hero-logo" style={{ display: 'none' }}><LogoMark size={56} /></div>
          <h1 className="join-title" style={{ margin: 0, color: '#1c1c1e', fontSize: 34, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1.08 }}>
            Join the<br />karaoke room.
          </h1>
          <p className="join-subtitle" style={{ margin: '12px 0 0', color: '#8e8e93', fontSize: 15, lineHeight: 1.55, letterSpacing: '-0.2px' }}>
            Enter the 5-character code shown on the host screen, pick a name, and you&rsquo;re in.
          </p>

          <div className="join-benefits" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
            {[
              'No app install needed',
              'Search and queue songs from your phone',
              'See the live queue in real time',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <polyline points="20 6 9 17 4 12" stroke="#1c1c1e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p style={{ fontSize: 14, color: '#3a3a3c', margin: 0, letterSpacing: '-0.1px' }}>{t}</p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — form */}
        <div className="join-form" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Room code */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Room Code</p>

            {/* 5 character boxes — click anywhere to focus the real input */}
            <div
              className="join-code-boxes"
              style={{ display: 'flex', flexDirection: 'row', gap: 6, position: 'relative', cursor: 'text', width: '100%' }}
              onClick={() => codeInputRef.current?.focus()}
            >
              {codeChars.map((char, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 'clamp(52px, 14vw, 64px)',
                    borderRadius: 12,
                    background: char ? '#1c1c1e' : '#f9f9fb',
                    border: `2px solid ${char ? '#1c1c1e' : '#f0f0f5'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(20px, 6vw, 24px)',
                    fontWeight: 800,
                    color: char ? '#fff' : '#c7c7cc',
                    letterSpacing: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  {char || (i === code.length ? '·' : '')}
                </div>
              ))}
              {/* Hidden real input layered over boxes */}
              <input
                ref={codeInputRef}
                id="room-code"
                type="text"
                maxLength={5}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                autoComplete="off"
                autoFocus={!initialCode}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'text', zIndex: 2 }}
                aria-label="Room code"
              />
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#f2f2f7' }} />

          {/* Nickname */}
          <div>
            <div className="join-name-label">
              <p style={{ fontSize: 11, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Your Name</p>
              <p style={{ fontSize: 12, color: '#c7c7cc', margin: 0, letterSpacing: '-0.1px' }}>auto-assigned, feel free to change</p>
            </div>

            {generatingNick ? (
              <div style={{ height: 52, borderRadius: 14, background: '#f9f9fb', border: '2px solid #f0f0f5', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
                <div style={{ width: 16, height: 16, border: '2px solid #e5e5ea', borderTopColor: '#8e8e93', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: '#8e8e93' }}>Picking a name…</span>
              </div>
            ) : (
              <input
                id="nickname"
                type="text"
                maxLength={32}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="Sunny Mango"
                style={{ width: '100%', height: 52, borderRadius: 14, background: '#f9f9fb', border: '2px solid #f0f0f5', padding: '0 16px', fontSize: 16, fontWeight: 500, color: '#1c1c1e', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', letterSpacing: '-0.2px', transition: 'border-color 0.15s' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#1c1c1e'; e.currentTarget.style.background = '#fff'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#f0f0f5'; e.currentTarget.style.background = '#f9f9fb'; }}
              />
            )}
            <p style={{ fontSize: 12, color: '#c7c7cc', margin: '8px 0 0', letterSpacing: '-0.1px' }}>
              You&rsquo;ll appear in the queue with this name.
            </p>
          </div>

          {/* Join button */}
          <button
            id="join-btn"
            onClick={handleJoin}
            disabled={loading || generatingNick}
            style={{ width: '100%', minHeight: 52, padding: '14px 20px', background: '#1c1c1e', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: (loading || generatingNick) ? 'not-allowed' : 'pointer', letterSpacing: '-0.3px', fontFamily: 'inherit', opacity: (loading || generatingNick) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'opacity 0.15s' }}
            onMouseEnter={(e) => { if (!loading && !generatingNick) e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { if (!loading && !generatingNick) e.currentTarget.style.opacity = '1'; }}
          >
            {loading ? (
              <>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                Joining&hellip;
              </>
            ) : 'Join Room'}
          </button>
        </div>
      </main>
    </div>
  );
}
