'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession } from '@/lib/supabase';
import { searchSongs, upsertSong } from '@/lib/songs';
import type { QueueItem, Song, YouTubeSearchResult } from '@/types';

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

const ff = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const uid = await ensureAnonSession();
      setUserId(uid);
      const saved = sessionStorage.getItem(`kq_nickname_${code}`);
      if (saved) setNickname(saved);
      const { data: room, error } = await supabase.from('rooms').select('id, status').eq('code', code).eq('status', 'active').maybeSingle();
      if (error || !room) { toast.error('Room not found or has ended.'); router.push('/'); return; }
      setRoomId(room.id);
      setLoadingRoom(false);
    }
    init();
  }, [code]);

  // ── Queue ─────────────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase.from('queue_items').select('*, song:songs(*)').eq('room_id', roomId).in('status', ['queued', 'playing']).order('position', { ascending: true, nullsFirst: false }).order('requested_at', { ascending: true });
    const items = (data ?? []) as (QueueItem & { song: Song })[];
    setNowPlaying(items.find((i) => i.status === 'playing') ?? null);
    setQueue(items.filter((i) => i.status === 'queued'));
  }, [roomId]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`guest-room-${roomId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` }, () => fetchQueue()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, fetchQueue]);

  // ── Search ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.trim().length < 3) { setSearchResults([]); setSearchDone(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true); setSearchDone(false);
      try { setSearchResults(await searchSongs(searchQuery)); }
      catch { toast.error('Search failed. Try again.'); }
      finally { setSearching(false); setSearchDone(true); }
    }, 500);
  }, [searchQuery]);

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
    const { error } = await supabase.from('queue_items').update({ status: 'removed' }).eq('id', itemId);
    if (error) toast.error('Could not remove. Try again.');
    else { toast('Removed'); fetchQueue(); }
  }

  const myItems = queue.filter((i) => i.requested_by === userId);
  const showSearch = searchResults.length > 0 || (searchDone && searchQuery.length >= 3);

  if (loadingRoom) {
    return (
      <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: ff }}>
        <div style={{ width: 28, height: 28, border: '3px solid #f2f2f7', borderTopColor: '#1c1c1e', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100svh', background: '#f2f2f7', display: 'flex', flexDirection: 'column', fontFamily: ff }}>

      {/* ── Sticky header ────────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(242,242,247,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '12px 16px 10px' }}>

        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1c1c1e', margin: 0, letterSpacing: '-0.3px' }}>KantaQueue</p>
            <p style={{ fontSize: 12, color: '#8e8e93', margin: '2px 0 0', letterSpacing: '-0.1px' }}>
              Room <span style={{ fontWeight: 700, letterSpacing: '0.06em', color: '#1c1c1e' }}>{code}</span>
              {nickname ? <span> · {nickname}</span> : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#dcfce7', borderRadius: 20, padding: '5px 10px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d', letterSpacing: '-0.1px' }}>Live</span>
            </div>
            <button
              onClick={() => setShowQuitModal(true)}
              style={{ background: '#fff2f2', border: 'none', borderRadius: 20, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#ff3b30', cursor: 'pointer', fontFamily: ff, display: 'flex', alignItems: 'center', gap: 4, transition: 'background 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ffe5e5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff2f2'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Quit
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            {searching ? (
              <div style={{ width: 14, height: 14, border: '2px solid #e5e5ea', borderTopColor: '#8e8e93', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="#8e8e93" strokeWidth="2" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <input
            id="song-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search a karaoke song…"
            autoComplete="off"
            style={{ width: '100%', height: 40, borderRadius: 12, background: '#fff', border: '1.5px solid #e5e5ea', paddingLeft: 36, paddingRight: searchQuery ? 36 : 12, fontSize: 15, color: '#1c1c1e', fontFamily: ff, boxSizing: 'border-box', outline: 'none', letterSpacing: '-0.2px' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#1c1c1e'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e5ea'; }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchDone(false); }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: '#e5e5ea', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="#8e8e93" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 32px' }}>

        {/* ── Search results ──────────────────────────────────────────────────── */}
        {showSearch && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searchResults.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 18, padding: '40px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="#c7c7cc" strokeWidth="1.8" />
                    <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', margin: 0 }}>No results found</p>
                <p style={{ fontSize: 13, color: '#8e8e93', margin: '6px 0 0' }}>Try a different song title or artist</p>
              </div>
            ) : (
              searchResults.map((result) => (
                <div key={result.youtube_video_id} style={{ background: '#fff', borderRadius: 18, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  {result.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.thumbnail_url} alt={result.title} style={{ width: 64, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1e', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.1px' }}>{result.title}</p>
                    <p style={{ fontSize: 12, color: '#8e8e93', margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {result.artist ?? 'Unknown'}{result.duration_seconds ? ` · ${formatDuration(result.duration_seconds)}` : ''}
                    </p>
                    {result.from_cache && result.times_played > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#8e8e93', background: '#f2f2f7', borderRadius: 6, padding: '2px 6px', marginTop: 4, display: 'inline-block' }}>
                        Played {result.times_played}×
                      </span>
                    )}
                  </div>
                  <button
                    id={`add-song-${result.youtube_video_id}`}
                    onClick={() => handleAdd(result)}
                    disabled={adding === result.youtube_video_id}
                    style={{ background: '#1c1c1e', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: adding === result.youtube_video_id ? 'not-allowed' : 'pointer', flexShrink: 0, fontFamily: ff, display: 'flex', alignItems: 'center', gap: 6, opacity: adding === result.youtube_video_id ? 0.5 : 1 }}
                  >
                    {adding === result.youtube_video_id ? (
                      <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <line x1="12" y1="5" x2="12" y2="19" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="5" y1="12" x2="19" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                        Add
                      </>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Queue / My Songs ────────────────────────────────────────────────── */}
        {!showSearch && !searching && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Now Playing */}
            {nowPlaying && (
              <div style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                {nowPlaying.song.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={nowPlaying.song.thumbnail_url} alt={nowPlaying.song.title} style={{ width: 52, height: 39, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Now Playing</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1e', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nowPlaying.song.title}</p>
                  <p style={{ fontSize: 12, color: '#8e8e93', margin: '2px 0 0' }}>{nowPlaying.singer_name}</p>
                </div>
              </div>
            )}

            {/* Segmented tabs */}
            <div style={{ background: '#e5e5ea', borderRadius: 12, padding: 3, display: 'flex', gap: 2 }}>
              {(['queue', 'my'] as const).map((t) => (
                <button
                  key={t}
                  id={t === 'queue' ? 'tab-all-queue' : 'tab-my-songs'}
                  onClick={() => setTab(t)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', background: tab === t ? '#fff' : 'transparent', fontSize: 13, fontWeight: 600, color: tab === t ? '#1c1c1e' : '#8e8e93', cursor: 'pointer', fontFamily: ff, boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s', letterSpacing: '-0.1px' }}
                >
                  {t === 'queue' ? 'Queue' : `My Songs${myItems.length > 0 ? ` (${myItems.length})` : ''}`}
                </button>
              ))}
            </div>

            {/* Queue list */}
            {tab === 'queue' && (
              queue.length === 0 && !nowPlaying ? (
                <div style={{ background: '#fff', borderRadius: 18, padding: '48px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18V5l12-2v13" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="6" cy="18" r="3" stroke="#c7c7cc" strokeWidth="1.8" />
                      <circle cx="18" cy="16" r="3" stroke="#c7c7cc" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', margin: 0 }}>Queue is empty</p>
                  <p style={{ fontSize: 13, color: '#8e8e93', margin: '6px 0 0' }}>Search above to add the first song!</p>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  {queue.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: idx < queue.length - 1 ? '1px solid #f9f9fb' : 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#c7c7cc', width: 18, textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
                      {item.song.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.song.thumbnail_url} alt={item.song.title} style={{ width: 48, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.song.title}</p>
                        <p style={{ fontSize: 12, color: '#8e8e93', margin: '2px 0 0' }}>{item.singer_name}{item.song.duration_seconds ? ` · ${formatDuration(item.song.duration_seconds)}` : ''}</p>
                      </div>
                      {item.requested_by === userId && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#1c1c1e', background: '#f2f2f7', borderRadius: 8, padding: '4px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {estimateWaitTime(queue, item)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* My songs */}
            {tab === 'my' && (
              myItems.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 18, padding: '48px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="9" y="2" width="6" height="11" rx="3" stroke="#c7c7cc" strokeWidth="1.8" />
                      <path d="M5 10a7 7 0 0 0 14 0" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" />
                      <line x1="12" y1="17" x2="12" y2="21" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', margin: 0 }}>No songs queued</p>
                  <p style={{ fontSize: 13, color: '#8e8e93', margin: '6px 0 0' }}>Search above to add your first song!</p>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  {myItems.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: idx < myItems.length - 1 ? '1px solid #f9f9fb' : 'none' }}>
                      {item.song.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.song.thumbnail_url} alt={item.song.title} style={{ width: 48, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.song.title}</p>
                        <p style={{ fontSize: 12, color: '#8e8e93', margin: '2px 0 0' }}>{estimateWaitTime(queue, item)}</p>
                      </div>
                      <button
                        id={`remove-my-${item.id}`}
                        onClick={() => handleRemoveOwn(item.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 8, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fff0f0'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6l12 12" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* ── Quit Modal ─────────────────────────────────────────────────────── */}
      {showQuitModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 24, padding: '24px 24px 20px', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff2f2', color: '#ff3b30', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#1c1c1e', margin: '0 0 8px', letterSpacing: '-0.3px' }}>Leave the room?</p>
            <p style={{ fontSize: 14, color: '#8e8e93', margin: '0 0 24px', lineHeight: 1.4, letterSpacing: '-0.1px' }}>Your queued songs will remain, but you won't be able to manage them unless you rejoin.</p>
            
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowQuitModal(false)}
                style={{ flex: 1, padding: '12px 0', background: '#f2f2f7', color: '#1c1c1e', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: ff, transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e5ea'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f2f2f7'; }}
              >
                Cancel
              </button>
              <button
                onClick={() => router.push('/')}
                style={{ flex: 1, padding: '12px 0', background: '#ff3b30', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: ff, transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
