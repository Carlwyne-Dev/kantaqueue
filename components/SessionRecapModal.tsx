'use client';

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Music, Clock, Download, X, Mic } from 'lucide-react';
import type { QueueItem, Song } from '@/types';

export interface RecapData {
  roomCode: string;
  createdAt: string;
  endedAt: string;
  playedItems: (QueueItem & { song: Song })[];
}

interface SessionRecapModalProps {
  data: RecapData;
  onClose: () => void;
}

function formatSessionDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getTopSinger(items: (QueueItem & { song: Song })[]): string {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.singer_name] = (counts[item.singer_name] ?? 0) + 1;
  }
  let top = '';
  let max = 0;
  for (const [name, count] of Object.entries(counts)) {
    if (count > max) { max = count; top = name; }
  }
  return top;
}

export default function SessionRecapModal({ data, onClose }: SessionRecapModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { roomCode, createdAt, endedAt, playedItems } = data;

  const totalSongs = playedItems.length;
  const duration = formatSessionDuration(createdAt, endedAt);
  const topSinger = getTopSinger(playedItems);

  // Deduplicate setlist — keep order of first occurrence
  const setlist: (QueueItem & { song: Song })[] = [];
  const seen = new Set<string>();
  for (const item of playedItems) {
    if (!seen.has(item.song.youtube_video_id)) {
      seen.add(item.song.youtube_video_id);
      setlist.push(item);
    }
  }

  async function handleDownload() {
    if (!cardRef.current) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `kantara-recap-${roomCode}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // silent fail — user can screenshot instead
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        style={{ background: 'rgba(15, 18, 14, 0.85)', backdropFilter: 'blur(16px)' }}
      >
        <div className="relative w-full max-w-[400px] mx-auto flex flex-col items-center my-auto py-8">
          {/* Close button - floating outside */}
          <button
            onClick={onClose}
            className="absolute top-0 right-0 md:-right-12 rounded-full p-2.5 bg-white/10 text-white/70 hover:bg-white/25 hover:text-white transition-all backdrop-blur-md"
            aria-label="Close recap"
          >
            <X size={24} />
          </button>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="w-full flex flex-col gap-6"
          >
            {/* ── The Card (Exportable PNG Area) ── */}
            <div
              ref={cardRef}
              className="relative w-full overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, #384631 0%, #212A1D 100%)',
                borderRadius: 36,
                boxShadow: '0 30px 60px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.15)',
                fontFamily: 'var(--font-sans, Inter, sans-serif)',
                padding: '32px 28px',
              }}
            >
              {/* Decorative Glows */}
              <div style={{ position: 'absolute', top: '-10%', left: '-20%', width: '70%', height: '50%', background: 'radial-gradient(circle, rgba(167,183,154,0.15) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(40px)' }} />
              <div style={{ position: 'absolute', bottom: '-10%', right: '-20%', width: '70%', height: '50%', background: 'radial-gradient(circle, rgba(212,165,40,0.1) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(40px)' }} />

              <div className="relative z-10 flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2 }}>
                      Session Recap
                    </div>
                    <div style={{ color: '#FFF', fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px' }}>
                      KanTara
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12,
                    padding: '6px 14px',
                    color: '#FFF',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                  }}>
                    {roomCode}
                  </div>
                </div>

                {/* Hero: Top Singer */}
                <div className="flex flex-col items-center text-center mb-8">
                  <div style={{
                    background: 'linear-gradient(135deg, #FFE066 0%, #D4A528 100%)',
                    width: 64,
                    height: 64,
                    borderRadius: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    boxShadow: '0 8px 24px rgba(212,165,40,0.3)',
                    transform: 'rotate(-5deg)'
                  }}>
                    <Trophy size={32} color="#4A3B00" strokeWidth={2.5} />
                  </div>
                  <div style={{ color: '#E4D5A1', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>
                    Top Singer of the Night
                  </div>
                  <div style={{ color: '#FFF', fontSize: 40, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
                    {topSinger}
                  </div>
                </div>

                {/* Glassmorphic Stats */}
                <div className="flex gap-4 mb-8">
                  <div style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 24,
                    padding: '20px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}>
                    <Music size={22} color="#A7B79A" strokeWidth={2.5} style={{ marginBottom: 12 }} />
                    <div style={{ color: '#FFF', fontSize: 32, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>{totalSongs}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Songs</div>
                  </div>
                  <div style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 24,
                    padding: '20px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}>
                    <Clock size={22} color="#A7B79A" strokeWidth={2.5} style={{ marginBottom: 12 }} />
                    <div style={{ color: '#FFF', fontSize: 32, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>{duration}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</div>
                  </div>
                </div>

                {/* Setlist (Max 4 items) */}
                <div>
                  <div style={{ color: '#A7B79A', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12, paddingLeft: 4 }}>
                    Tonight&apos;s Highlights
                  </div>
                  <div className="flex flex-col gap-3">
                    {setlist.slice(0, 4).map((item, i) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: 16,
                          padding: '12px 16px',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, fontWeight: 800, width: 14 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            color: '#FFF',
                            fontSize: 15,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {item.song.title}
                          </div>
                        </div>
                        <div style={{
                          background: '#A7B79A',
                          color: '#1B1C1A',
                          fontSize: 12,
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          padding: '4px 10px',
                          borderRadius: 20,
                        }}>
                          {item.singer_name}
                        </div>
                      </div>
                    ))}
                    {setlist.length > 4 && (
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', paddingTop: 8, fontWeight: 600 }}>
                        + {setlist.length - 4} more songs played
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Watermark */}
                <div style={{ textAlign: 'center', marginTop: 24, color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  kantara.app
                </div>
              </div>
            </div>

            {/* Save Action Button (Outside PNG) */}
            <div className="flex justify-center mt-2 w-full">
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-3 rounded-full py-5 font-black text-[16px] text-[#1B1C1A] transition-all active:scale-95 shadow-xl"
                style={{ background: 'linear-gradient(135deg, #A7B79A 0%, #8A9480 100%)' }}
              >
                <Download size={20} strokeWidth={3} />
                Save Card Image
              </button>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
