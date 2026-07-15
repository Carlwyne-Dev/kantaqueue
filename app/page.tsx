'use client';

import { useState, useRef, MouseEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession, isSupabaseConfigured } from '@/lib/supabase';
import { generateUniqueRoomCode } from '@/lib/roomCode';
import { QRCodeSVG } from 'qrcode.react';
import {
  motion, AnimatePresence, useScroll, useTransform,
  useSpring, useInView,
} from 'framer-motion';

// ── Rolling Number ────────────────────────────────────────────────────────────
function RollingNumber({ value }: { value: number }) {
  return (
    <div className="relative inline-flex overflow-hidden justify-center items-center h-[1.2em]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '100%', opacity: 0, position: 'absolute' }}
          animate={{ y: '0%', opacity: 1, position: 'static' }}
          exit={{ y: '-100%', opacity: 0, position: 'absolute' }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          {value.toLocaleString()}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ── Fade-up on scroll ─────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ── Glass panel with 3D tilt ──────────────────────────────────────────────────
function GlassPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    ref.current.style.transform =
      `perspective(1000px) rotateY(${dx / 50}deg) rotateX(${-dy / 50}deg) translateY(-5px)`;
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ rooms: 0, songs: 0 });

  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, -60]);
  const heroOpacity = useTransform(scrollY, [0, 350], [1, 0]);
  const heroSpringY = useSpring(heroY, { stiffness: 80, damping: 20 });

  useEffect(() => {
    let mounted = true;
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => {
        if (mounted && data && typeof data.rooms === 'number') setStats(data);
      })
      .catch(console.error);

    const supabase = getSupabaseClient();
    const statsChannel = supabase.channel('landing-stats-channel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_stats', filter: 'id=eq.1' }, (payload) => {
        if (mounted && payload.new) setStats({ rooms: payload.new.total_rooms_created, songs: payload.new.total_songs_queued });
      }).subscribe();

    return () => { mounted = false; supabase.removeChannel(statsChannel); };
  }, []);

  async function handleCreateRoom() {
    if (!isSupabaseConfigured()) { toast.error('Supabase is not configured.'); return; }
    setLoading(true);
    try {
      const userId = await ensureAnonSession();
      if (!userId) { toast.error('Could not start session. Please refresh.'); return; }
      const supabase = getSupabaseClient();
      supabase.from('rooms').delete().eq('status', 'ended').then(() => {});
      const code = await generateUniqueRoomCode(async (c) => {
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

  const stepsData = [
    { icon: 'qr_code_scanner', step: '01', title: 'Scan', desc: 'Use any smartphone camera. No app download required.' },
    { icon: 'search', step: '02', title: 'Search', desc: 'Find your song. Results load instantly from your library.' },
    { icon: 'playlist_add_check', step: '03', title: 'Queue', desc: 'Add it — your song appears on the shared screen live.' },
  ];

  return (
    <div className="bg-background min-h-screen text-on-background selection:bg-primary-container/30 overflow-x-hidden">

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 h-20 z-40 pointer-events-none"
        style={{
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
        }}
      />
      <motion.nav
        className="fixed top-0 w-full z-50"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between px-[64px] py-3.5 max-md:px-[20px]">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.png" alt="KanTara Logo" className="w-8 h-8 rounded-lg" />
            <span className="text-[20px] font-extrabold text-on-background tracking-tighter font-headline-sm">KanTara</span>
          </div>
          <div className="hidden md:flex items-center justify-center gap-8">
            <motion.a whileHover={{ y: -1 }} className="text-secondary hover:text-on-background transition-colors text-[13px] font-semibold" href="/help">Help</motion.a>
            <span className="text-secondary/40 cursor-not-allowed text-[13px] font-semibold relative group">
              Rooms
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-inverse-surface text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">Coming soon</span>
            </span>
          </div>
          <div className="flex justify-end">
            <motion.a
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="bg-[#A7B79A] text-[#121f0c] px-6 py-2 rounded-full font-bold text-[13px] shadow-sm" href="/join"
            >
              Join Room
            </motion.a>
          </div>
        </div>
      </motion.nav>

      <main className="pt-24">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative px-[64px] py-[64px] max-w-[1200px] mx-auto lg:min-h-[750px] flex flex-col lg:flex-row items-center justify-between overflow-visible ambient-gradient max-md:px-[20px]">
          <motion.div
            className="w-full lg:w-1/2 z-10 space-y-[32px]"
            style={{ y: heroSpringY, opacity: heroOpacity }}
          >
            {/* Headline stagger */}
            <motion.h1
              className="font-display-lg text-[36px] font-bold tracking-[-0.02em] leading-[1.1] lg:text-[48px] text-on-surface"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              Karaoke, <br />
              <motion.span
                className="text-primary italic font-light"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
                minus the chaos.
              </motion.span>
            </motion.h1>

            <motion.p
              className="font-body-lg text-secondary max-w-md leading-relaxed"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              Create a room, let everyone join with a QR code, build the queue together, and keep the music flowing without passing one phone around.
            </motion.p>

            <motion.div
              className="flex flex-col md:flex-row items-stretch md:items-start gap-4 md:gap-[32px]"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.button
                onClick={handleCreateRoom}
                disabled={loading}
                whileHover={{ scale: 1.04, boxShadow: '0 12px 32px rgba(167,183,154,0.5)' }}
                whileTap={{ scale: 0.97 }}
                className="bg-[#A7B79A] text-on-primary-container px-8 py-3.5 rounded-full font-bold text-[18px] shadow-lg shadow-[#A7B79A]/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#121f0c]/30 border-t-[#121f0c] rounded-full animate-spin" />
                    Starting...
                  </span>
                ) : 'Start a Room'}
              </motion.button>
              <motion.button
                onClick={() => router.push('/join')}
                whileHover={{ scale: 1.04, backgroundColor: '#f0eeea' }}
                whileTap={{ scale: 0.97 }}
                className="bg-white border border-outline-variant/50 px-8 py-3.5 rounded-full font-bold text-[18px] text-on-surface shadow-sm text-center"
              >
                Join Room
              </motion.button>
            </motion.div>
          </motion.div>

          {/* ── Hero Visuals ─────────────────────────────────────────────── */}
          <div className="hidden md:block w-full lg:w-1/2 relative mt-20 lg:mt-0 h-[500px]">
            {/* Album art */}
            <motion.div
              className="absolute top-0 right-0 w-[340px] h-[340px] rounded-3xl overflow-hidden shadow-2xl z-0 ring-8 ring-white/50"
              initial={{ opacity: 0, scale: 0.92, rotate: 1 }}
              animate={{ opacity: 1, scale: 1, rotate: 3 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ rotate: 3 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="w-full h-full object-cover" src="/assets/landing.png" alt="Karaoke Night" />
            </motion.div>

            {/* Card 1 — Now Playing */}
            <motion.div
              className="absolute top-12 left-0 z-20"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ y: useSpring(useTransform(scrollY, [0, 500], [0, -20]), { stiffness: 60, damping: 18 }) }}
            >
              <GlassPanel className="p-4 rounded-3xl w-[300px] -rotate-2 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #A7B79A 0%, #6e8b5e 100%)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="18" r="3" fill="white" />
                    <circle cx="18" cy="16" r="3" fill="white" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-on-surface text-[14px] truncate">Paraluman</p>
                  <p className="text-secondary text-[12px] font-bold">Adie</p>
                </div>
                <motion.div
                  className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span className="material-symbols-outlined text-primary text-[18px]">play_arrow</span>
                </motion.div>
              </GlassPanel>
            </motion.div>

            {/* Card 2 — QR */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassPanel className="p-6 rounded-[32px] w-[200px] shadow-2xl ring-1 ring-white/80">
                <div className="bg-white p-3 rounded-2xl aspect-square flex items-center justify-center shadow-inner overflow-hidden">
                  <QRCodeSVG value="https://kantaraph.vercel.app/" size={130} style={{ width: '100%', height: '100%', borderRadius: '8px' }} />
                </div>
                <p className="text-center mt-4 font-bold text-secondary text-[10px] tracking-[0.1em] uppercase">SCAN TO JOIN</p>
              </GlassPanel>
            </motion.div>

            {/* Card 3 — Up next */}
            <motion.div
              className="absolute bottom-12 right-6 z-10"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
              style={{ y: useSpring(useTransform(scrollY, [0, 500], [0, 20]), { stiffness: 60, damping: 18 }) }}
            >
              <GlassPanel className="p-4 rounded-3xl w-[260px] rotate-1 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c9b99a 0%, #9c7b52 100%)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="18" r="3" fill="white" />
                    <circle cx="18" cy="16" r="3" fill="white" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-on-surface text-[12px] truncate">Hawak Kamay</p>
                  <p className="text-secondary text-[11px] font-bold truncate">Yeng Constantino</p>
                </div>
                <span className="material-symbols-outlined text-secondary/30 text-[20px]">more_horiz</span>
              </GlassPanel>
            </motion.div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="py-[64px] px-[64px] max-w-[1200px] mx-auto text-center max-md:px-[20px]">
          <FadeUp>
            <h2 className="text-[32px] font-semibold leading-[1.2] text-on-surface mb-4">
              No apps. No passwords.<br />Just scan and sing.
            </h2>
            <p className="text-[16px] font-normal leading-[1.5] text-secondary max-w-md mx-auto">
              Project the QR code on the TV. Guests scan once and they&apos;re in — no sign-up, no friction.
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-3 gap-8 mt-16">
            {stepsData.map(({ icon, step, title, desc }, i) => (
              <FadeUp key={step} delay={i * 0.12}>
                <motion.div
                  className="p-10 rounded-[32px] bg-white border border-outline-variant/10 shadow-sm cursor-default h-full"
                  whileHover={{ y: -8, boxShadow: '0 24px 48px rgba(0,0,0,0.08)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <motion.div
                    className="w-14 h-14 rounded-[20px] bg-surface-container-low flex items-center justify-center mx-auto mb-6"
                    whileHover={{ backgroundColor: 'rgba(167,183,154,0.2)', scale: 1.08 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <span className="material-symbols-outlined text-secondary text-3xl">{icon}</span>
                  </motion.div>
                  <p className="text-[11px] font-bold tracking-[0.15em] text-primary/60 uppercase mb-2">{step}</p>
                  <h3 className="text-[20px] font-semibold text-on-surface mb-3">{title}</h3>
                  <p className="text-[15px] text-secondary leading-relaxed">{desc}</p>
                </motion.div>
              </FadeUp>
            ))}
          </div>
        </section>

        {/* ── Engagement Metrics ───────────────────────────────────────────── */}
        <section className="py-[64px] px-[64px] max-w-[1200px] mx-auto max-md:px-[20px] max-md:py-[40px]">
          <FadeUp>
            <div className="bg-[#A7B79A] rounded-[40px] p-12 md:p-16 text-on-primary-container shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-around gap-12 border border-[#bbccae]/30">
              <div className="absolute top-[-50%] left-[-10%] w-[300px] h-[300px] bg-white/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-[-50%] right-[-10%] w-[300px] h-[300px] bg-[#54634a]/10 rounded-full blur-3xl pointer-events-none" />
              <motion.div
                className="relative z-10 space-y-2 flex flex-col items-center"
                whileHover={{ scale: 1.04 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <h3 className="text-[48px] md:text-[64px] font-black tracking-tighter leading-none flex">
                  <RollingNumber value={stats.rooms} />
                </h3>
                <p className="text-[16px] md:text-[18px] font-bold text-on-primary-container/80 tracking-widest uppercase mt-2">Rooms Created</p>
              </motion.div>
              <div className="hidden md:block w-px h-24 bg-white/20 relative z-10" />
              <div className="md:hidden w-24 h-px bg-white/20 relative z-10" />
              <motion.div
                className="relative z-10 space-y-2 flex flex-col items-center"
                whileHover={{ scale: 1.04 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <h3 className="text-[48px] md:text-[64px] font-black tracking-tighter leading-none flex">
                  <RollingNumber value={stats.songs} />
                </h3>
                <p className="text-[16px] md:text-[18px] font-bold text-on-primary-container/80 tracking-widest uppercase mt-2">Songs Queued</p>
              </motion.div>
            </div>
          </FadeUp>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-surface-container-lowest py-20 border-t border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-[64px] max-w-[1200px] mx-auto gap-12 max-md:px-[20px]">
          <div className="flex flex-col items-center md:items-start">
            <div className="text-[18px] font-extrabold text-on-background tracking-tighter mb-3 font-headline-sm">KANTARA</div>
            <p className="text-secondary text-[12px] font-bold tracking-[0.05em]">© {new Date().getFullYear()} Kantara Karaoke. All rights reserved.</p>
          </div>
          <div className="flex gap-12">
            {[['Terms', '/terms'], ['Privacy', '/privacy'], ['Help', '/help']].map(([label, href]) => (
              <motion.a
                key={label}
                href={href}
                whileHover={{ y: -2, color: 'var(--color-on-background)' }}
                className="text-secondary text-[14px] font-semibold"
              >
                {label}
              </motion.a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
