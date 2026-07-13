'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function DocLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();

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

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-4xl md:text-5xl font-black font-headline tracking-tighter mb-12 text-on-background">
          {title}
        </h1>
        <div className="flex flex-col gap-10">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-outline-variant/30 py-8 px-6 md:px-16 flex flex-col md:flex-row items-center justify-between gap-6 bg-surface-container-lowest">
        <span className="text-sm font-semibold text-secondary/70 tracking-wide uppercase">&copy; {new Date().getFullYear()} KanTara</span>
        <div className="flex gap-8">
          {[{ label: 'Help', href: '/help' }, { label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }].map(({ label, href }) => (
            <Link key={label} href={href} className="text-sm font-bold text-secondary/80 hover:text-primary transition-colors">
              {label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
