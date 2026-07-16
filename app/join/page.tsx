'use client';

import { use, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSupabaseClient, ensureAnonSession } from '@/lib/supabase';
import { generateUniqueNickname } from '@/lib/nickname';
import { Scanner } from '@yudiel/react-qr-scanner';
import { motion } from 'framer-motion';

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
  const [showScanner, setShowScanner] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const autoJoinedRef = useRef(false);

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
          .from('rooms').select('id').eq('code', initialCode.toUpperCase()).in('status', ['active', 'paused']).maybeSingle();
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

  useEffect(() => {
    if (initialCode && initialCode.length === 5 && !generatingNick && nickname && !autoJoinedRef.current) {
      autoJoinedRef.current = true;
      handleJoin();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, generatingNick, nickname]);

  async function handleJoin(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
        .from('rooms').select('id, status').eq('code', trimCode).in('status', ['active', 'paused']).maybeSingle();

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

      localStorage.setItem(`kq_nickname_${trimCode}`, trimName);
      router.push(`/room/${trimCode}/guest`);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const codeChars = code.split('').concat(Array(5 - code.length).fill(''));

  return (
    <div className="min-h-screen flex flex-col text-on-background bg-surface bg-[radial-gradient(circle_at_10%_20%,rgba(215,232,201,0.15)_0%,rgba(251,249,245,0)_40%),radial-gradient(circle_at_90%_80%,rgba(167,183,154,0.1)_0%,rgba(251,249,245,0)_50%)]">
      {/* Header */}
      <header className="w-full max-w-[1200px] mx-auto px-6 py-8 flex justify-between items-center z-10">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="KanTara Logo" className="w-7 h-7 rounded-md" />
          <span className="text-xl font-extrabold tracking-tight font-headline-sm text-on-background">KanTara</span>
        </div>
        <button 
          onClick={() => router.push('/')}
          className="px-6 py-2.5 rounded-full border border-outline-variant bg-white/50 text-[14px] font-semibold hover:bg-white hover:shadow-sm transition-all flex items-center gap-2 text-on-background"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Home
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center px-6 py-12 z-10">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Left Column (Hero Info) */}
          <motion.div
            className="space-y-10"
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="bg-[#A7B79A] inline-flex p-4 rounded-[20px] shadow-lg shadow-[#A7B79A]/20"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 280, damping: 20 }}
            >
              <span className="material-symbols-outlined text-white text-[32px]">group_add</span>
            </motion.div>
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="text-5xl lg:text-6xl font-extrabold leading-[1.05] font-display-lg text-on-background tracking-tight">
                Join the<br/>karaoke room.
              </h1>
              <p className="text-lg text-secondary max-w-md font-medium">
                Enter the 5-character code shown on the host screen, pick a name, and you&apos;re in.
              </p>
            </motion.div>
            
            {/* Features Checklist */}
            <ul className="space-y-5">
              {[
                'No app install needed',
                'Search and queue songs from your phone',
                'See the live queue in real time'
              ].map((text, i) => (
                <motion.li
                  key={i}
                  className="flex items-center gap-4"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#A7B79A]/15 flex items-center justify-center text-[#A7B79A]">
                    <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                  </span>
                  <span className="font-semibold text-on-background/80 text-[16px]">{text}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Right Column (Form) */}
          <motion.div
            className="bg-[#F2F1EC] p-8 lg:p-12 rounded-[32px] border border-white/40 shadow-[0_20px_40px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.02)]"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <form className="space-y-10" onSubmit={handleJoin}>
              
              {/* Room Code Input Group */}
              <div className="space-y-4">
                <label className="block text-[12px] font-bold tracking-[0.15em] text-secondary/60 uppercase font-headline-sm">Room Code</label>
                <div 
                  className="grid grid-cols-5 gap-3 relative cursor-text"
                  onClick={() => codeInputRef.current?.focus()}
                >
                  {codeChars.map((char, index) => {
                    const isActive = isFocused && (code.length === index || (code.length === 5 && index === 4));
                    return (
                      <div 
                        key={index}
                        className={`w-full aspect-square flex items-center justify-center text-2xl font-bold border rounded-2xl transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.02)] ${
                          isActive
                            ? 'border-[#A7B79A] bg-white text-on-background ring-4 ring-[#A7B79A]/30 scale-[1.02]'
                            : char 
                              ? 'border-[#A7B79A] bg-white text-on-background ring-2 ring-[#A7B79A]/10' 
                              : 'border-outline-variant/30 bg-white/80 text-secondary/30'
                        }`}
                      >
                        {char || '•'}
                      </div>
                    );
                  })}
                  <input
                    ref={codeInputRef}
                    id="room-code"
                    type="text"
                    maxLength={5}
                    value={code}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="absolute inset-0 opacity-0 cursor-text z-10 w-full h-full"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Name Input Group */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="block text-[12px] font-bold tracking-[0.15em] text-secondary/60 uppercase font-headline-sm">Your Name</label>
                  <span className="text-[10px] text-secondary/60 font-semibold">auto-assigned, feel free to change</span>
                </div>
                <div className="relative">
                  {generatingNick ? (
                    <div className="w-full px-7 py-5 border border-outline-variant/30 bg-white/80 rounded-2xl flex items-center gap-3">
                       <span className="w-4 h-4 border-2 border-[#A7B79A] border-t-transparent rounded-full animate-spin"></span>
                       <span className="text-secondary/60 text-lg font-bold">Picking a name...</span>
                    </div>
                  ) : (
                    <input 
                      type="text" 
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="w-full px-7 py-5 border border-outline-variant/30 bg-white/80 rounded-2xl text-lg font-bold shadow-[0_4px_12px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.02)] focus:ring-2 focus:ring-[#A7B79A] focus:border-[#A7B79A] focus:bg-white transition-all outline-none text-on-background"
                    />
                  )}
                </div>
                <p className="text-[12px] text-secondary/70 italic font-medium">You&apos;ll appear in the queue with this name.</p>
              </div>

              {/* CTA Button */}
              <div className="flex gap-4">
                <motion.button 
                  type="submit"
                  disabled={loading || generatingNick}
                  whileHover={{ scale: 1.04, boxShadow: '0 20px 40px rgba(84,99,74,0.35)' }}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-5 bg-[#54634a] text-white rounded-[20px] text-[18px] font-bold shadow-xl shadow-[#54634a]/20 font-display-lg tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Joining...
                    </>
                  ) : 'Join Room'}
                </motion.button>
                <button 
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="p-5 bg-white border border-outline-variant/30 hover:bg-surface-container-low text-secondary rounded-[20px] shadow-[0_4px_12px_rgba(0,0,0,0.03)] transition-all transform active:scale-[0.98] flex items-center justify-center shrink-0 group"
                  aria-label="Scan QR Code"
                >
                  <span className="material-symbols-outlined text-[28px] group-hover:text-primary transition-colors">qr_code_scanner</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </main>

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-[32px] overflow-hidden shadow-2xl relative">
            <div className="p-6 text-center border-b border-outline-variant/10">
              <h3 className="text-xl font-bold text-on-surface">Scan Room QR</h3>
              <p className="text-sm text-secondary mt-1">Point your camera at the host screen.</p>
            </div>
            
            <div className="bg-black aspect-square relative overflow-hidden">
              <Scanner
                components={{ finder: false }}
                onScan={async (result) => {
                  if (result && result.length > 0) {
                    const text = result[0].rawValue;
                    let scannedCode = text;
                    // If it's a URL, extract the code
                    if (text.includes('/join?code=')) {
                      scannedCode = text.split('/join?code=')[1].substring(0, 5);
                    } else if (text.includes('/room/')) {
                      const match = text.match(/\/room\/([A-Z0-9]{5})/i);
                      if (match) scannedCode = match[1];
                    }
                    if (scannedCode && scannedCode.length === 5) {
                      const upper = scannedCode.toUpperCase();
                      setCode(upper);
                      setShowScanner(false);
                      toast.success('QR scanned! Joining room...');
                      // Auto-join directly — set code then call handleJoin with it inline
                      const trimName = nickname.trim();
                      if (!trimName) {
                        toast.error('Please enter a nickname first.');
                        return;
                      }
                      setLoading(true);
                      try {
                        const userId = await ensureAnonSession();
                        if (!userId) { toast.error('Could not start session. Please refresh.'); return; }
                        const supabase = getSupabaseClient();
                        const { data: room, error: roomErr } = await supabase
                          .from('rooms').select('id, status').eq('code', upper).eq('status', 'active').maybeSingle();
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
                          if (guestErr) { toast.error('Failed to join room. Try again.'); return; }
                        }
                        sessionStorage.setItem(`kq_nickname_${upper}`, trimName);
                        router.push(`/room/${upper}/guest`);
                      } catch (err) {
                        console.error(err);
                        toast.error('Something went wrong.');
                      } finally {
                        setLoading(false);
                      }
                    } else {
                      toast.error('Invalid QR code format.');
                      setShowScanner(false);
                    }
                  }
                }}
              />
              {/* Custom Sage Green Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[70%] h-[70%] rounded-3xl relative shadow-[0_0_0_1000px_rgba(0,0,0,0.4)]">
                   {/* Corner accents */}
                   <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-[#A7B79A] rounded-tl-3xl" />
                   <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-[#A7B79A] rounded-tr-3xl" />
                   <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-[#A7B79A] rounded-bl-3xl" />
                   <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-[#A7B79A] rounded-br-3xl" />
                   
                   {/* Scanning line animation */}
                   <div 
                     className="absolute left-0 right-0 h-1 bg-[#A7B79A] shadow-[0_0_8px_2px_rgba(167,183,154,0.8)]" 
                     style={{ animation: 'qr-scan 2.5s ease-in-out infinite' }}
                   />
                </div>
              </div>
            </div>
            
            <div className="p-4">
              <button 
                onClick={() => setShowScanner(false)}
                className="w-full py-4 rounded-2xl font-bold text-secondary bg-surface-container-low hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-10 text-center text-secondary/50 text-[14px] font-medium z-10">
        © {new Date().getFullYear()} Kantara Karaoke. Sing your heart out.
      </footer>
    </div>
  );
}
