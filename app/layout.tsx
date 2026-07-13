import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Manrope } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import AnonSessionProvider from './providers';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'KanTara — Karaoke Queue App',
  description:
    'Fix the "passing the phone around" problem at karaoke sessions. Guests scan a QR code, search songs from their own phone, and the host screen handles playback automatically.',
  keywords: ['karaoke', 'queue', 'youtube', 'kanta', 'kantara'],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${manrope.variable} h-full`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=block" rel="stylesheet" />
      </head>
      <body className="min-h-full bg-background text-on-background font-body-lg antialiased">
        <AnonSessionProvider>
          {children}
          <Toaster
            position="top-center"
            containerStyle={{ top: 16 }}
            toastOptions={{
              style: {
                fontFamily: 'var(--font-manrope)',
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
