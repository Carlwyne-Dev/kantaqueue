'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession } from '@/lib/supabase';
import { getCachedSearchResults, getYouTubeSearchResults, upsertSong, getPopularSongs, getTrendingSongs, TrendingResult } from '@/lib/songs';
import { QRCodeSVG } from 'qrcode.react';
import type { QueueItem, Song, YouTubeSearchResult } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

function formatDuration(secs: number | null): string {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function estimateWaitTime(queue: (QueueItem & { song: Song })[], myItem: QueueItem & { song: Song }): string {
  const idx = queue.findIndex((i) => i.id === myItem.id);
  if (idx < 0) return '';
  const totalSecs = queue.slice(0, idx).reduce((acc, i) => acc + (i.song.duration_seconds ?? 210), 0);
  if (totalSecs === 0) return 'Up next';
  return `~${Math.ceil(totalSecs / 60)} min`;
}

export default function GuestPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [tab, setTab] = useState<'queue' | 'my'>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [queue, setQueue] = useState<(QueueItem & { song: Song })[]>([]);
  const [nowPlaying, setNowPlaying] = useState<(QueueItem & { song: Song }) | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<(QueueItem & { song: Song }) | null>(null);
  const [hasSearchedYoutube, setHasSearchedYoutube] = useState(false);
  const [popularSongs, setPopularSongs] = useState<Song[]>([]);
  const [trendingSongs, setTrendingSongs] = useState<TrendingResult[]>([]);
  const [discoverOpen, setDiscoverOpen] = useState(true);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editingDedicationId, setEditingDedicationId] = useState<string | null>(null);
  const [dedicationInput, setDedicationInput] = useState('');
  const [savingDedication, setSavingDedication] = useState<string | null>(null);

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join?code=${code}` : '';

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const uid = await ensureAnonSession();
      setUserId(uid);
      const saved = localStorage.getItem(`kq_nickname_${code}`);
      if (saved) setNickname(saved);
      const { data: room, error } = await supabase.from('rooms').select('id, status').eq('code', code).in('status', ['active', 'paused']).maybeSingle();
      if (error || !room) { toast.error('Room not found or has ended.'); router.push('/'); return; }
      setRoomId(room.id);
      setLoadingRoom(false);
      // Fetch discover data once room is confirmed
      getPopularSongs(10).then(setPopularSongs);
      setTrendingLoading(true);
      getTrendingSongs().then((songs) => {
        setTrendingSongs(songs);
        setTrendingLoading(false);
      });
    }
    init();
  }, [code, router]);

  // Listen for room ended status
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`guest-room-status-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        if (payload.new.status === 'ended') {
          toast.error('The host has ended the room.', { duration: 5000 });
          router.push('/');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, router, supabase]);

  // ── Queue ─────────────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase.from('queue_items').select('*, song:songs(*)').eq('room_id', roomId).in('status', ['queued', 'playing']).order('position', { ascending: true, nullsFirst: false }).order('requested_at', { ascending: true });
    const items = (data ?? []) as (QueueItem & { song: Song })[];
    setNowPlaying(items.find((i) => i.status === 'playing') ?? null);
    setQueue(items.filter((i) => i.status === 'queued'));
  }, [roomId, supabase]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`guest-room-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` }, (payload) => {
        fetchQueue();
        // 'removed' status only happens when a song errors out on the host player —
        // re-fetch Discover so the broken song disappears live without refreshing.
        if (payload.new?.status === 'removed') {
          getTrendingSongs().then(setTrendingSongs);
          getPopularSongs().then(setPopularSongs);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` }, () => fetchQueue())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` }, () => fetchQueue())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, fetchQueue, supabase]);

  // ── Search ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let isActive = true;
    setHasSearchedYoutube(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.trim().length < 3) { setSearchResults([]); setSearchDone(false); return; }
    debounceRef.current = setTimeout(async () => {
      if (!isActive) return;
      setSearching(true); setSearchDone(false);
      try { 
        const res = await getCachedSearchResults(searchQuery);
        if (isActive) setSearchResults(res);
      }
      catch { if (isActive) toast.error('Search failed. Try again.'); }
      finally { 
        if (isActive) { setSearching(false); setSearchDone(true); }
      }
    }, 500);
    
    return () => { isActive = false; };
  }, [searchQuery]);

  async function handleSearchYoutube() {
    if (searchQuery.trim().length < 3) return;
    setSearching(true);
    try {
      const youtubeRes = await getYouTubeSearchResults(searchQuery, searchResults);
      setSearchResults(youtubeRes);
      setHasSearchedYoutube(true);
    } catch (err: any) {
      if (err.message === 'QUOTA_EXCEEDED') {
        toast.error("We've hit our daily YouTube search limit! Thank you so much for trying out our MVP. ❤️ The limit resets at midnight PT.", { duration: 6000 });
      } else {
        toast.error('YouTube search failed. Please try again.');
      }
    } finally {
      setSearching(false);
    }
  }

  // ── Add ───────────────────────────────────────────────────────────────────────
  async function handleAdd(result: YouTubeSearchResult) {
    if (!roomId || !userId || !nickname) { toast.error('You need to join the room first.'); return; }
    setAdding(result.youtube_video_id);
    try {
      const song = await upsertSong(result);
      if (!song) { toast.error('Could not add song. Try again.'); return; }
      const { count } = await supabase.from('queue_items').select('id', { count: 'exact', head: true }).eq('room_id', roomId).eq('requested_by', userId).eq('status', 'queued');
      if ((count ?? 0) >= 3) { toast.error("You've got 3 songs queued already!"); return; }
      const { data: lastItem } = await supabase.from('queue_items').select('position').eq('room_id', roomId).eq('status', 'queued').order('position', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      const newPosition = ((lastItem?.position as number | null) ?? 0) + 1000;
      const { error } = await supabase.from('queue_items').insert({ room_id: roomId, song_id: song.id, requested_by: userId, singer_name: nickname, status: 'queued', position: newPosition });
      if (error) { toast.error('Failed to add song. Try again.'); return; }
      toast.success(`"${song.title}" added!`);
      setSearchQuery(''); setSearchResults([]); setSearchDone(false);
      setTab('my');
    } finally { setAdding(null); }
  }

  async function handleRemoveOwn(itemId: string) {
    const { error } = await supabase.from('queue_items').delete().eq('id', itemId);
    if (error) toast.error('Could not remove. Try again.');
    else { toast('Removed'); fetchQueue(); }
  }

  async function handleUpdateDedication(itemId: string) {
    setSavingDedication(itemId);
    const val = dedicationInput.trim() || null;
    const { error } = await supabase.from('queue_items').update({ dedication: val }).eq('id', itemId);
    if (error) {
      toast.error('Could not save dedication.');
    } else {
      toast.success(val ? 'Dedication added!' : 'Dedication removed');
      setEditingDedicationId(null);
    }
    setSavingDedication(null);
  }

  const myItems = queue.filter((i) => i.requested_by === userId);
  const showSearch = searchResults.length > 0 || (searchDone && searchQuery.length >= 3);

  if (loadingRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 rounded-full border-4 border-surface-container-high border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen antialiased bg-surface text-on-surface font-body flex flex-col">
      {/* ── Navigation Header (matches landing page style) ── */}
      <div className="sticky top-0 z-50">
        {/* Blur layer — fades out at bottom like landing page */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
          }}
        />
        {/* Transparent nav on top */}
        <nav className="relative z-10">
          <div className="flex items-center px-[64px] py-3.5 max-md:px-[20px]">
            {/* Logo */}
            <div className="flex items-center gap-2 flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/logo.png" alt="KanTara Logo" className="w-7 h-7 rounded-md" />
              <div className="flex flex-col">
                <span className="text-[20px] font-extrabold text-on-background tracking-tighter font-headline-sm leading-none">KanTara</span>
                {/* Room info — mobile only, stacked under logo */}
                {nickname && (
                  <span className="md:hidden text-[11px] text-secondary mt-0.5 leading-none">
                    Room <span className="font-bold text-on-background tracking-[0.06em]">{code}</span> · {nickname}
                  </span>
                )}
              </div>
            </div>
            {/* Room info — center */}
            <div className="flex-1 text-center hidden md:block">
              <p className="text-[13px] font-semibold text-secondary">
                Room <span className="text-on-background font-bold tracking-[0.08em]">{code}</span>
                {nickname && <span className="text-secondary"> · {nickname}</span>}
              </p>
            </div>
            {/* Right actions */}
            <div className="flex-1 flex items-center justify-end gap-3">
              {/* Live badge */}
              <div className="flex items-center gap-1.5 border border-on-background/20 rounded-full px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-on-background">Live</span>
              </div>
              {/* Quit Button */}
              <button
                onClick={() => setShowQuitModal(true)}
                className="flex items-center gap-1.5 text-[#ba1a1a] hover:bg-[#ffdad6]/50 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-semibold cursor-pointer border-none bg-transparent"
              >
                <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" x2="9" y1="12" y2="12"></line>
                </svg>
                Quit
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* ── Main ── */}
      <motion.main 
        className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 flex flex-col gap-8 pb-32"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1 } }
        }}
      >
        {/* ── Search Section ── */}
        <motion.section 
          className="relative"
          variants={{
            hidden: { opacity: 0, y: 15 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
          }}
        >
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            {searching ? (
              <div className="w-5 h-5 rounded-full border-2 border-outline-variant border-t-primary animate-spin" />
            ) : (
              <svg className="w-5 h-5 text-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            )}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-12 py-4 bg-surface-container-lowest border-none rounded-2xl shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] focus:ring-2 focus:ring-primary/50 text-lg placeholder:text-outline/60 transition-all text-on-surface outline-none"
            placeholder="Search a karaoke song..."
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchDone(false); }}
              className="absolute inset-y-0 right-4 flex items-center text-outline hover:text-on-surface transition-colors cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </motion.section>

        {/* ── Discover ── */}
        <AnimatePresence>
          {!searchQuery && (popularSongs.length > 0 || trendingLoading || trendingSongs.length > 0) && (
            <motion.div
              key="discover"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-5"
            >
              {/* Single collapsible header */}
              <button
                onClick={() => setDiscoverOpen((v) => !v)}
                className="flex items-center gap-2 w-full group border-none bg-transparent p-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">explore</span>
                <h3 className="text-[13px] font-extrabold text-on-surface uppercase tracking-widest flex-1 text-left">Discover</h3>
                <motion.span
                  animate={{ rotate: discoverOpen ? 0 : -90 }}
                  transition={{ duration: 0.25 }}
                  className="material-symbols-outlined text-[18px] text-outline/50 group-hover:text-outline transition-colors"
                >expand_more</motion.span>
              </button>

              <AnimatePresence initial={false}>
                {discoverOpen && (
                  <motion.div
                    key="discover-content"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}
                    className="flex flex-col gap-5"
                  >
                    {/* Popular on KanTara */}
                    {popularSongs.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-outline uppercase tracking-widest mb-2.5">Popular on KanTara</p>
                        <div className="relative">
                          <div className="flex gap-3 overflow-x-auto pb-2 snap-x scroll-smooth" style={{ scrollbarWidth: 'none' }}>
                            {popularSongs.map((song) => (
                              <div
                                key={song.id}
                                className="flex-shrink-0 snap-start w-36 bg-surface-container-lowest rounded-2xl overflow-hidden border border-surface-dim/20 shadow-sm"
                              >
                                {song.thumbnail_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={song.thumbnail_url} alt={song.title} className="w-full h-24 object-cover" />
                                ) : (
                                  <div className="w-full h-24 bg-surface-container flex items-center justify-center">
                                    <span className="material-symbols-outlined text-outline/40 text-[32px]">music_note</span>
                                  </div>
                                )}
                                <div className="p-2.5">
                                  <p className="text-[11px] font-bold text-on-surface line-clamp-2 leading-tight mb-2">{song.title}</p>
                                  <button
                                    onClick={() => handleAdd({ youtube_video_id: song.youtube_video_id, title: song.title, artist: song.artist, thumbnail_url: song.thumbnail_url, duration_seconds: song.duration_seconds, from_cache: true, times_played: song.times_played })}
                                    disabled={adding === song.youtube_video_id}
                                    className="w-full py-1.5 bg-primary text-on-primary rounded-xl text-[11px] font-bold uppercase tracking-wide border-none cursor-pointer hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
                                  >
                                    {adding === song.youtube_video_id ? (
                                      <div className="flex items-center justify-center h-4"><svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                                    ) : (
                                      'Add'
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Trending in Philippines */}
                    <div>
                      <p className="text-[11px] font-bold text-outline uppercase tracking-widest mb-2.5">Trending in Philippines</p>
                      <div className="flex gap-3 overflow-x-auto pb-2 snap-x scroll-smooth" style={{ scrollbarWidth: 'none' }}>
                        {trendingLoading ? (
                          // Skeleton cards while loading
                          Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex-shrink-0 snap-start w-36 bg-surface-container-lowest rounded-2xl overflow-hidden border border-surface-dim/20 shadow-sm animate-pulse">
                              <div className="w-full h-24 bg-surface-container" />
                              <div className="p-2.5 flex flex-col gap-2">
                                <div className="h-3 bg-surface-container rounded-full w-full" />
                                <div className="h-3 bg-surface-container rounded-full w-3/4" />
                                <div className="h-6 bg-surface-container rounded-xl w-full mt-1" />
                              </div>
                            </div>
                          ))
                        ) : (
                          trendingSongs.map((song) => (
                            <div
                              key={song.youtube_video_id}
                              className="flex-shrink-0 snap-start w-36 bg-surface-container-lowest rounded-2xl overflow-hidden border border-surface-dim/20 shadow-sm"
                            >
                              {song.thumbnail_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={song.thumbnail_url} alt={song.title} className="w-full h-24 object-cover" />
                              ) : (
                                <div className="w-full h-24 bg-surface-container flex items-center justify-center">
                                  <span className="material-symbols-outlined text-outline/40 text-[32px]">music_note</span>
                                </div>
                              )}
                              <div className="p-2.5">
                                <p className="text-[11px] font-bold text-on-surface line-clamp-2 leading-tight mb-2">{song.title}</p>
                                <button
                                  onClick={() => handleAdd({ ...song, from_cache: false, times_played: 0 })}
                                  disabled={adding === song.youtube_video_id}
                                  className="w-full py-1.5 bg-primary text-on-primary rounded-xl text-[11px] font-bold uppercase tracking-wide border-none cursor-pointer hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
                                >
                                  {adding === song.youtube_video_id ? (
                                    <div className="flex items-center justify-center h-4"><svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                                  ) : (
                                    'Add'
                                  )}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>


        {/* ── Search Results ── */}
        {showSearch ? (
          <motion.section 
            className="bg-surface-container-lowest rounded-[32px] border border-surface-dim/30 p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]"
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
            }}
          >
            {searchResults.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mb-4 text-outline/40">
                  <svg fill="none" height="32" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="32">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" x2="16.65" y1="21" y2="16.65"></line>
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-on-surface mb-2 font-headline">No results found</h3>
                <p className="text-outline font-medium text-sm">Try a different song title or artist</p>
              </div>
            ) : (
              <motion.div 
                className="flex flex-col gap-2"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: { staggerChildren: 0.05 }
                  }
                }}
              >
                {searchResults.map((result) => (
                  <motion.div 
                    key={result.youtube_video_id} 
                    className="flex items-center gap-4 p-3 hover:bg-surface-container-low/50 rounded-2xl transition-colors"
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
                    }}
                  >
                    {result.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.thumbnail_url} alt={result.title} className="w-16 h-12 rounded-xl object-cover flex-shrink-0 shadow-sm" />
                    ) : (
                      <div className="w-16 h-12 bg-surface-container rounded-xl flex-shrink-0" />
                    )}
                    <div className="flex-1 overflow-hidden">
                      <h4 className="text-sm font-bold text-on-surface truncate">{result.title}</h4>
                      <p className="text-xs text-outline font-medium mt-0.5 truncate">
                        {result.artist ?? 'Unknown'}{result.duration_seconds ? ` • ${formatDuration(result.duration_seconds)}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAdd(result)}
                      disabled={adding === result.youtube_video_id}
                      className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-sm tracking-wide font-headline uppercase hover:bg-primary/90 active:scale-95 transition-all shadow-sm border-none cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {adding === result.youtube_video_id ? (
                        <svg className="animate-spin h-4 w-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      ) : (
                        'Add'
                      )}
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
            
            {!hasSearchedYoutube && searchQuery.trim().length >= 3 && searchDone && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={handleSearchYoutube}
                  disabled={searching}
                  className="flex items-center gap-2 px-6 py-3 bg-surface-container-high hover:bg-surface-dim text-on-surface rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" x2="16.65" y1="21" y2="16.65"></line>
                  </svg>
                  {searching ? 'Searching...' : `Search YouTube for "${searchQuery}"`}
                </button>
              </div>
            )}
          </motion.section>
        ) : (
          <>
            {/* ── Now Playing Section ── */}
            <motion.section
              variants={{
                hidden: { opacity: 0, y: 15 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
              }}
            >
              <div className="bg-white/40 backdrop-blur-[12px] border border-white/50 rounded-[24px] p-6 flex items-center gap-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] overflow-hidden relative">
                {/* Ambient Blur Background */}
                {nowPlaying?.song.thumbnail_url && (
                  <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="Ambient Blur" className="w-full h-full object-cover scale-150 blur-3xl" src={nowPlaying.song.thumbnail_url} />
                  </div>
                )}
                
                {nowPlaying ? (
                  <>
                    <div className="relative z-10 flex-shrink-0 w-24 h-24 rounded-[16px] overflow-hidden shadow-xl border-2 border-white/40">
                      {nowPlaying.song.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="Album Art" className="w-full h-full object-cover" src={nowPlaying.song.thumbnail_url} />
                      )}
                    </div>
                    <div className="relative z-10 flex-grow">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-primary uppercase font-headline">Now Playing</span>
                        <div className="h-px flex-grow bg-primary/20"></div>
                      </div>
                      <h2 className="text-xl font-bold text-on-surface leading-tight font-headline">{nowPlaying.song.title}</h2>
                      <p className="text-sm font-medium text-outline mt-1.5 flex items-center gap-2">
                        <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        {nowPlaying.singer_name}
                      </p>
                    </div>
                    {/* Animated visualizer bars */}
                    <div className="relative z-10 flex items-end gap-1 h-8 px-2 hidden sm:flex">
                      <div className="w-1.5 bg-primary h-3 animate-pulse rounded-t-sm"></div>
                      <div className="w-1.5 bg-primary h-6 animate-pulse rounded-t-sm" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-1.5 bg-primary h-4 animate-pulse rounded-t-sm" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-1.5 bg-primary h-7 animate-pulse rounded-t-sm" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                  </>
                ) : (
                  <div className="relative z-10 w-full flex items-center gap-4 text-outline py-2">
                    <div className="w-12 h-12 bg-surface-container rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-on-surface font-headline">Nothing playing</p>
                      <p className="text-sm">Queue a song to get the party started</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>

            {/* ── Tabs Navigation ── */}
            <motion.div 
              className="bg-surface-container-low p-1.5 rounded-2xl flex gap-2"
              variants={{
                hidden: { opacity: 0, y: 15 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
              }}
            >
              <button
                onClick={() => setTab('queue')}
                className={`flex-1 py-3 text-sm font-bold transition-colors font-headline rounded-xl cursor-pointer ${tab === 'queue' ? 'bg-surface-container-lowest text-on-surface shadow-sm border border-surface-dim/20' : 'text-outline hover:text-on-surface bg-transparent border border-transparent'}`}
              >
                Up Next {queue.length > 0 && `(${queue.length})`}
              </button>
              <button
                onClick={() => setTab('my')}
                className={`flex-1 py-3 text-sm font-bold transition-colors font-headline rounded-xl cursor-pointer ${tab === 'my' ? 'bg-surface-container-lowest text-on-surface shadow-sm border border-surface-dim/20' : 'text-outline hover:text-on-surface bg-transparent border border-transparent'}`}
              >
                My Songs {myItems.length > 0 && `(${myItems.length})`}
              </button>
            </motion.div>

            {/* ── List Content ── */}
            <motion.section 
              className="bg-surface-container-lowest rounded-[32px] border border-surface-dim/30 p-2 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]"
              variants={{
                hidden: { opacity: 0, y: 15 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
              }}
            >
              {tab === 'queue' ? (
                queue.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center">
                    <div className="mb-6 p-6 bg-surface-container-low rounded-full text-primary-container relative group">
                      <div className="absolute inset-0 bg-primary/5 rounded-full blur-xl transition-colors"></div>
                      <svg className="relative z-10 text-outline/40" fill="none" height="48" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="48">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
                        <line x1="12" x2="12" y1="19" y2="22"></line>
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-on-surface mb-2 font-headline">Queue is empty</h3>
                    <p className="text-outline max-w-xs font-medium text-sm">Search above to add the first song!</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <AnimatePresence>
                      {queue.map((item, idx) => (
                        <motion.div 
                          key={item.id} 
                          className="flex items-center gap-4 p-3 hover:bg-surface-container-low/30 rounded-[24px] transition-colors"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3, delay: idx * 0.05 }}
                          layout
                        >
                          <span className="w-6 text-center text-xs font-extrabold text-outline/40">{idx + 1}</span>
                          {item.song.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.song.thumbnail_url} alt={item.song.title} className="w-14 h-10 rounded-xl object-cover flex-shrink-0 shadow-sm" />
                          ) : (
                            <div className="w-14 h-10 bg-surface-container rounded-xl flex-shrink-0" />
                          )}
                          <div className="flex-1 overflow-hidden">
                            <h4 className="text-sm font-bold text-on-surface truncate">{item.song.title}</h4>
                            <p className="text-[13px] text-outline font-medium mt-0.5 truncate flex items-center gap-1.5">
                              <span className="text-primary font-bold">{item.singer_name}</span>
                              {item.song.duration_seconds && ` • ${formatDuration(item.song.duration_seconds)}`}
                            </p>
                          </div>
                          {item.requested_by === userId && (
                            <div className="px-3 py-1 bg-surface-container-high rounded-lg flex-shrink-0">
                              <span className="text-[11px] font-bold text-on-surface whitespace-nowrap">{estimateWaitTime(queue, item)}</span>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )
              ) : (
                /* My Songs Tab */
                myItems.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center">
                    <div className="mb-6 p-6 bg-surface-container-low rounded-full text-primary-container relative group">
                      <div className="absolute inset-0 bg-primary/5 rounded-full blur-xl transition-colors"></div>
                      <svg className="relative z-10 text-outline/40" fill="none" height="48" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="48">
                        <rect x="9" y="2" width="6" height="11" rx="3" />
                        <path d="M5 10a7 7 0 0 0 14 0" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-on-surface mb-2 font-headline">No songs queued</h3>
                    <p className="text-outline max-w-xs font-medium text-sm">You haven't added any songs yet.</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <AnimatePresence>
                      {myItems.map((item) => (
                        <motion.div 
                          key={item.id} 
                          className="flex items-center gap-4 p-3 hover:bg-surface-container-low/30 rounded-[24px] transition-colors"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3 }}
                          layout
                        >
                          {item.song.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.song.thumbnail_url} alt={item.song.title} className="w-14 h-10 rounded-xl object-cover flex-shrink-0 shadow-sm" />
                          ) : (
                            <div className="w-14 h-10 bg-surface-container rounded-xl flex-shrink-0" />
                          )}
                          <div className="flex-1 overflow-hidden">
                            <h4 className="text-sm font-bold text-on-surface truncate">{item.song.title}</h4>
                            <p className="text-[13px] text-outline font-medium mt-0.5 truncate flex items-center gap-1.5">
                              <span className="font-semibold text-primary/80">Wait time: {estimateWaitTime(queue, item)}</span>
                              {item.dedication && (
                                <span className="text-secondary/70 italic truncate ml-2">For: {item.dedication}</span>
                              )}
                            </p>
                            {editingDedicationId === item.id ? (
                              <div className="flex items-center gap-2 mt-2">
                                <input 
                                  autoFocus
                                  value={dedicationInput}
                                  onChange={(e) => setDedicationInput(e.target.value)}
                                  placeholder="Dedicate to..."
                                  className="flex-1 bg-surface-container rounded-lg px-3 py-1.5 text-[13px] border border-outline-variant/30 focus:outline-none focus:border-primary/50"
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateDedication(item.id); else if (e.key === 'Escape') setEditingDedicationId(null); }}
                                />
                                <button onClick={() => handleUpdateDedication(item.id)} disabled={savingDedication === item.id} className="text-xs font-bold text-primary px-3 py-1.5 bg-primary/10 rounded-lg hover:bg-primary/20 border-none cursor-pointer">
                                  {savingDedication === item.id ? '...' : 'Save'}
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => { setDedicationInput(item.dedication || ''); setEditingDedicationId(item.id); }}
                                className="text-[11px] font-bold text-secondary flex items-center gap-1 mt-1.5 hover:text-primary transition-colors bg-transparent border-none p-0 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[14px]">{item.dedication ? 'edit' : 'add'}</span>
                                {item.dedication ? 'Edit dedication' : 'Add dedication'}
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => setItemToRemove(item)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-outline hover:text-error hover:bg-[#ffdad6]/50 transition-colors border-none bg-transparent cursor-pointer flex-shrink-0"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}
            </motion.section>
          </>
        )}
      </motion.main>

      {/* ── Footer ── */}
      <footer className="mt-auto py-8 text-center bg-surface-dim/10">
        <p className="text-[10px] font-bold text-outline/50 uppercase tracking-[0.2em] font-headline">Powered by KanTara • Premium Karaoke Experience</p>
      </footer>

      {/* ── Quit Modal ── */}
      {showQuitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-sm bg-white rounded-[28px] p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="w-14 h-14 rounded-full bg-[#ffdad6]/50 flex items-center justify-center mx-auto mb-5 text-[#ba1a1a]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#1b1c1a] mb-2 font-headline">Leave the room?</h3>
            <p className="text-[14px] text-[#5f5e5e] mb-8 leading-relaxed font-body">Your queued songs will remain, but you won't be able to manage them unless you rejoin.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuitModal(false)}
                className="flex-1 py-3.5 bg-[#f5f3ef] text-[#1b1c1a] rounded-[16px] text-[15px] font-semibold border-none cursor-pointer hover:bg-[#e4e2de] transition-colors font-headline"
              >
                Cancel
              </button>
              <button
                onClick={() => router.push('/')}
                className="flex-1 py-3.5 bg-[#ba1a1a] text-white rounded-[16px] text-[15px] font-semibold border-none cursor-pointer hover:opacity-85 transition-opacity font-headline"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating QR Button ── */}
      <button
        onClick={() => setShowQRModal(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95"
        aria-label="Show Room QR Code"
      >
        <span className="material-symbols-outlined text-[28px]">qr_code_2</span>
      </button>

      {/* ── QR Modal ── */}
      <AnimatePresence>
        {showQRModal && joinUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-[#F2F1EC]/90 backdrop-blur-md flex flex-col items-center justify-center cursor-pointer"
            onClick={() => setShowQRModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-6"
            >
              <div className="bg-white p-4 rounded-3xl shadow-xl">
                <QRCodeSVG value={joinUrl} size={240} bgColor="transparent" fgColor="#1b1c1a" />
              </div>
              <div className="text-center drop-shadow-md">
                <p className="text-[12px] font-bold text-[#1b1c1a]/70 uppercase tracking-widest mb-1">Scan to join</p>
                <p className="text-4xl font-black text-[#1b1c1a] tracking-tighter">{code}</p>
              </div>
              <p className="text-[12px] text-[#1b1c1a]/60 font-medium">Click anywhere to close</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Remove Confirm Modal ── */}
      {itemToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-sm bg-white rounded-[28px] p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="w-14 h-14 rounded-full bg-[#ffdad6]/50 flex items-center justify-center mx-auto mb-5 text-[#ba1a1a]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#1b1c1a] mb-2 font-headline">Remove song?</h3>
            <p className="text-[14px] text-[#5f5e5e] mb-8 leading-relaxed font-body">Are you sure you want to remove <span className="font-bold text-[#1b1c1a]">"{itemToRemove.song.title}"</span> from the queue?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setItemToRemove(null)}
                className="flex-1 py-3.5 bg-[#f5f3ef] text-[#1b1c1a] rounded-[16px] text-[15px] font-semibold border-none cursor-pointer hover:bg-[#e4e2de] transition-colors font-headline"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleRemoveOwn(itemToRemove.id);
                  setItemToRemove(null);
                }}
                className="flex-1 py-3.5 bg-[#ba1a1a] text-white rounded-[16px] text-[15px] font-semibold border-none cursor-pointer hover:opacity-85 transition-opacity font-headline"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
