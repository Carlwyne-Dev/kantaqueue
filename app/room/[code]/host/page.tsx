'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Room, QueueItem, Song } from '@/types';

// ── YouTube IFrame API types ──────────────────────────────────────────────────
declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement | string,
        opts: object
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  getPlayerState(): number;
  destroy(): void;
}

interface LockableScreenOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
}

// ── Helper ────────────────────────────────────────────────────────────────────
function formatDuration(secs: number | null): string {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getJoinUrl(code: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/join?code=${code}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HostPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [room, setRoom] = useState<Room | null>(null);
  const [queue, setQueue] = useState<(QueueItem & { song: Song })[]>([]);
  const [nowPlaying, setNowPlaying] = useState<(QueueItem & { song: Song }) | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [partyStarted, setPartyStarted] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [localNotif, setLocalNotif] = useState<string | null>(null);
  const [showQuitModal, setShowQuitModal] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const advancingRef = useRef(false); // prevent double-advance
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLocalNotif = useCallback((msg: string) => {
    setLocalNotif(msg);
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    notifTimeoutRef.current = setTimeout(() => setLocalNotif(null), 2000);
  }, []);

  // ── Wake Lock (PRD §11a) ────────────────────────────────────────────────────
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch { /* not critical */ }
  }

  // ── Load room ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadRoom() {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (error || !data) {
        toast.error('Room not found.');
        router.push('/');
        return;
      }
      setRoom(data);
      setLoadingRoom(false);
    }
    loadRoom();
  }, [code]);

  // ── Load queue ────────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    if (!room) return;
    const { data } = await supabase
      .from('queue_items')
      .select('*, song:songs(*)')
      .eq('room_id', room.id)
      .in('status', ['queued', 'playing'])
      .order('position', { ascending: true, nullsFirst: false })
      .order('requested_at', { ascending: true });

    const items = (data ?? []) as (QueueItem & { song: Song })[];
    const playing = items.find((i) => i.status === 'playing') ?? null;
    const queued = items.filter((i) => i.status === 'queued');

    setNowPlaying(playing);
    setQueue(queued);
  }, [room]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // ── Realtime subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`host-room-${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${room.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            showLocalNotif(`${payload.new.singer_name} added a song`);
          }
          fetchQueue();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guests', filter: `room_id=eq.${room.id}` },
        (payload) => {
          showLocalNotif(`${(payload.new as { display_name: string }).display_name} joined`);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room, fetchQueue]);

  // ── YouTube IFrame API ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!partyStarted) return;

    if (window.YT?.Player) {
      initPlayer();
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
  }, [partyStarted]);

  function initPlayer() {
    if (!playerContainerRef.current || playerRef.current) return;

    playerRef.current = new window.YT.Player(playerContainerRef.current, {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onStateChange: handlePlayerStateChange,
        onError: handlePlayerError,
      },
    });
  }

  // ── Auto-play next song ──────────────────────────────────────────────────────
  async function advanceQueue() {
    if (advancingRef.current || !room) return;
    advancingRef.current = true;

    try {
      // Mark current song as played
      if (nowPlaying) {
        await supabase
          .from('queue_items')
          .update({ status: 'played' })
          .eq('id', nowPlaying.id);

        // Bump times_played on the song (PRD §9a)
        await supabase
          .from('songs')
          .update({ times_played: nowPlaying.song.times_played + 1, last_played_at: new Date().toISOString() })
          .eq('id', nowPlaying.song.id);
      }

      // Get next queued item
      const { data: nextItems } = await supabase
        .from('queue_items')
        .select('*, song:songs(*)')
        .eq('room_id', room.id)
        .eq('status', 'queued')
        .order('position', { ascending: true, nullsFirst: false })
        .order('requested_at', { ascending: true })
        .limit(1);

      const next = nextItems?.[0] as (QueueItem & { song: Song }) | undefined;

      if (next) {
        await supabase
          .from('queue_items')
          .update({ status: 'playing' })
          .eq('id', next.id);

        playerRef.current?.loadVideoById(next.song.youtube_video_id);
      } else {
        playerRef.current?.stopVideo();
      }
    } finally {
      advancingRef.current = false;
    }
  }

  function handlePlayerStateChange(event: { data: number }) {
    if (event.data === window.YT.PlayerState.ENDED) {
      advanceQueue();
    }
  }

  // PRD §9a: unavailable video — auto-skip with toast
  async function handlePlayerError(event: { data: number }) {
    if ([100, 101, 150].includes(event.data)) {
      toast.error('Skipping — video unavailable', { duration: 3000 });
      
      // Smart detector: Mark the song as broken so it won't show up in search again
      if (nowPlaying) {
        await supabase
          .from('songs')
          .update({ times_played: -1 })
          .eq('id', nowPlaying.song.id);
      }
      
      advanceQueue();
    }
  }

  // Auto-play when idle and queue receives a song
  useEffect(() => {
    if (partyStarted && !nowPlaying && queue.length > 0) {
      const t = setTimeout(() => {
        if (!nowPlaying && queue.length > 0 && !advancingRef.current) {
          advanceQueue();
        }
      }, 500);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyStarted, nowPlaying, queue.length]);

  // ── Start party (unlocks audio on mobile) ────────────────────────────────────
  async function handleStartParty() {
    setPartyStarted(true);
    await requestWakeLock();

    setTimeout(() => {
      if (nowPlaying) {
        playerRef.current?.loadVideoById(nowPlaying.song.youtube_video_id);
      } else if (queue[0]) {
        // Auto-promote first queued item to playing
        supabase
          .from('queue_items')
          .update({ status: 'playing' })
          .eq('id', queue[0].id)
          .then(() => {
            playerRef.current?.loadVideoById(queue[0].song.youtube_video_id);
          });
      }
    }, 1200);

    setSessionStarted(true);
  }

  // ── Host controls ────────────────────────────────────────────────────────────
  async function handleSkip() {
    if (!nowPlaying) return;
    toast('Skipping…', { duration: 1500 });
    await supabase
      .from('queue_items')
      .update({ status: 'skipped' })
      .eq('id', nowPlaying.id);
    await advanceQueue();
  }

  async function handleRemove(itemId: string) {
    await supabase
      .from('queue_items')
      .update({ status: 'removed' })
      .eq('id', itemId);
    toast('Removed from queue');
    fetchQueue();
  }

  async function handlePauseRoom() {
    if (!room) return;
    const newStatus = room.status === 'paused' ? 'active' : 'paused';
    await supabase.from('rooms').update({ status: newStatus }).eq('id', room.id);
    setRoom((r) => r ? { ...r, status: newStatus } : r);
    if (newStatus === 'paused') {
      playerRef.current?.pauseVideo();
      toast('Queue paused');
    } else {
      playerRef.current?.playVideo();
      toast('Queue resumed');
    }
  }

  async function handleEnterPresentationMode() {
    setIsFullscreen(true);

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Some mobile browsers only allow the in-app fullscreen layout.
    }

    try {
      await (screen.orientation as LockableScreenOrientation | undefined)?.lock?.('landscape');
    } catch {
      // iOS Safari and some browsers do not allow programmatic rotation.
    }
  }

  async function handleExitPresentationMode() {
    setIsFullscreen(false);

    try {
      (screen.orientation as LockableScreenOrientation | undefined)?.unlock?.();
    } catch {
      // Not supported everywhere.
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // The browser may have already exited fullscreen.
    }
  }

  useEffect(() => {
    function syncFullscreenState() {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    }

    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  async function handleQuitRoom() {
    playerRef.current?.stopVideo();
    if (room) {
      await supabase.from('rooms').update({ status: 'ended' }).eq('id', room.id);
    }
    router.push('/');
  }

  // ── Render: loading ──────────────────────────────────────────────────────────
  if (loadingRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (!room) return null;

  const joinUrl = getJoinUrl(code);

  // ── Render: Room Setup (before party starts) ─────────────────────────────────
  if (!partyStarted) {
    return (
      <div className="host-setup-page">

        {/* Nav */}
        <nav className="host-setup-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(160deg,#1a1a1a 0%,#2d2d2d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="11" rx="3" fill="white" />
                <path d="M5 10a7 7 0 0 0 14 0" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
                <line x1="12" y1="17" x2="12" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="21" x2="16" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.3px' }}>KantaQueue</span>
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
        <main className="host-setup-main">

          {/* LEFT — info + CTA */}
          <div className="host-setup-copy">
            <span className="host-setup-badge">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              Room Active
            </span>

            <h1 className="host-setup-title">
              Room ready.<br />Share &amp; start.
            </h1>

            <p className="host-setup-subtitle">
              Share the QR code or room code with your guests. They join from their own phone — no app install needed.
            </p>

            {/* Steps */}
            <div className="host-setup-steps">
              {[
                { n: '1', label: 'Guests scan the QR code or type the room code' },
                { n: '2', label: 'They search and queue songs from their phone' },
                { n: '3', label: 'Hit Start — songs play automatically on this screen' },
              ].map(({ n, label }) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1c1e' }}>{n}</span>
                  </div>
                  <p style={{ fontSize: 14, color: '#3a3a3c', margin: 0, letterSpacing: '-0.1px', lineHeight: 1.5 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Battery hint — PRD §11a */}
            <div className="host-setup-hint">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="7" width="16" height="10" rx="2" stroke="#8e8e93" strokeWidth="1.6" />
                <path d="M18 10.5v3" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" />
                <rect x="4" y="9" width="8" height="6" rx="1" fill="#22c55e" />
                <line x1="20" y1="10" x2="20" y2="14" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p style={{ fontSize: 13, color: '#8e8e93', margin: 0, letterSpacing: '-0.1px' }}>
                Keep this device plugged in for long sessions.
              </p>
            </div>

            {/* CTA */}
            <button
              id="start-party-btn"
              onClick={handleStartParty}
              className="host-setup-start"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Start Party
            </button>
          </div>

          {/* RIGHT — QR code card */}
          <div className="host-setup-qr-wrap">
            <div className="host-setup-qr-card">

              {/* QR */}
              <div className="host-setup-qr-box">
                {joinUrl && (
                  <QRCodeSVG
                    value={joinUrl}
                    size={180}
                    id="room-qr-code"
                    className="host-setup-qr"
                  />
                )}
              </div>

              {/* Room code */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>Room Code</p>
                <p
                  id="room-code-display"
                  className="host-setup-code"
                >
                  {code}
                </p>
              </div>

              {/* Scan hint */}
              <p style={{ fontSize: 13, color: '#c7c7cc', margin: 0, textAlign: 'center', letterSpacing: '-0.1px' }}>
                Point a phone camera at the QR code to join
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Render: Active Session ───────────────────────────────────────────────────
  return (
    <div
      style={{
        height: '100svh',
        background: isFullscreen ? '#000' : '#f2f2f7',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
        overflow: 'hidden',
      }}
    >

      {/* ── Main layout: padded, rounded cards ─────────────────────────────────── */}
      <div className="host-session-layout" style={{ flex: 1, display: 'flex', gap: 12, padding: isFullscreen ? 0 : 12, overflow: 'hidden', position: 'relative' }}>

        {/* ── Video player card ─────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            borderRadius: isFullscreen ? 0 : 20,
            overflow: 'hidden',
            background: '#000',
            position: 'relative',
            boxShadow: isFullscreen ? 'none' : '0 8px 40px rgba(0,0,0,0.18)',
          }}
        >
          <div ref={playerContainerRef} style={{ width: '100%', height: '100%' }} id="yt-player" />

          {/* Idle state — PRD §11c */}
          {!nowPlaying && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #141414 0%, #1e1e1e 100%)', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="6" cy="18" r="3" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" />
                  <circle cx="18" cy="16" r="3" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" />
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.3px' }}>Waiting for the next song</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: '6px 0 0', letterSpacing: '-0.1px' }}>Ask guests to add songs from their phone</p>
              </div>
              <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 24px', textAlign: 'center', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px', fontWeight: 600 }}>Room Code</p>
                <p style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '0.1em', margin: 0 }}>{code}</p>
              </div>
            </div>
          )}

          {/* Fullscreen QR pill — PRD §11c */}
          {isFullscreen && joinUrl && (
            <div style={{ position: 'absolute', bottom: 28, right: 28, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)', borderRadius: 999, padding: '10px 20px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <QRCodeSVG value={joinUrl} size={36} />
              <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '0.1em' }}>{code}</span>
            </div>
          )}

          {/* Fullscreen controls — top-right, icon-only — PRD §11c */}
          {isFullscreen && (
            <div style={{ position: 'absolute', top: 28, right: 28, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', borderRadius: 999, padding: '10px 16px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {/* Skip */}
              <button
                id="host-skip-btn-fs"
                onClick={handleSkip}
                title="Skip"
                style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M5 4l10 8-10 8V4z" fill="white"/>
                  <rect x="19" y="4" width="2" height="16" rx="1" fill="white"/>
                </svg>
              </button>

              {/* Divider */}
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

              {/* Exit fullscreen */}
              <button
                id="host-exit-fs-btn"
                onClick={handleExitPresentationMode}
                title="Exit fullscreen"
                style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )}

          {/* Fullscreen local notification */}
          {isFullscreen && localNotif && (
            <div style={{ position: 'absolute', top: 84, right: 28, zIndex: 20, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', borderRadius: 999, padding: '10px 16px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '-0.1px', animation: 'fadeIn 0.2s ease-out' }}>
              {localNotif}
            </div>
          )}
        </div>

        {/* ── Sidebar panel ─────────────────────────────────────────────────── */}
        {!isFullscreen && (
          <aside className="host-session-sidebar" style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

            {/* Now Playing card */}
            <div style={{ background: '#fff', borderRadius: 18, padding: '16px 18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', flexShrink: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Now Playing</p>
              {nowPlaying ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {nowPlaying.song.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={nowPlaying.song.thumbnail_url} alt={nowPlaying.song.title}
                      style={{ width: 48, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nowPlaying.song.title}</p>
                    <p style={{ fontSize: 12, color: '#8e8e93', margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nowPlaying.singer_name}</p>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#8e8e93', margin: 0 }}>Nothing playing yet</p>
              )}
            </div>

            {/* Queue card */}
            <div style={{ background: '#fff', borderRadius: 18, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f2f2f7' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Up Next {queue.length > 0 && `· ${queue.length}`}
                </p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {queue.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, padding: '24px 16px', textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M9 18V5l12-2v13" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="6" cy="18" r="3" stroke="#c7c7cc" strokeWidth="1.8" />
                        <circle cx="18" cy="16" r="3" stroke="#c7c7cc" strokeWidth="1.8" />
                      </svg>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93', margin: 0 }}>Queue is empty</p>
                  </div>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {queue.map((item, idx) => (
                      <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f9f9fb' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#c7c7cc', width: 18, textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
                        {item.song.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.song.thumbnail_url} alt={item.song.title}
                            style={{ width: 40, height: 30, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#1c1c1e', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.song.title}</p>
                          <p style={{ fontSize: 11, color: '#8e8e93', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.singer_name}{item.song.duration_seconds ? ` · ${formatDuration(item.song.duration_seconds)}` : ''}
                          </p>
                        </div>
                        <button
                          id={`remove-queue-${item.id}`}
                          onClick={() => handleRemove(item.id)}
                          aria-label="Remove"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#fff0f0'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Controls + QR card */}
            <div style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
              {/* QR + code — PRD §11c */}
              {joinUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f9f9fb', borderRadius: 12, padding: '10px 12px' }}>
                  <QRCodeSVG value={joinUrl} size={44} style={{ borderRadius: 6, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 11, color: '#8e8e93', margin: '0 0 3px', letterSpacing: '-0.1px' }}>Scan to join</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: '#1c1c1e', margin: 0, letterSpacing: '0.08em' }}>{code}</p>
                  </div>
                </div>
              )}

              {/* Control buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                {[
                  { id: 'host-skip-btn', label: 'Skip', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 4l10 8-10 8V4z" fill="#1c1c1e"/><rect x="19" y="4" width="2" height="16" rx="1" fill="#1c1c1e"/></svg>, onClick: handleSkip, disabled: !nowPlaying, danger: false },
                  { id: 'host-pause-btn', label: room.status === 'paused' ? 'Resume' : 'Pause', icon: room.status === 'paused' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="#1c1c1e"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" rx="1" fill="#1c1c1e"/><rect x="14" y="4" width="4" height="16" rx="1" fill="#1c1c1e"/></svg>, onClick: handlePauseRoom, disabled: false, danger: false },
                  { id: 'host-fullscreen-btn', label: 'Full', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round"/></svg>, onClick: handleEnterPresentationMode, disabled: false, danger: false },
                  { id: 'host-quit-btn', label: 'Quit', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="16 17 21 12 16 7" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="21" y1="12" x2="9" y2="12" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round"/></svg>, onClick: () => setShowQuitModal(true), disabled: false, danger: true },
                ].map(({ id, label, icon, onClick, disabled, danger }) => (
                  <button
                    key={id}
                    id={id}
                    onClick={onClick}
                    disabled={disabled}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: danger ? '#fff2f2' : '#f2f2f7', border: 'none', borderRadius: 12, padding: '10px 8px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1, fontFamily: 'inherit', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? '#ffe5e5' : '#e5e5ea'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = danger ? '#fff2f2' : '#f2f2f7'; }}
                  >
                    {icon}
                    <span style={{ fontSize: 11, fontWeight: 600, color: danger ? '#ff3b30' : '#1c1c1e', letterSpacing: '-0.1px' }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── Quit Modal ─────────────────────────────────────────────────────── */}
      {showQuitModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 24, padding: '24px 24px 20px', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff2f2', color: '#ff3b30', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#1c1c1e', margin: '0 0 8px', letterSpacing: '-0.3px' }}>End this room?</p>
            <p style={{ fontSize: 14, color: '#8e8e93', margin: '0 0 24px', lineHeight: 1.4, letterSpacing: '-0.1px' }}>All guests will be disconnected and the queue will be closed.</p>
            
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowQuitModal(false)}
                style={{ flex: 1, padding: '12px 0', background: '#f2f2f7', color: '#1c1c1e', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e5ea'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f2f2f7'; }}
              >
                Cancel
              </button>
              <button
                onClick={handleQuitRoom}
                style={{ flex: 1, padding: '12px 0', background: '#ff3b30', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                End Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
