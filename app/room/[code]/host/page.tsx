'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Room, QueueItem, Song } from '@/types';
import { AnimatedGradient } from '@/components/ui/animated-gradient';
import { motion, AnimatePresence } from 'framer-motion';

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
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

interface YTReadyEvent {
  target: YTPlayer;
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
  const [isMobile, setIsMobile] = useState(false);
  const [partyStarted, setPartyStarted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [localNotif, setLocalNotif] = useState<string | null>(null);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [showBigQR, setShowBigQR] = useState(false);
  const [ambientColor, setAmbientColor] = useState<string>('#F2F1EC');
  
  // ── Scrubber state ────────────────────────────────────────────────────────
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  
  // ── Animation state ────────────────────────────────────────────────────────
  const [newQueueIds, setNewQueueIds] = useState<Set<string>>(new Set());
  const [exitingQueueItem, setExitingQueueItem] = useState<(QueueItem & { song: Song }) | null>(null);
  const [isPromoting, setIsPromoting] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const advancingRef = useRef(false); // prevent double-advance
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const currentAttemptRef = useRef<{ queueId: string; songId: string } | null>(null);
  const prevQueueRef = useRef<(QueueItem & { song: Song })[]>([]);
  const prevNowPlayingIdRef = useRef<string | null>(null);
  // stateRef always holds the latest room/nowPlaying — prevents stale closure in advanceQueue
  const stateRef = useRef<{ room: Room | null; nowPlaying: (QueueItem & { song: Song }) | null }>({ room: null, nowPlaying: null });

  // Keep stateRef in sync
  useEffect(() => { stateRef.current = { room, nowPlaying }; }, [room, nowPlaying]);

  // ── Sync progress ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!nowPlaying || !playerReady) return;
    const interval = setInterval(() => {
      if (!isScrubbing && playerRef.current) {
        const t = playerRef.current.getCurrentTime();
        const d = playerRef.current.getDuration?.() || 0;
        if (t !== undefined) setVideoProgress(t);
        if (d) setVideoDuration(d);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [nowPlaying, playerReady, isScrubbing]);

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    setVideoProgress(Number(e.target.value));
  }

  function handleScrubEnd() {
    if (playerRef.current) {
      playerRef.current.seekTo(videoProgress, true);
    }
    setIsScrubbing(false);
  }

  // ── Detect mobile (used for fullscreen layout decisions) ──────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900 || ('ontouchstart' in window));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const showLocalNotif = useCallback((msg: string) => {
    setLocalNotif(msg);
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    notifTimeoutRef.current = setTimeout(() => setLocalNotif(null), 3500);
  }, []);

