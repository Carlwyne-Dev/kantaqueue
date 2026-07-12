'use client';

import { useRouter } from 'next/navigation';

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.24, background: 'linear-gradient(160deg,#1a1a1a 0%,#2d2d2d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="11" rx="3" fill="white" />
        <path d="M5 10a7 7 0 0 0 14 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <line x1="12" y1="17" x2="12" y2="21" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="8" y1="21" x2="16" y2="21" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function DocLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100svh', background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 40px', borderBottom: '1px solid #f2f2f7', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={28} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.3px' }}>KanTara</span>
        </div>
        <button
          onClick={() => router.push('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#f2f2f7',
            border: 'none',
            borderRadius: 20,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            color: '#1c1c1e',
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '-0.1px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e5e5ea'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#f2f2f7'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Home
        </button>
      </nav>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: 680, width: '100%', margin: '0 auto', padding: '56px 40px 80px', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.8px', margin: '0 0 40px' }}>
          {title}
        </h1>
        {children}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #f2f2f7', padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#c7c7cc' }}>&copy; {new Date().getFullYear()} KanTara</span>
        <div style={{ display: 'flex', gap: 24 }}>
          {[{ label: 'Help', href: '/help' }, { label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }].map(({ label, href }) => (
            <a key={label} href={href} style={{ fontSize: 13, color: '#8e8e93', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#1c1c1e'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#8e8e93'; }}>
              {label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
