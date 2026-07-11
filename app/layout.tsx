import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import AnonSessionProvider from './providers';
import './globals.css';

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'KantaQueue — Karaoke Queue App',
  description:
    'Fix the "passing the phone around" problem at karaoke sessions. Guests scan a QR code, search songs from their own phone, and the host screen handles playback automatically.',
  keywords: ['karaoke', 'queue', 'youtube', 'kanta', 'kantaqueue'],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-white text-[#1C1C1E] antialiased">
        <AnonSessionProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                fontFamily: 'var(--font-geist-sans)',
                borderRadius: '12px',
                fontSize: '14px',
              },
            }}
          />
        </AnonSessionProvider>
      </body>
    </html>
  );
}
