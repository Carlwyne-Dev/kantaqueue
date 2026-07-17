'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type FeedbackType = 'bug' | 'feedback' | 'suggestion';

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>('feedback');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!message.trim() || message.trim().length < 10) {
      setError('Please write at least 10 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message: message.trim(), page: window.location.pathname }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const typeOptions: { value: FeedbackType; label: string; icon: string }[] = [
    { value: 'bug', label: 'Bug Report', icon: 'bug_report' },
    { value: 'feedback', label: 'Feedback', icon: 'chat_bubble' },
    { value: 'suggestion', label: 'Suggestion', icon: 'lightbulb' },
  ];

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
        className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 md:max-w-md w-full"
      >
        <div className="bg-white md:rounded-[28px] rounded-t-[28px] shadow-2xl overflow-hidden border border-outline-variant/20">
          {!submitted ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-outline-variant/15">
                <div>
                  <h2 className="text-[17px] font-black tracking-tight text-on-surface">Send us a message</h2>
                  <p className="text-[12px] text-secondary font-medium mt-0.5">Goes straight to the dev team</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">close</span>
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Type selector */}
                <div className="flex gap-2">
                  {typeOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setType(opt.value)}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl text-[11px] font-bold transition-all border ${
                        type === opt.value
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-surface-container-low text-secondary border-transparent hover:border-outline-variant/30'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <div>
                  <textarea
                    value={message}
                    onChange={e => { setMessage(e.target.value); setError(''); }}
                    placeholder={
                      type === 'bug'
                        ? "Describe what happened and what you expected..."
                        : type === 'suggestion'
                        ? "What feature would make KanTara better?"
                        : "Tell us what you think..."
                    }
                    rows={4}
                    className="w-full rounded-2xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface placeholder:text-secondary/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all font-body"
                  />
                  {error && <p className="text-[12px] text-red-500 mt-1 font-medium">{error}</p>}
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={loading || !message.trim()}
                  className="w-full py-3 bg-primary text-on-primary font-bold rounded-2xl text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105 transition-all active:scale-[0.98]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                      Sending...
                    </span>
                  ) : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="p-10 flex flex-col items-center text-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.4 }}
                className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[32px] text-primary">check_circle</span>
              </motion.div>
              <h2 className="text-[18px] font-black tracking-tight text-on-surface">Thanks!</h2>
              <p className="text-[13px] text-secondary font-medium leading-relaxed">
                Your message has been received.<br />We read every one.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2 bg-surface-container-low text-secondary font-bold rounded-full text-[13px] hover:bg-surface-container transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
