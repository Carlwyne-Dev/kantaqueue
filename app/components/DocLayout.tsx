'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FeedbackModal } from '@/app/components/FeedbackModal';

export function DocLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background font-body flex flex-col text-on-background">

      {/* Top blur edge — separate from nav, blurs content on scroll */}
      <div
        className="fixed top-0 left-0 right-0 h-20 z-40 pointer-events-none"
        style={{
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 100%)',
        }}
      />
      {/* Nav — transparent, sits on top of the blur edge */}
      <nav className="fixed top-0 w-full z-50">
        <div className="flex items-center px-[64px] py-3.5 max-md:px-[20px]">
          {/* Logo — left */}
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.png" alt="KanTara Logo" className="w-8 h-8 rounded-lg" />
            <Link href="/" className="text-[20px] font-extrabold tracking-tighter font-headline-sm hover:opacity-80 transition-opacity">KanTara</Link>
          </div>
          
          {/* Back Button — right */}
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-secondary hover:bg-surface-container-low px-3 py-1.5 rounded-lg transition-colors text-[13px] font-semibold cursor-pointer border-none bg-transparent"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-secondary">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Home
            </button>
          </div>
        </div>
      </nav>

      {/* Spacer to push content down below fixed nav */}
      <div className="h-20" />

      <motion.main 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 w-full max-w-3xl mx-auto px-6 py-16 md:py-24"
      >
        <h1 className="text-4xl md:text-5xl font-black font-headline tracking-tighter mb-12 text-on-background">
          {title}
        </h1>
        <div className="flex flex-col gap-10">
          {children}
        </div>
      </motion.main>

      {/* Footer */}
      <footer className="border-t border-outline-variant/30 py-8 px-6 md:px-16 bg-surface-container-lowest">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm font-semibold text-secondary/70 tracking-wide uppercase">&copy; {new Date().getFullYear()} KanTara</span>
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3">
            {[
              { label: 'Terms', href: '/terms' }, 
              { label: 'Privacy', href: '/privacy' },
              { label: 'Help', href: '/help' }, 
              { label: 'Updates', href: '/changelog' }
            ].map(({ label, href }) => (
              <Link key={label} href={href} className="text-sm font-bold text-secondary/80 hover:text-primary transition-colors">
                {label}
              </Link>
            ))}
            <span className="hidden md:block w-px h-4 bg-outline-variant/40" />
            <button
              onClick={() => setFeedbackOpen(true)}
              className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/70 transition-colors cursor-pointer border-none bg-transparent"
            >
              <span className="material-symbols-outlined text-[16px]">flag</span>
              Report / Feedback
            </button>
          </div>
        </div>
      </footer>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
