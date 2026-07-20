'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Room {
  id: string;
  code: string;
  status: string;
  created_at: string;
  started_at: string | null;
  _queue_count?: number;
  _guest_count?: number;
}

interface Song {
  id: string;
  title: string;
  artist: string | null;
  youtube_video_id: string;
  thumbnail_url: string | null;
  times_played: number;
  last_played_at: string | null;
  date_added: string;
}

interface TrendingCache {
  id: number;
  items: { title: string; youtube_video_id: string }[];
  refreshed_at: string;
}

interface FeedbackItem {
  id: string;
  type: 'bug' | 'feedback' | 'suggestion';
  message: string;
  page: string | null;
  created_at: string;
  resolved: boolean;
}

interface Stats {
  totalRooms: number;
  activeRooms: number;
  totalSongs: number;
  totalPlays: number;
  blockedSongs: number;
  trendingCache: TrendingCache | null;
  apiQuota: { used: number, remaining: number };
  totalUsers: number;
  recurringUsers: number;
  cacheHitRate: number | null; // 0-100, null if no data yet
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// KanTara color palette
const C = {
  surface: '#fbf9f5',
  surfaceLow: '#f5f3ef',
  surfaceContainer: '#f0eeea',
  surfaceContainerHigh: '#eae8e4',
  surfaceDim: '#dcdad6',
  primary: '#54634a',
  primaryContainer: '#a7b79a',
  primaryFixed: '#d7e8c9',
  onSurface: '#1b1c1a',
  onSurfaceVariant: '#444840',
  outline: '#757870',
  outlineVariant: '#c5c8be',
  error: '#ba1a1a',
};

const ADMIN_KEY = 'xyuuki18';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [topSongs, setTopSongs] = useState<Song[]>([]);
  const [blockedSongs, setBlockedSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'rooms' | 'songs' | 'blocked' | 'trending' | 'feedback'>('overview');
  const [refreshingTrending, setRefreshingTrending] = useState(false);
  const [unblockedId, setUnblockedId] = useState<string | null>(null);
  const [confirmEndRoom, setConfirmEndRoom] = useState<Room | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<Song | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: roomsData },
        { data: songsData },
        { data: blockedData },
        { data: trendingData },
        { data: globalStats },
        { count: activeRooms },
        { data: quotaData },
        { count: totalUsers },
        { count: recurringUsers },
        { count: totalSongsCount },
        { count: totalBlockedCount }
      ] = await Promise.all([
        supabase.from('rooms').select('*').not('started_at', 'is', null).order('created_at', { ascending: false }).limit(50),
        supabase.from('songs').select('*').gt('times_played', 0).order('times_played', { ascending: false }).limit(20),
        supabase.from('songs').select('*').eq('times_played', -1).order('date_added', { ascending: false }).limit(30),
        supabase.from('trending_cache').select('*').eq('id', 1).maybeSingle(),
        supabase.from('global_stats').select('total_rooms, total_songs').eq('id', 1).single(),
        supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('api_quota').select('units_used, cache_hits_today').eq('date', new Date().toISOString().slice(0, 10)).maybeSingle(),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }).gt('rooms_joined', 1),
        supabase.from('songs').select('id', { count: 'exact', head: true }).gt('times_played', 0),
        supabase.from('songs').select('id', { count: 'exact', head: true }).eq('times_played', -1),
      ]);

      // Fetch feedback separately
      const { data: feedbackData } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setFeedbackItems((feedbackData ?? []) as FeedbackItem[]);

      const roomsWithCounts = await Promise.all(
        (roomsData ?? []).map(async (room: Room) => {
          const [{ count: queueCount }, { count: guestCount }] = await Promise.all([
            supabase.from('queue_items').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
            supabase.from('guests').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
          ]);
          return { ...room, _queue_count: queueCount ?? 0, _guest_count: guestCount ?? 0 };
        })
      );

      setRooms(roomsWithCounts);
      setTopSongs((songsData ?? []) as Song[]);
      setBlockedSongs((blockedData ?? []) as Song[]);

      const completedRooms = roomsWithCounts.filter(r => r.status === 'active' && (r._guest_count ?? 0) > 0).length;

      setStats({
        totalRooms: globalStats?.total_rooms ?? 0,
        activeRooms: completedRooms,
        totalSongs: (totalSongsCount ?? 0) + (totalBlockedCount ?? 0),
        totalPlays: globalStats?.total_songs ?? 0,
        blockedSongs: blockedData?.length ?? 0,
        trendingCache: trendingData as TrendingCache | null,
        apiQuota: {
          used: quotaData?.units_used ?? 0,
          remaining: 10000 - (quotaData?.units_used ?? 0),
        },
        totalUsers: totalUsers ?? 0,
        recurringUsers: recurringUsers ?? 0,
        cacheHitRate: (() => {
          const hits = quotaData?.cache_hits_today ?? 0;
          const misses = Math.round((quotaData?.units_used ?? 0) / 100);
          const total = hits + misses;
          return total > 0 ? Math.round((hits / total) * 100) : null;
        })(),
      });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('kq_admin');
    if (saved === ADMIN_KEY) setAuthed(true);
  }, []);

  useEffect(() => {
    if (authed) fetchAll();
  }, [authed, fetchAll]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_KEY) {
      sessionStorage.setItem('kq_admin', ADMIN_KEY);
      setAuthed(true);
    } else {
      setAuthError('Wrong password.');
    }
  }

  async function handleRefreshTrending() {
    setRefreshingTrending(true);
    try {
      await supabase.from('trending_cache').delete().eq('id', 1);
      await fetch('/api/trending');
      await fetchAll();
    } finally {
      setRefreshingTrending(false);
    }
  }

  async function handleUnblock(song: Song) {
    setConfirmUnblock(null);
    setUnblockedId(song.id);
    await supabase.from('songs').update({ times_played: 0 }).eq('id', song.id);
    await fetchAll();
    setUnblockedId(null);
  }

  async function handleEndRoom(roomId: string) {
    setConfirmEndRoom(null);
    await supabase.from('rooms').update({ status: 'ended' }).eq('id', roomId);
    await fetchAll();
  }

  // ── Auth Gate ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: C.surface }}
      >
        <div className="w-full max-w-xs">
          <div className="mb-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.png" alt="KanTara" className="w-10 h-10 rounded-2xl mx-auto mb-4 shadow-sm" />
            <h1 className="text-xl font-extrabold" style={{ color: C.onSurface, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}>KanTara Admin</h1>
            <p className="text-sm mt-1" style={{ color: C.outline }}>Internal dashboard</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none transition-colors"
              style={{
                background: C.surfaceLow,
                border: `1.5px solid ${C.outlineVariant}`,
                color: C.onSurface,
                fontFamily: 'var(--font-manrope), sans-serif',
              }}
              autoFocus
            />
            {authError && <p className="text-xs text-center" style={{ color: C.error }}>{authError}</p>}
            <button
              type="submit"
              className="w-full font-extrabold py-3 rounded-2xl transition-all text-sm active:scale-95"
              style={{ background: C.primary, color: 'white', fontFamily: 'var(--font-plus-jakarta), sans-serif' }}
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Config ────────────────────────────────────────────────────────────────
  const statCards = [
    { label: 'Total Users', value: String(stats?.totalUsers ?? '—'), accent: '#54634a' },
    { label: 'Recurring Users', value: String(stats?.recurringUsers ?? '—'), accent: '#8c9c7f' },
    { label: 'Total Rooms', value: String(stats?.totalRooms ?? '—'), accent: C.primary },
    { label: 'Active Rooms', value: String(stats?.activeRooms ?? '—'), accent: '#5a7a4e' },
    { label: 'Songs in DB', value: String(stats?.totalSongs ?? '—'), accent: '#6b7f62' },
    { label: 'Total Plays', value: String(stats?.totalPlays ?? '—'), accent: C.primaryContainer },
    { label: 'Blocked Songs', value: String(stats?.blockedSongs ?? '—'), accent: C.error },
    {
      label: 'Cache Hit Rate',
      value: stats?.cacheHitRate != null ? `${stats.cacheHitRate}%` : '—',
      accent: stats?.cacheHitRate != null
        ? stats.cacheHitRate >= 70 ? '#4a7c59'
        : stats.cacheHitRate >= 40 ? '#8c9c7f'
        : '#a0785a'
        : '#8c9c7f',
    },
    {
      label: 'Trending Cache',
      value: stats?.trendingCache ? `${stats.trendingCache.items.length} songs` : 'Empty',
      sub: stats?.trendingCache ? timeAgo(stats.trendingCache.refreshed_at) : 'Fetches on load',
      accent: C.primaryFixed,
    },
    {
      label: 'API Quota Used',
      value: stats?.apiQuota ? `${stats.apiQuota.used} / 10k` : '—',
      sub: stats?.apiQuota ? `${stats.apiQuota.remaining} units remaining` : '',
      accent: '#a7b79a',
    },
  ];

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'rooms', label: 'Rooms' },
    { key: 'songs', label: 'Top Songs' },
    { key: 'blocked', label: `Blocked (${blockedSongs.length})` },
    { key: 'trending', label: 'Trending Cache' },
    { key: 'feedback', label: `Feedback (${feedbackItems.filter(f => !f.resolved).length})` },
  ];

  return (
    <div className="min-h-screen" style={{ background: C.surface, color: C.onSurface, fontFamily: 'var(--font-manrope), sans-serif' }}>
      {/* ── Confirm End Room Modal ── */}
      {confirmEndRoom && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(27,28,26,0.4)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-xs rounded-3xl p-6 shadow-xl" style={{ background: C.surface, border: `1px solid ${C.outlineVariant}` }}>
            <h3 className="font-extrabold text-base mb-1" style={{ color: C.onSurface, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}>End room?</h3>
            <p className="text-sm mb-5" style={{ color: C.outline }}>This will permanently end room <strong style={{ color: C.onSurface }}>{confirmEndRoom.code}</strong> and kick all guests.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmEndRoom(null)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ background: C.surfaceContainer, color: C.onSurfaceVariant }}
              >Cancel</button>
              <button
                onClick={() => handleEndRoom(confirmEndRoom.id)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
                style={{ background: C.error }}
              >Yes, end room</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Unblock Modal ── */}
      {confirmUnblock && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(27,28,26,0.4)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-xs rounded-3xl p-6 shadow-xl" style={{ background: C.surface, border: `1px solid ${C.outlineVariant}` }}>
            <h3 className="font-extrabold text-base mb-1" style={{ color: C.onSurface, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}>Unblock song?</h3>
            <p className="text-sm mb-1" style={{ color: C.outline }}>This will restore:</p>
            <p className="text-sm font-semibold mb-5 truncate" style={{ color: C.onSurface }}>{confirmUnblock.title}</p>
            <p className="text-xs mb-5" style={{ color: C.outline }}>It will reappear in search results and Discover. Only unblock if you&apos;ve confirmed the video works.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmUnblock(null)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ background: C.surfaceContainer, color: C.onSurfaceVariant }}
              >Cancel</button>
              <button
                onClick={() => handleUnblock(confirmUnblock)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
                style={{ background: C.primary }}
              >Yes, unblock</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div
        className="sticky top-0 z-50"
        style={{ background: `${C.surface}e8`, backdropFilter: 'blur(16px)', borderBottom: `1px solid ${C.outlineVariant}` }}
      >
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.png" alt="KanTara" className="w-7 h-7 rounded-xl shadow-sm" />
            <div>
              <p className="font-extrabold text-sm leading-none" style={{ color: C.onSurface, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}>KanTara Admin</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.outline }}>Internal dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading && (
              <svg className="animate-spin h-4 w-4" style={{ color: C.primary }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <button
              onClick={fetchAll}
              className="text-xs rounded-xl px-3 py-1.5 transition-colors font-semibold"
              style={{ color: C.onSurfaceVariant, border: `1px solid ${C.outlineVariant}`, background: C.surfaceLow }}
            >
              Refresh
            </button>
            <button
              onClick={() => { sessionStorage.removeItem('kq_admin'); setAuthed(false); }}
              className="text-xs transition-colors"
              style={{ color: C.outline }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div
          className="flex gap-1 rounded-3xl p-1.5 mb-8 overflow-x-auto"
          style={{ background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}` }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-2xl text-sm font-bold transition-all whitespace-nowrap flex-shrink-0"
              style={tab === t.key
                ? { background: C.primary, color: 'white' }
                : { color: C.outline }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="rounded-3xl p-5 relative overflow-hidden"
                style={{ background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}` }}
              >
                <div
                  className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-30"
                  style={{ background: card.accent }}
                />
                <p
                  className="text-2xl font-extrabold mb-1"
                  style={{ color: C.onSurface, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}
                >
                  {card.value}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.outline }}>{card.label}</p>
                {card.sub && <p className="text-xs mt-0.5" style={{ color: C.outline }}>{card.sub}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── Rooms ── */}
        {tab === 'rooms' && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: C.outline }}>{rooms.length} rooms total</p>
            {rooms.map((room) => (
              <div
                key={room.id}
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}` }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background:
                      room.status === 'active' && (room._guest_count ?? 0) > 0 ? '#4a7c3f' :
                      room.status === 'active' ? C.outlineVariant :
                      C.outlineVariant,
                    boxShadow: room.status === 'active' && (room._guest_count ?? 0) > 0 ? '0 0 8px #4a7c3f80' : undefined,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold tracking-widest text-sm" style={{ color: C.onSurface, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}>{room.code}</span>
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          room.status === 'active' && (room._guest_count ?? 0) > 0 ? '#d7e8c9' :
                          room.status === 'active' ? C.surfaceContainerHigh :
                          C.surfaceDim,
                        color:
                          room.status === 'active' && (room._guest_count ?? 0) > 0 ? C.primary :
                          room.status === 'active' ? C.outline :
                          C.outline,
                      }}
                    >
                      {room.status === 'active' && (room._guest_count ?? 0) > 0 ? 'active' :
                       room.status === 'active' ? 'empty' :
                       room.status}
                    </span>
                    {room.status === 'active' && (room._guest_count ?? 0) > 0 && (
                      <span className="text-[10px] font-semibold" style={{ color: C.outline }}>
                        {room._guest_count} guest{(room._guest_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: C.outline }}>
                    Created {formatDate(room.created_at)}
                    {room.started_at && ` · Started ${timeAgo(room.started_at)}`}
                    {' · '}{room._queue_count} songs queued
                  </p>
                </div>
                {room.status === 'active' && (
                  <button
                    onClick={() => setConfirmEndRoom(room)}
                    className="text-xs rounded-xl px-3 py-1.5 transition-colors flex-shrink-0 font-semibold"
                    style={{ color: C.error, border: `1px solid ${C.error}40` }}
                  >
                    End Room
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Top Songs ── */}
        {tab === 'songs' && (
          <div className="space-y-2">
            {topSongs.map((song, i) => (
              <div
                key={song.id}
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}` }}
              >
                <span className="text-sm font-bold w-6 text-center flex-shrink-0" style={{ color: C.outlineVariant }}>#{i + 1}</span>
                {song.thumbnail_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={song.thumbnail_url} alt={song.title} className="w-12 h-9 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-12 h-9 rounded-xl flex-shrink-0" style={{ background: C.surfaceDim }} />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: C.onSurface }}>{song.title}</p>
                  <p className="text-xs truncate" style={{ color: C.outline }}>{song.artist ?? 'Unknown'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-extrabold text-sm" style={{ color: C.primary, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}>{song.times_played}×</p>
                  {song.last_played_at && <p className="text-[11px]" style={{ color: C.outlineVariant }}>{timeAgo(song.last_played_at)}</p>}
                </div>
                <a
                  href={`https://youtube.com/watch?v=${song.youtube_video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.outlineVariant }}
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        )}

        {/* ── Blocked ── */}
        {tab === 'blocked' && (
          <div className="space-y-2">
            <p className="text-xs font-semibold mb-4" style={{ color: C.outline }}>
              {blockedSongs.length} blocked songs — auto-skipped by the player and hidden from all search results.
            </p>
            {blockedSongs.length === 0 && (
              <div className="text-center py-16" style={{ color: C.outlineVariant }}>
                <p className="text-sm font-semibold">No blocked songs 🎉</p>
              </div>
            )}
            {blockedSongs.map((song) => (
              <div
                key={song.id}
                className="rounded-2xl p-4 flex items-center gap-4"
                style={{ background: C.surfaceContainerHigh, border: `1px solid ${C.error}30` }}
              >
                {song.thumbnail_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={song.thumbnail_url} alt={song.title} className="w-12 h-9 rounded-xl object-cover flex-shrink-0 opacity-40" />
                  : <div className="w-12 h-9 rounded-xl flex-shrink-0" style={{ background: C.surfaceDim }} />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: C.onSurfaceVariant }}>{song.title}</p>
                  <p className="text-xs truncate" style={{ color: C.outline }}>{song.artist ?? 'Unknown'} · Blocked {timeAgo(song.date_added)}</p>
                </div>
                <a
                  href={`https://youtube.com/watch?v=${song.youtube_video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.outlineVariant }}
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <button
                  onClick={() => setConfirmUnblock(song)}
                  disabled={unblockedId === song.id}
                  className="text-xs rounded-xl px-3 py-1.5 transition-colors flex-shrink-0 font-semibold"
                  style={{ color: C.primary, border: `1px solid ${C.primaryContainer}` }}
                >
                  {unblockedId === song.id ? 'Unblocking…' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Trending Cache ── */}
        {tab === 'trending' && (
          <div>
            <div
              className="rounded-3xl p-5 mb-4"
              style={{ background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}` }}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-extrabold" style={{ color: C.onSurface, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}>Trending Cache</h3>
                  {stats?.trendingCache ? (
                    <p className="text-sm mt-1" style={{ color: C.outline }}>
                      Last refreshed: <span style={{ color: C.onSurface, fontWeight: 600 }}>{formatDate(stats.trendingCache.refreshed_at)}</span>
                      {' · '}
                      <span style={{ color: Date.now() - new Date(stats.trendingCache.refreshed_at).getTime() > 22 * 3600000 ? '#b5890a' : C.primary }}>
                        {timeAgo(stats.trendingCache.refreshed_at)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm mt-1" style={{ color: C.outline }}>Empty — will fetch from YouTube on next guest page load</p>
                  )}
                </div>
                <button
                  onClick={handleRefreshTrending}
                  disabled={refreshingTrending}
                  className="flex items-center gap-2 text-sm font-extrabold px-4 py-2.5 rounded-2xl transition-all active:scale-95 text-white flex-shrink-0"
                  style={{ background: C.primary, opacity: refreshingTrending ? 0.6 : 1, fontFamily: 'var(--font-plus-jakarta), sans-serif' }}
                >
                  {refreshingTrending ? (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  {refreshingTrending ? 'Refreshing…' : 'Force Refresh'}
                </button>
              </div>
              <div
                className="text-xs rounded-2xl px-4 py-3"
                style={{ background: C.primaryFixed, color: C.primary }}
              >
                💡 Cache refreshes every <strong>24 hours</strong> automatically. Force refresh uses ~10 YouTube API units. SQL: <code style={{ fontFamily: 'monospace' }}>DELETE FROM trending_cache;</code>
              </div>
            </div>

            {(stats?.trendingCache?.items?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.outline }}>
                  {stats!.trendingCache!.items.length} cached songs
                </p>
                {stats!.trendingCache!.items.map((item, i) => (
                  <div
                    key={item.youtube_video_id}
                    className="rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{ background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}` }}
                  >
                    <span className="text-sm w-5 flex-shrink-0 font-bold" style={{ color: C.outlineVariant }}>#{i + 1}</span>
                    <p className="text-sm flex-1 truncate font-medium" style={{ color: C.onSurface }}>{item.title}</p>
                    <a
                      href={`https://youtube.com/watch?v=${item.youtube_video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: C.outlineVariant }}
                      className="flex-shrink-0 hover:opacity-70 transition-opacity"
                    >
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'feedback' && (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.outline }}>
              {feedbackItems.length} submissions
            </p>
            {feedbackItems.length === 0 && (
              <div className="rounded-3xl px-6 py-12 text-center" style={{ background: C.surfaceLow, border: `1px solid ${C.outlineVariant}` }}>
                <p className="text-sm font-medium" style={{ color: C.outline }}>No feedback yet</p>
              </div>
            )}
            {feedbackItems.map(item => (
              <div
                key={item.id}
                className="rounded-3xl p-5 space-y-2"
                style={{ background: item.resolved ? C.surfaceLow : C.surface, border: `1px solid ${item.resolved ? C.outlineVariant : C.primaryContainer}`, opacity: item.resolved ? 0.6 : 1 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg"
                    style={{
                      background: item.type === 'bug' ? '#fde8e8' : item.type === 'suggestion' ? '#fef3c7' : C.primaryFixed,
                      color: item.type === 'bug' ? C.error : item.type === 'suggestion' ? '#92400e' : C.primary,
                    }}
                  >
                    {item.type === 'bug' ? '🐛 Bug' : item.type === 'suggestion' ? '💡 Suggestion' : '💬 Feedback'}
                  </span>
                  <span className="text-xs" style={{ color: C.outline }}>{timeAgo(item.created_at)}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: C.onSurface }}>{item.message}</p>
                {item.page && (
                  <p className="text-xs font-mono" style={{ color: C.outline }}>
                    Page: {item.page === '/' ? 'Home' : item.page}
                  </p>
                )}
                <div className="pt-1">
                  <button
                    onClick={async () => {
                      await supabase.from('feedback').update({ resolved: !item.resolved }).eq('id', item.id);
                      setFeedbackItems(prev => prev.map(f => f.id === item.id ? { ...f, resolved: !f.resolved } : f));
                    }}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95"
                    style={{ background: item.resolved ? C.surfaceContainer : C.primaryFixed, color: item.resolved ? C.outline : C.primary }}
                  >
                    {item.resolved ? 'Mark unresolved' : '✓ Mark resolved'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
