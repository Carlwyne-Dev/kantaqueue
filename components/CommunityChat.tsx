'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSupabaseClient } from '@/lib/supabase';

interface ChatMessage {
  id: string;
  nickname: string;
  message: string;
  created_at: string;
}

export default function CommunityChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeUsers, setActiveUsers] = useState(1);
  const [nickname, setNickname] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('kq_global_nickname') ?? '';
  });
  const [hasNickname, setHasNickname] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('kq_global_nickname');
  });
  const [inputMsg, setInputMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = getSupabaseClient();

  // Fetch initial messages and subscribe
  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      const { data } = await supabase
        .from('community_chat')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (mounted && data) {
        setMessages(data.reverse() as ChatMessage[]);
      }
    }

    loadMessages();

    const channel = supabase
      .channel('public:community_chat')
      .on('presence', { event: 'sync' }, () => {
        if (mounted) {
          const state = channel.presenceState();
          setActiveUsers(Object.keys(state).length);
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_chat' },
        (payload) => {
          if (mounted) {
            const newMsg = payload.new as ChatMessage;
            setMessages((prev) => [...prev, newMsg]);
            
            // If closed, increment unread
            setIsOpen((open) => {
              if (!open) {
                setUnreadCount((prev) => prev + 1);
              }
              return open;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'community_chat' },
        () => {
          // When any message is deleted, re-fetch to sync all clients
          if (mounted) {
            supabase
              .from('community_chat')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(50)
              .then(({ data }) => {
                if (mounted) setMessages((data ?? []).reverse() as ChatMessage[]);
              });
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Handle opening
  function toggleOpen() {
    if (!isOpen) setUnreadCount(0);
    setIsOpen(!isOpen);
  }

  // Handle save nickname
  function handleSaveNickname(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = nickname.trim();
    if (!cleanName) return;
    localStorage.setItem('kq_global_nickname', cleanName);
    setNickname(cleanName);
    setHasNickname(true);
  }

  // Handle send message
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMsg.trim() || !hasNickname) return;
    
    setIsLoading(true);
    const msg = inputMsg.trim();
    setInputMsg('');
    
    await supabase.from('community_chat').insert({
      nickname: displayNickname,
      message: msg
    });
    
    setIsLoading(false);
  }

  // Admin check
  const isAdmin = nickname === 'xyuuki18';
  const displayNickname = isAdmin ? 'Admin' : nickname;

  // Clear chat (admin only)
  async function handleClearChat() {
    if (!isAdmin) return;
    if (!confirm('Clear all community chat messages?')) return;
    await supabase.from('community_chat').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setMessages([]);
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="mb-4 w-[320px] h-[450px] sm:w-[350px] bg-white/90 backdrop-blur-xl border border-outline-variant/30 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-primary px-5 py-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-white text-[20px]">forum</span>
                <h3 className="text-white font-bold tracking-wide text-sm">Community Chat</h3>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={handleClearChat}
                    title="Clear all messages"
                    className="text-on-primary/80 hover:text-on-primary bg-transparent border-none cursor-pointer p-1"
                  >
                    <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                  </button>
                )}
                <button 
                  onClick={toggleOpen}
                  className="text-on-primary/80 hover:text-on-primary bg-transparent border-none cursor-pointer p-1"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface/50">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-secondary/50">
                  <span className="material-symbols-outlined text-[32px] mb-2">waving_hand</span>
                  <p className="text-sm font-medium">No messages yet.<br/>Be the first to say hi!</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMsgAdmin = msg.nickname === 'Admin' || msg.nickname === '👑 Admin';
                  const isMe = msg.nickname === nickname || (isAdmin && isMsgAdmin);
                  const showHeader = idx === 0 || messages[idx - 1].nickname !== msg.nickname;
                  
                  return (
                    <motion.div 
                      key={msg.id} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      {showHeader && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 px-1 flex items-center gap-1 ${
                          isMsgAdmin ? 'text-amber-600' : isMe ? 'text-primary/70' : 'text-secondary/60'
                        }`}>
                          {isMsgAdmin ? 'Admin' : msg.nickname}
                        </span>
                      )}
                      <div className={`px-4 py-2.5 max-w-[85%] break-words shadow-sm ${
                        isMsgAdmin
                          ? 'bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl rounded-tl-sm'
                          : isMe 
                          ? 'bg-primary text-on-primary rounded-2xl rounded-tr-sm' 
                          : 'bg-white text-on-surface border border-outline-variant/20 rounded-2xl rounded-tl-sm'
                      }`}>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                      <span className="text-[9px] text-secondary/40 mt-1 px-1">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-outline-variant/20">
              {!hasNickname ? (
                <form onSubmit={handleSaveNickname} className="flex gap-2">
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Enter a nickname..."
                    maxLength={20}
                    className="flex-1 bg-surface-container px-4 py-2.5 rounded-xl text-sm outline-none border border-transparent focus:border-primary/30 transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={!nickname.trim()}
                    className="bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-sm hover:brightness-95 transition-all disabled:opacity-50"
                  >
                    Join
                  </button>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold text-secondary/60 uppercase tracking-wider">
                      Chatting as: <span className={isAdmin ? 'text-amber-600' : 'text-primary'}>{displayNickname}</span>
                    </span>
                    <button 
                      onClick={() => setHasNickname(false)} 
                      className="text-[10px] font-bold text-primary hover:underline bg-transparent border-none cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                  <form onSubmit={handleSend} className="flex gap-2 items-end">
                    <textarea
                      value={inputMsg}
                      onChange={(e) => setInputMsg(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e);
                        }
                      }}
                      placeholder="Type a message..."
                      rows={1}
                      className="flex-1 resize-none bg-surface-container px-4 py-3 rounded-xl text-sm outline-none border border-transparent focus:border-primary/30 transition-all max-h-[100px]"
                    />
                    <button 
                      type="submit"
                      disabled={!inputMsg.trim() || isLoading}
                      className="bg-primary text-on-primary w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center hover:brightness-95 transition-all disabled:opacity-50 border-none cursor-pointer"
                    >
                      {isLoading ? (
                         <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      ) : (
                        <span className="material-symbols-outlined text-[20px]">send</span>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        className="w-14 h-14 rounded-full bg-primary text-on-primary shadow-[0_8px_24px_rgba(84,99,74,0.4)] flex items-center justify-center border-none cursor-pointer relative"
      >
        <span className="material-symbols-outlined text-[28px]">
          {isOpen ? 'keyboard_arrow_down' : 'chat'}
        </span>
        {!isOpen && unreadCount > 0 && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -left-1 w-6 h-6 bg-white text-primary text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-primary/10 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.div>
        )}
      </motion.button>
    </div>
  );
}