  // ── Extract dominant color from thumbnail ─────────────────────────────────────
  useEffect(() => {
    const thumbUrl = nowPlaying?.song.thumbnail_url;
    if (!thumbUrl) {
      setAmbientColor('#F2F1EC');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = thumbUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
      }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      // Desaturate and lighten slightly so it's a soft ambient tone
      const avg = (r + g + b) / 3;
      const mix = 0.35; // 35% color, 65% grey — keeps it subtle
      r = Math.round(r * mix + avg * (1 - mix));
      g = Math.round(g * mix + avg * (1 - mix));
      b = Math.round(b * mix + avg * (1 - mix));
      // Lighten by blending with white
      const lighten = 0.55;
      r = Math.round(r + (255 - r) * lighten);
      g = Math.round(g + (255 - g) * lighten);
      b = Math.round(b + (255 - b) * lighten);
      setAmbientColor(`rgb(${r},${g},${b})`);
    };
    img.onerror = () => setAmbientColor('#F2F1EC');
  }, [nowPlaying?.song.thumbnail_url]);

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
      // If the party was already started (e.g. host refreshed), jump straight
      // to the active session so we don't re-trigger the Start Party logic.
      if (data.started_at) {
        setPartyStarted(true);
        setSessionStarted(true);
      }
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

    // ── Animation detection ──────────────────────────────────────────────────
    const prevQueue = prevQueueRef.current;
    const prevNowPlayingId = prevNowPlayingIdRef.current;

    // Detect newly added items → slide in from right
    const prevIds = new Set(prevQueue.map((i) => i.id));
    const addedItems = queued.filter((i) => !prevIds.has(i.id));
    const addedIds = addedItems.map((i) => i.id);
    if (addedIds.length > 0) {
      setNewQueueIds((prev) => new Set([...prev, ...addedIds]));
      setTimeout(() => {
        setNewQueueIds((prev) => {
          const next = new Set(prev);
          addedIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 700);
      
      const firstAdded = addedItems[0];
      if (firstAdded) {
        showLocalNotif(`${firstAdded.singer_name} added "${firstAdded.song.title}"`);
      }
    }

    // Detect first queue item being promoted to now-playing → cascade slide up
    const prevFirst = prevQueue[0];
    if (
      prevFirst &&
      !queued.find((i) => i.id === prevFirst.id) &&
      playing?.id !== prevNowPlayingId
    ) {
      setExitingQueueItem(prevFirst);
      setIsPromoting(true);
      setTimeout(() => setExitingQueueItem(null), 420);
      setTimeout(() => setIsPromoting(false), 420);
    }

    prevQueueRef.current = queued;
    prevNowPlayingIdRef.current = playing?.id ?? null;
    // ────────────────────────────────────────────────────────────────────────

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
        onReady: handlePlayerReady,
        onStateChange: handlePlayerStateChange,
        onError: handlePlayerError,
      },
    });
  }

  function loadAndPlay(videoId: string) {
    const player = playerRef.current;
    if (!player) return;

    if (loadedVideoIdRef.current !== videoId) {
      player.loadVideoById(videoId);
      loadedVideoIdRef.current = videoId;
    }

    player.playVideo();
  }

  function handlePlayerReady(event: YTReadyEvent) {
    playerRef.current = event.target;
    setPlayerReady(true);
  }

  // ── Auto-play next song ──────────────────────────────────────────────────────
  async function advanceQueue() {
    // Read FRESH state from ref — avoids stale closure bug when song ends naturally
    const { room: currentRoom, nowPlaying: currentNowPlaying } = stateRef.current;
    if (advancingRef.current || !currentRoom) return;
    advancingRef.current = true;

    try {
      // Mark current song as played
      if (currentNowPlaying) {
        // Double check status hasn't been changed by a skip already
        const { data: check } = await supabase.from('queue_items').select('status').eq('id', currentNowPlaying.id).single();
        if (check?.status === 'playing') {
          await supabase
            .from('queue_items')
            .update({ status: 'played' })
            .eq('id', currentNowPlaying.id);

          // Bump times_played on the song
          await supabase
            .from('songs')
            .update({ times_played: currentNowPlaying.song.times_played + 1, last_played_at: new Date().toISOString() })
            .eq('id', currentNowPlaying.song.id);
        }
      }

      // Get next queued item
      const { data: nextItems } = await supabase
        .from('queue_items')
        .select('*, song:songs(*)')
        .eq('room_id', currentRoom.id)
        .eq('status', 'queued')
        .order('position', { ascending: true, nullsFirst: false })
        .order('requested_at', { ascending: true })
        .limit(1);

      const next = nextItems?.[0] as (QueueItem & { song: Song }) | undefined;

      if (next) {
        currentAttemptRef.current = { queueId: next.id, songId: next.song.id };

        await supabase
          .from('queue_items')
          .update({ status: 'playing' })
          .eq('id', next.id);

        loadAndPlay(next.song.youtube_video_id);
      } else {
        currentAttemptRef.current = null;
        playerRef.current?.stopVideo();
        loadedVideoIdRef.current = null;
      }
    } finally {
      advancingRef.current = false;
    }
  }

  function handlePlayerStateChange(event: { data: number }) {
    if (event.data === window.YT.PlayerState.ENDED) {
      // Catch videos that "finish" instantly (usually region-blocked or silent errors)
      const currentTime = playerRef.current?.getCurrentTime() || 0;
      if (currentTime < 5) {
        // Route to the error handler with a fake error code to block it
        handlePlayerError({ data: 999 });
        return;
      }
      advanceQueue();
    }
  }

  // PRD §9a: unavailable video — auto-skip, block in DB, clean queue item
  async function handlePlayerError(event: { data: number }) {
    // YT error codes: 100=not found, 101/150=embedding disabled, 110=private? We'll catch any error since the player fails anyway
    if ([100, 101, 150].includes(event.data) || event.data > 0) {
      toast.error('Video unavailable — skipping', { duration: 3000 });

      const attempt = currentAttemptRef.current;
      if (attempt) {
        // 1. Mark song as permanently blocked (times_played=-1)
        await supabase
          .from('songs')
          .update({ times_played: -1 })
          .eq('id', attempt.songId);

        // 2. Remove the failed queue item so it doesn't re-trigger
        await supabase
          .from('queue_items')
          .update({ status: 'removed' })
          .eq('id', attempt.queueId);
        
        currentAttemptRef.current = null;
      }

      // 3. Advance to next song (advanceQueue handles nowPlaying=null case)
      advancingRef.current = false; // reset lock so advance works
      advanceQueue();
    }
  }

  // Auto-play when idle and queue receives a song
  useEffect(() => {
    if (partyStarted && playerReady && !nowPlaying && queue.length > 0) {
      const t = setTimeout(() => {
        if (!nowPlaying && queue.length > 0 && !advancingRef.current) {
          advanceQueue();
        }
      }, 500);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyStarted, playerReady, nowPlaying, queue.length]);

  useEffect(() => {
    if (!partyStarted || !playerReady || !nowPlaying) return;
    loadAndPlay(nowPlaying.song.youtube_video_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyStarted, playerReady, nowPlaying?.id]);

  // ── Start party (unlocks audio on mobile) ────────────────────────────────────
  async function handleStartParty() {
    setPartyStarted(true);
    await requestWakeLock();
    setSessionStarted(true);
    // Stamp started_at so the landing page "Rooms Created" stat only counts
    // rooms where a party was actually started, not just created.
    if (room) {
      await supabase
        .from('rooms')
        .update({ started_at: new Date().toISOString() })
        .eq('id', room.id);
    }
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
      // Ignored
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
    loadedVideoIdRef.current = null;
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
      <div className="min-h-screen overflow-x-hidden flex flex-col text-on-background bg-surface bg-[radial-gradient(circle_at_10%_20%,rgba(215,232,201,0.15)_0%,rgba(251,249,245,0)_40%),radial-gradient(circle_at_90%_80%,rgba(167,183,154,0.1)_0%,rgba(251,249,245,0)_50%)]">

        {/* Header */}
        <header className="w-full max-w-7xl mx-auto px-6 py-8 flex justify-between items-center z-10">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.png" alt="KanTara Logo" className="w-7 h-7 rounded-md" />
            <span className="text-xl font-extrabold tracking-tight text-on-background">KanTara</span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 rounded-full border border-outline-variant bg-white/50 text-[14px] font-semibold hover:bg-white hover:shadow-sm transition-all flex items-center gap-2 text-on-background"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Exit Room
          </button>
        </header>

        {/* Main */}
        <main className="flex-grow flex items-center justify-center px-6 py-12 z-10">
          <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

            {/* Left — Info + CTA */}
            <motion.div
              className="space-y-10"
              initial={{ opacity: 0, x: -32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Active badge */}
              <motion.div
                className="inline-flex items-center gap-2.5 bg-[#A7B79A]/20 text-[#3a4832] px-4 py-2 rounded-full border border-[#A7B79A]/30"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#54634a] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#54634a]"></span>
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em]">Room Active</span>
              </motion.div>

              <motion.div
                className="space-y-5"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <h1 className="text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight text-on-background">
                  The stage<br/>is set.
                </h1>
                <p className="text-lg text-secondary font-medium max-w-sm leading-relaxed">
                  Share the QR code or room code with your guests. They join from their own phone — no app install needed.
                </p>
              </motion.div>

              {/* Steps */}
              <ul className="space-y-5">
                {[
                  'Guests scan the QR code or type the room code',
                  'They search and queue songs from their phone',
                  'Hit Start — songs play automatically on this screen',
                ].map((label, i) => (
                  <motion.li
                    key={i}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#A7B79A]/15 flex items-center justify-center text-[#54634a] text-[13px] font-bold">{i + 1}</span>
                    <span className="text-[15px] font-medium text-on-background/80">{label}</span>
                  </motion.li>
                ))}
              </ul>

              {/* CTA */}
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.button
                  id="start-party-btn"
                  onClick={handleStartParty}
                  whileHover={{ scale: 1.04, boxShadow: '0 20px 40px rgba(84,99,74,0.35)' }}
                  whileTap={{ scale: 0.97 }}
                  className="bg-[#54634a] text-white px-10 py-5 rounded-[20px] text-xl font-bold shadow-xl shadow-[#54634a]/20 w-fit"
                >
                  Start Party
                </motion.button>
                <div className="flex items-center gap-2 text-[13px] text-secondary font-medium">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  <span>Room expires in 6 hours · No account required</span>
                </div>
              </motion.div>
            </motion.div>

            {/* Right — QR Card */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="absolute -top-16 -right-16 w-80 h-80 bg-[#A7B79A]/10 rounded-full blur-[100px] -z-10" />
              <motion.div
                className="bg-[#F2F1EC] p-10 lg:p-12 rounded-[32px] border border-white/40 shadow-[0_20px_40px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col items-center text-center gap-8"
              >
                {/* QR */}
                <motion.div
                  className="bg-white p-6 rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-black/[0.03]"
                  whileHover={{ scale: 1.04, boxShadow: '0 12px_40px_rgba(167,183,154,0.3)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {joinUrl && (
                    <QRCodeSVG value={joinUrl} size={220} id="room-qr-code" />
                  )}
                </motion.div>

                {/* Room code */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold tracking-[0.25em] text-secondary/60 uppercase">Room Code</p>
                  <p id="room-code-display" className="text-6xl font-extrabold tracking-tighter text-on-background">{code}</p>
                </div>

                <p className="text-[13px] text-secondary/60 font-medium">Point a phone camera at the QR code to join</p>
              </motion.div>
            </motion.div>
          </div>
        </main>
      </div>
    );
  }

  // ── Render: Active Session ───────────────────────────────────────────────────
  return (
    <div
      className="h-[100dvh] overflow-hidden flex flex-col w-full"
      style={{
        background: isFullscreen ? '#000' : ambientColor,
        transition: 'background 1.2s ease',
      }}
    >
      <div
        className="flex-1 flex overflow-hidden min-h-0 max-md:justify-center transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ gap: isFullscreen ? 0 : 24, padding: isFullscreen ? 0 : 24 }}
      >
        {/* ── Video / Stage area — hidden on mobile ── */}
        <motion.div
          layout
          className="group flex-1 relative overflow-hidden max-md:hidden transition-[border-radius] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ borderRadius: isFullscreen ? 0 : 20, background: '#1E1E1E', boxShadow: isFullscreen ? 'none' : '0 8px 40px rgba(0,0,0,0.25)' }}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], layout: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }}
        >
          {/* Ambient glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(167,183,154,0.08),transparent_70%)] pointer-events-none z-0" />

          {/* YT Player Wrapper */}
          <div className={`absolute inset-0 z-40 transition-opacity duration-700 ${!nowPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div ref={playerContainerRef} className="w-full h-full" id="yt-player" />
          </div>

          {/* Progress / Scrubber (visible when playing & hovered) */}
          {nowPlaying && (
            <div className="absolute bottom-0 left-0 right-0 z-50 p-6 pt-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-4">
              <span className="text-white text-xs font-medium font-mono">{formatDuration(Math.floor(videoProgress))}</span>
              <input
                type="range"
                min={0}
                max={videoDuration || 100}
                value={videoProgress}
                onChange={(e) => {
                  setIsScrubbing(true);
                  handleScrub(e);
                }}
                onMouseUp={handleScrubEnd}
                onTouchEnd={handleScrubEnd}
                className="flex-1 h-1.5 bg-white/30 rounded-full appearance-none cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                style={{
                  background: `linear-gradient(to right, white ${(videoProgress / (videoDuration || 1)) * 100}%, rgba(255,255,255,0.3) ${(videoProgress / (videoDuration || 1)) * 100}%)`
                }}
              />
              <span className="text-white/70 text-xs font-medium font-mono">{formatDuration(Math.floor(videoDuration))}</span>
            </div>
          )}

          {/* Idle state */}
          {!nowPlaying && (
            <div className={`absolute inset-0 z-50 flex flex-col items-center text-white overflow-hidden bg-[#1E1E1E] ${
              isFullscreen && isMobile
                ? 'justify-end pb-14'
                : 'justify-center gap-10'
            }`}>
              {/* WebGL Animated Gradient */}
              <AnimatedGradient config={{ preset: "Sage" }} className="absolute inset-0 z-0 opacity-80" />
              
              <div className={`relative z-20 flex flex-col items-center ${
                isFullscreen && isMobile ? 'gap-5' : 'gap-12'
              }`}>
                {/* Icon */}
                <div className={`flex items-center justify-center shadow-[0_0_80px_rgba(167,183,154,0.3)] bg-white/20 backdrop-blur-xl border border-white/30 ${
                  isFullscreen && isMobile
                    ? 'w-20 h-20 rounded-[1.5rem]'
                    : 'w-28 h-28 rounded-[2.5rem]'
                }`}>
                  <svg fill="white" width={isFullscreen && isMobile ? 38 : 52} height={isFullscreen && isMobile ? 38 : 52} viewBox="0 0 24 24">
                    <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm6 8a1 1 0 0 1 1 1 7 7 0 0 1-6 6.92V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.08A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0 1 1 0 0 1 1-1z"/>
                  </svg>
                </div>

                {/* Waiting for songs text */}
                <p className={`font-black text-white tracking-tight uppercase ${
                  isFullscreen && isMobile ? 'text-2xl' : 'text-5xl md:text-6xl'
                }`}>WAITING FOR SONGS</p>

                {/* Room Code Box — desktop/TV only */}
                {!(isFullscreen && isMobile) && (
                  <div className="max-md:hidden bg-white/10 backdrop-blur-2xl px-10 py-5 rounded-[2rem] border border-white/20 text-center flex flex-col items-center shadow-2xl">
                    <p className="text-[11px] text-white/50 tracking-[0.3em] uppercase font-bold mb-2">Room Code</p>
                    <p className="text-5xl font-black text-white tracking-tighter drop-shadow-md">{code}</p>
                  </div>
                )}

                <p className="text-[13px] text-white/40 font-medium">Point a phone camera at the QR code to join</p>
              </div>
            </div>
          )}

          {/* Fullscreen QR pill */}
          {isFullscreen && joinUrl && (
            <div className="absolute bottom-7 right-7 z-[60] flex items-center gap-3 bg-black/55 backdrop-blur-xl rounded-full px-5 py-2.5 border border-white/10">
              <QRCodeSVG value={joinUrl} size={36} />
              <span className="text-white text-base font-bold tracking-[0.1em]">{code}</span>
            </div>
          )}

          {/* Fullscreen controls */}
          {isFullscreen && (
            <div className="absolute top-4 right-4 md:top-7 md:right-7 z-[60] flex items-center gap-2 md:gap-3 bg-black/50 backdrop-blur-xl rounded-full px-2.5 py-1.5 md:px-4 md:py-2.5 border border-white/10">
              <button id="host-skip-btn-fs" onClick={handleSkip} title="Skip"
                className="w-8 h-8 md:w-11 md:h-11 rounded-full bg-white/10 hover:bg-white/20 border-none flex items-center justify-center transition-all cursor-pointer">
                <svg width="14" height="14" className="md:w-[18px] md:h-[18px]" viewBox="0 0 24 24" fill="none"><path d="M5 4l10 8-10 8V4z" fill="white"/><rect x="19" y="4" width="2" height="16" rx="1" fill="white"/></svg>
              </button>
              <div className="w-px h-4 md:h-6 bg-white/15" />
              <button id="host-exit-fs-btn" onClick={handleExitPresentationMode} title="Exit fullscreen"
                className="w-8 h-8 md:w-11 md:h-11 rounded-full bg-white/10 hover:bg-white/20 border-none flex items-center justify-center transition-all cursor-pointer">
                <svg width="14" height="14" className="md:w-[18px] md:h-[18px]" viewBox="0 0 24 24" fill="none"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}

          {/* Fullscreen notification */}
          {isFullscreen && localNotif && (
            <div className="absolute top-28 right-7 z-[60] bg-black/50 backdrop-blur-xl rounded-full px-5 py-3 border border-white/10 text-white text-[13px] font-semibold animate-[slideInRightThenOut_3.5s_ease-in-out_forwards]">
              {localNotif}
            </div>
          )}
        </motion.div>

        {/* ── Sidebar ── */}
        <AnimatePresence initial={false}>
          {!isFullscreen && (
            <motion.aside 
              layout
              className="max-md:w-full md:w-80 xl:w-96 2xl:w-[400px] relative flex flex-col gap-3 h-full overflow-hidden min-h-0 shrink-0"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0, transition: { staggerChildren: 0.15, delayChildren: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, x: 30, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
            >

            {/* Now Playing */}
            <motion.section 
              className="bg-[#F9F8F5] p-5 rounded-[20px] border border-outline-variant/30 shadow-sm flex-shrink-0"
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } } }}
            >
              <h2 className="text-[11px] font-extrabold text-secondary/60 uppercase tracking-widest mb-4">Now Playing</h2>
              {nowPlaying ? (
                <div key={nowPlaying.id} className="flex items-center gap-3 now-playing-enter">
                  {nowPlaying.song.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={nowPlaying.song.thumbnail_url} alt={nowPlaying.song.title}
                      className="w-14 h-10 rounded-xl object-cover flex-shrink-0" />
                  )}
                  <div className="overflow-hidden">
                    <p className="text-[13px] font-semibold text-on-background truncate">{nowPlaying.song.title}</p>
                    <p className="text-[12px] text-secondary truncate mt-0.5">{nowPlaying.singer_name}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-14 h-10 bg-surface-container-high rounded-xl flex items-center justify-center border border-outline-variant/20">
                    <span className="material-symbols-outlined text-outline/40 text-[20px]">music_note</span>
                  </div>
                  <p className="text-[14px] font-medium text-secondary/50 italic">Nothing playing yet</p>
                </div>
              )}
            </motion.section>

            {/* Up Next / Queue */}
            <motion.section 
              className="bg-[#F9F8F5] rounded-[20px] border border-outline-variant/30 shadow-sm flex-1 flex flex-col min-h-0" style={{ overflow: 'clip' }}
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } } }}
            >
              <div className="px-5 pt-5 pb-3 border-b border-outline-variant/20 flex-shrink-0">
                <h2 className="text-[11px] font-extrabold text-secondary/60 uppercase tracking-widest">
                  Up Next {queue.length > 0 && `· ${queue.length}`}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0" style={{ overflowX: 'clip' }}>
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-5 py-10 text-center">
                    <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center opacity-40 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-outline text-[28px]">queue_music</span>
                    </div>
                    <p className="text-[13px] font-semibold text-secondary/60">Queue is currently empty</p>
                  </div>
                ) : (
                  <ul className="m-0 p-0 list-none" style={{ overflowX: 'clip' }}>
                    {queue.map((item, idx) => (
                      <li
                        key={item.id}
                        className={`flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10 last:border-0 ${newQueueIds.has(item.id) ? 'queue-item-enter' : isPromoting ? 'queue-item-shift-up' : ''}`}
                      >
                        <span className="text-[12px] font-bold text-secondary/40 w-5 text-center flex-shrink-0">{idx + 1}</span>
                        {item.song.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.song.thumbnail_url} alt={item.song.title}
                            className="w-10 h-8 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="text-[12px] font-semibold text-on-background truncate">{item.song.title}</p>
                          <p className="text-[11px] text-secondary truncate mt-0.5">{item.singer_name}{item.song.duration_seconds ? ` · ${formatDuration(item.song.duration_seconds)}` : ''}</p>
                        </div>
                        <button id={`remove-queue-${item.id}`} onClick={() => handleRemove(item.id)} aria-label="Remove"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-secondary/30 hover:text-error hover:bg-error-container/40 transition-all border-none bg-transparent cursor-pointer flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.section>

            {/* Control panel */}
            <motion.section 
              className="bg-[#F9F8F5] p-4 rounded-[20px] border border-outline-variant/30 shadow-sm flex-shrink-0"
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } } }}
            >
              {/* QR + code */}
              {joinUrl && (
                <div
                  className="flex items-center gap-3 bg-white/60 p-3 rounded-2xl mb-4 border border-outline-variant/20 cursor-pointer hover:bg-white/90 transition-colors"
                  onClick={() => setShowBigQR(true)}
                >
                  <div className="w-16 h-16 bg-white border border-outline-variant/30 p-1 flex items-center justify-center rounded-xl shadow-inner flex-shrink-0">
                    <QRCodeSVG value={joinUrl} size={54} />
                  </div>
                  <div>
                    <p className="text-[10px] text-secondary/60 font-bold uppercase tracking-widest mb-0.5">Scan to join</p>
                    <p className="text-2xl font-black text-on-background tracking-tighter">{code}</p>
                  </div>
                </div>
              )}

              {/* Control buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    id: 'host-skip-btn', label: 'Skip',
                    icon: <svg fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>,
                    onClick: handleSkip, disabled: !nowPlaying, danger: false, primary: false,
                  },
                  {
                    id: 'host-pause-btn', label: room.status === 'paused' ? 'Resume' : 'Pause',
                    icon: room.status === 'paused'
                      ? <svg fill="currentColor" width="18" height="18" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>
                      : <svg fill="currentColor" width="18" height="18" viewBox="0 0 24 24"><rect x="5" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>,
                    onClick: handlePauseRoom, disabled: false, danger: false, primary: true,
                  },
                  {
                    id: 'host-fullscreen-btn', label: 'TV Mode',
                    icon: <svg fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
                    onClick: handleEnterPresentationMode, disabled: false, danger: false, primary: false,
                  },
                  {
                    id: 'host-quit-btn', label: 'Quit',
                    icon: <svg fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
                    onClick: () => setShowQuitModal(true), disabled: false, danger: true, primary: false,
                  },
                ].map(({ id, label, icon, onClick, disabled, danger, primary }) => (
                  <button
                    key={id}
                    id={id}
                    onClick={onClick}
                    disabled={disabled}
                    className={`flex flex-col items-center justify-center aspect-square rounded-[14px] border-none transition-all cursor-pointer
                      ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:brightness-95'}
                      ${danger ? 'bg-error-container/50 text-error' : primary ? 'bg-[#54634a] text-white shadow-lg shadow-[#54634a]/20' : 'bg-white border border-outline-variant/30 text-secondary'}`}
                  >
                    {icon}
                    <span className="text-[9px] mt-1.5 font-bold uppercase tracking-tighter">{label}</span>
                  </button>
                ))}
              </div>
            </motion.section>

            {/* Sidebar Overlay: Big QR */}
            {showBigQR && joinUrl && (
              <div
                className="absolute inset-0 z-50 bg-[#F2F1EC]/90 backdrop-blur-md flex flex-col items-center justify-center cursor-pointer animate-[fadeIn_0.2s_ease-out]"
                onClick={() => setShowBigQR(false)}
              >
                <div className="bg-white p-8 rounded-[40px] shadow-2xl flex flex-col items-center gap-6 border border-outline-variant/30 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                  <div className="bg-white p-2 rounded-xl">
                    <QRCodeSVG value={joinUrl} size={200} />
                  </div>
                  <div className="text-center">
                    <p className="text-[12px] font-bold text-secondary/60 uppercase tracking-widest mb-1">Scan to join</p>
                    <p className="text-4xl font-black text-on-background tracking-tighter">{code}</p>
                  </div>
                  <p className="text-[12px] text-secondary font-medium">Click anywhere to close</p>
                </div>
              </div>
            )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Quit Modal */}
      {showQuitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-sm bg-white rounded-[28px] p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="w-14 h-14 rounded-full bg-[#ffdad6]/50 flex items-center justify-center mx-auto mb-5 text-[#ba1a1a]">
              <span className="material-symbols-outlined text-[28px]">logout</span>
            </div>
            <h3 className="text-xl font-bold text-[#1b1c1a] mb-2">End this room?</h3>
            <p className="text-[14px] text-[#5f5e5e] mb-8 leading-relaxed">All guests will be disconnected and the queue will be closed.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuitModal(false)}
                className="flex-1 py-3.5 bg-[#f5f3ef] text-[#1b1c1a] rounded-[16px] text-[15px] font-semibold border-none cursor-pointer hover:bg-[#e4e2de] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleQuitRoom}
                className="flex-1 py-3.5 bg-[#ba1a1a] text-white rounded-[16px] text-[15px] font-semibold border-none cursor-pointer hover:opacity-85 transition-opacity"
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
