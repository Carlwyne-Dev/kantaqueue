'use client';

import { useState, useRef, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession, isSupabaseConfigured } from '@/lib/supabase';
import { generateUniqueRoomCode } from '@/lib/roomCode';
import { QRCodeSVG } from 'qrcode.react';

function GlassPanel({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const dx = x - xc;
    const dy = y - yc;
    ref.current.style.transform = `perspective(1000px) rotateY(${dx / 50}deg) rotateX(${-dy / 50}deg) translateY(-5px)`;
  }

  function handleMouseLeave() {
    if (!ref.current) return;
    ref.current.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(0px)';
  }

  return (
    <div
      ref={ref}
      className={`bg-white/60 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-transform duration-200 ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}

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

      // Background cleanup: try to delete 'ended' rooms to free up codes and save DB space.
      // This will only work if the "anyone can delete ended rooms" RLS policy is applied in Supabase.
      const cleanupOldRooms = async () => {
        try { await supabase.from('rooms').delete().eq('status', 'ended'); } catch (e) { /* ignore */ }
      };
      cleanupOldRooms();

      const code = await generateUniqueRoomCode(async (c) => {
        // Now checks ALL rooms (not just active) to strictly avoid unique constraint errors
        const { data } = await supabase.from('rooms').select('id').eq('code', c).maybeSingle();
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
    <div className="bg-background min-h-screen text-on-background selection:bg-primary-container/30 overflow-x-hidden">
      {/* TopNavBar */}
      {/* Top blur edge — separate from nav, blurs content on scroll */}
      <div
        className="fixed top-0 left-0 right-0 h-20 z-40 pointer-events-none"
        style={{
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
        }}
      />
      {/* Nav — transparent, sits on top of the blur edge */}
      <nav className="fixed top-0 w-full z-50">
        <div className="flex items-center px-[64px] py-3.5 max-md:px-[20px]">
          {/* Logo — left */}
          <div className="flex items-center gap-2.5 w-1/3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.png" alt="KanTara Logo" className="w-8 h-8 rounded-lg" />
            <span className="text-[20px] font-extrabold text-on-background tracking-tighter font-headline-sm">KanTara</span>
          </div>
          {/* Center links */}
          <div className="hidden md:flex items-center justify-center gap-8 w-1/3">
            <a className="text-secondary hover:text-on-background transition-colors text-[13px] font-semibold" href="/help">Help</a>
            <span className="text-secondary/40 cursor-not-allowed text-[13px] font-semibold relative group">
              Rooms
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-inverse-surface text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">Coming soon</span>
            </span>
          </div>
          {/* Join Room CTA — right */}
          <div className="flex justify-end w-1/3">
            <a className="bg-[#A7B79A] text-[#121f0c] px-6 py-2 rounded-full font-bold text-[13px] hover:brightness-95 active:scale-95 transition-all shadow-sm" href="/join">
              Join Room
            </a>
          </div>
        </div>
      </nav>

      <main className="pt-24">
        {/* Hero Section */}
        <section className="relative px-[64px] py-[64px] max-w-[1200px] mx-auto lg:min-h-[750px] flex flex-col lg:flex-row items-center justify-between overflow-visible ambient-gradient max-md:px-[20px]">
          <div className="w-full lg:w-1/2 z-10 space-y-[32px]">
            <h1 className="font-display-lg text-[36px] font-bold tracking-[-0.02em] leading-[1.1] lg:text-[48px] lg:font-bold lg:tracking-[-0.02em] lg:leading-[1.1] leading-[1.1] text-on-surface">
              Karaoke, <br /><span className="text-primary italic font-light">minus the chaos.</span>
            </h1>
            <p className="font-body-lg text-secondary max-w-md leading-relaxed mt-6">
              Create a room, let everyone join with a QR code, build the queue together, and keep the music flowing without passing one phone around.
            </p>
            <div className="pt-8 flex flex-wrap gap-[32px]">
              <button 
                onClick={handleCreateRoom}
                disabled={loading}
                className="bg-[#A7B79A] text-on-primary-container px-8 py-3.5 rounded-full font-bold text-[18px] hover:brightness-95 active:scale-95 transition-all shadow-lg shadow-[#A7B79A]/20"
              >
                {loading ? 'Starting...' : 'Start a Room'}
              </button>
              <button 
                onClick={() => router.push('/join')}
                className="bg-white border border-outline-variant/50 px-8 py-3.5 rounded-full font-bold text-[18px] text-on-surface hover:bg-surface-container-low transition-all shadow-sm"
              >
                Join Room
              </button>
            </div>
          </div>

          {/* Hero Visuals */}
          <div className="w-full lg:w-1/2 relative mt-20 lg:mt-0 h-[500px]">
            {/* Large Album Art */}
            <div className="absolute top-0 right-0 w-[340px] h-[340px] rounded-3xl overflow-hidden shadow-2xl rotate-3 z-0 ring-8 ring-white/50 max-md:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="w-full h-full object-cover" src="/assets/landing.png" alt="Karaoke Night" />
            </div>
            
            {/* Queue Card 1 — Now Playing */}
            <GlassPanel className="absolute top-12 left-0 p-4 rounded-3xl w-[300px] -rotate-2 z-20 flex items-center gap-4 max-md:relative max-md:top-0 max-md:left-0 max-md:w-full max-md:mb-4">
              <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #A7B79A 0%, #6e8b5e 100%)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="6" cy="18" r="3" fill="white"/>
                  <circle cx="18" cy="16" r="3" fill="white"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface text-[14px] tracking-[0.01em] leading-[1.2] truncate">Paraluman</p>
                <p className="text-secondary text-[12px] font-bold tracking-[0.05em] leading-[1.1]">Adie</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[18px]">play_arrow</span>
              </div>
            </GlassPanel>

            {/* QR Join Mockup */}
            <GlassPanel className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 rounded-[32px] w-[200px] shadow-2xl z-30 ring-1 ring-white/80 max-md:relative max-md:top-0 max-md:translate-x-0 max-md:translate-y-0 max-md:left-0 max-md:w-full max-md:mb-4 max-md:flex max-md:items-center max-md:gap-4 max-md:p-4">
              <div className="bg-white p-3 rounded-2xl aspect-square flex items-center justify-center shadow-inner overflow-hidden max-md:w-16 max-md:h-16 max-md:p-2">
                <QRCodeSVG value="https://kantaraph.vercel.app/" size={130} style={{ width: '100%', height: '100%', borderRadius: '8px' }} />
              </div>
              <p className="text-center mt-4 font-bold text-secondary text-[10px] tracking-[0.1em] uppercase max-md:mt-0">SCAN TO JOIN</p>
            </GlassPanel>

            {/* Queue Card 2 — Up Next */}
            <GlassPanel className="absolute bottom-12 right-6 p-4 rounded-3xl w-[260px] rotate-1 z-10 flex items-center gap-4 max-md:relative max-md:bottom-0 max-md:right-0 max-md:w-full">
              <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c9b99a 0%, #9c7b52 100%)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="6" cy="18" r="3" fill="white"/>
                  <circle cx="18" cy="16" r="3" fill="white"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface text-[12px] tracking-[0.05em] leading-[1.1] truncate">Hawak Kamay</p>
                <p className="text-secondary text-[11px] font-bold tracking-[0.05em] leading-[1.1] truncate">Yeng Constantino</p>
              </div>
              <span className="material-symbols-outlined text-secondary/30 text-[20px]">more_horiz</span>
            </GlassPanel>
          </div>
        </section>
        {/* How it works */}
        <section className="py-[64px] px-[64px] max-w-[1200px] mx-auto text-center max-md:px-[20px]">
          <div className="max-w-xl mx-auto mb-16">
            <h2 className="text-[32px] font-semibold leading-[1.2] text-on-surface mb-4">No apps. No passwords.<br />Just scan and sing.</h2>
            <p className="text-[16px] font-normal leading-[1.5] text-secondary">
              Project the QR code on the TV. Guests scan once and they&apos;re in — no sign-up, no friction.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: 'qr_code_scanner', step: '1', title: 'Scan', desc: 'Use any smartphone camera. No app download required.' },
              { icon: 'search', step: '2', title: 'Search', desc: 'Find your song. Results load instantly from cache.' },
              { icon: 'playlist_add_check', step: '3', title: 'Queue', desc: 'Add it — your song appears on the shared screen.' },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} className="p-10 rounded-[32px] bg-white border border-outline-variant/10 hover:shadow-xl hover:-translate-y-1 transition-all group">
                <div className="w-14 h-14 rounded-[20px] bg-surface-container-low flex items-center justify-center mx-auto mb-6 group-hover:bg-[#A7B79A]/20 transition-colors">
                  <span className="material-symbols-outlined text-secondary group-hover:text-[#54634a] text-3xl transition-colors">{icon}</span>
                </div>
                <h3 className="text-[20px] font-semibold text-on-surface mb-3">{title}</h3>
                <p className="text-[15px] text-secondary leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-lowest py-20 border-t border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-[64px] max-w-[1200px] mx-auto gap-12 max-md:px-[20px]">
          <div className="flex flex-col items-center md:items-start">
            <div className="text-[18px] font-extrabold text-on-background tracking-tighter mb-3 font-headline-sm">KANTARA</div>
            <p className="text-secondary text-[12px] font-bold tracking-[0.05em] leading-[1.1]">© {new Date().getFullYear()} Kantara Karaoke. All rights reserved.</p>
          </div>
          <div className="flex gap-12">
            <a className="text-secondary hover:text-on-background transition-colors text-[14px] font-semibold tracking-[0.01em] leading-[1.2] font-medium" href="/terms">Terms</a>
            <a className="text-secondary hover:text-on-background transition-colors text-[14px] font-semibold tracking-[0.01em] leading-[1.2] font-medium" href="/privacy">Privacy</a>
            <a className="text-secondary hover:text-on-background transition-colors text-[14px] font-semibold tracking-[0.01em] leading-[1.2] font-medium" href="/help">Help</a>
          </div>

        </div>
      </footer>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] z-50">
        <div className="glass-panel rounded-full px-8 py-5 flex justify-around items-center border border-white/60 shadow-2xl">
          <a className="flex flex-col items-center text-primary" href="/">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
          </a>
          <a className="flex flex-col items-center text-secondary/70" href="/join">
            <span className="material-symbols-outlined">queue_music</span>
          </a>
          <button onClick={handleCreateRoom} className="bg-primary text-on-primary p-4 rounded-full -mt-16 shadow-xl active:scale-90 transition-transform">
            <span className="material-symbols-outlined text-3xl">add</span>
          </button>
          <a className="flex flex-col items-center text-secondary/70" href="/join">
            <span className="material-symbols-outlined">search</span>
          </a>
          <a className="flex flex-col items-center text-secondary/70" href="/help">
            <span className="material-symbols-outlined">person</span>
          </a>
        </div>
      </div>

    </div>
  );
}
