'use client';

import { DocLayout } from '@/app/components/DocLayout';

const faqs = [
  {
    q: 'How do I start a room?',
    a: 'Tap "Start a Room" on the home screen. A QR code and 5-character room code will be shown — share either with your guests to let them join.',
  },
  {
    q: 'How do guests join?',
    a: 'Guests open the app on their phone, tap "Join a Room", and type the room code — or simply scan the QR code with their camera. No app install required.',
  },
  {
    q: 'How many songs can I queue?',
    a: 'Each guest can have up to 3 pending songs in the queue at one time. Once one of their songs plays, that slot opens back up and they can add another.',
  },
  {
    q: 'Can I remove a song I added?',
    a: 'Yes. Open the "My Songs" tab, then tap the remove button on any of your songs that haven\'t played yet.',
  },
  {
    q: 'What happens if a video is unavailable?',
    a: 'If a song becomes unavailable on YouTube after being cached (deleted, made private, or region-blocked), the host screen will automatically skip it and move to the next song.',
  },
  {
    q: 'How long do rooms last?',
    a: 'Rooms automatically expire after 6 hours of inactivity — no cleanup needed. Any queued songs and guest records are removed with it.',
  },
  {
    q: 'Does it work on a TV?',
    a: 'Yes. Open the host screen on any browser connected to your TV or laptop. The video plays with the queue panel docked to the side, and a smaller QR code stays visible for late joiners.',
  },
  {
    q: 'Does the host need to keep their screen on?',
    a: 'The app requests a Wake Lock to keep the host screen on during an active session. For long parties, keep the device plugged in.',
  },
];

function FAQ({ q, a, isLast }: { q: string; a: string; isLast: boolean }) {
  return (
    <div style={{ paddingBottom: isLast ? 0 : 24, marginBottom: isLast ? 0 : 24, borderBottom: isLast ? 'none' : '1px solid #f2f2f7' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1c1e', margin: '0 0 8px', letterSpacing: '-0.2px' }}>{q}</p>
      <p style={{ fontSize: 15, color: '#3a3a3c', margin: 0, lineHeight: 1.65, letterSpacing: '-0.1px' }}>{a}</p>
    </div>
  );
}

export default function HelpPage() {
  return (
    <DocLayout title="Help">
      <div style={{ background: '#f9f9fb', borderRadius: 20, border: '1px solid #f0f0f5', padding: '8px 28px' }}>
        {faqs.map((item, i) => (
          <div key={item.q} style={{ padding: '24px 0', borderBottom: i < faqs.length - 1 ? '1px solid #f2f2f7' : 'none' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1c1e', margin: '0 0 8px', letterSpacing: '-0.2px' }}>{item.q}</p>
            <p style={{ fontSize: 15, color: '#3a3a3c', margin: 0, lineHeight: 1.65, letterSpacing: '-0.1px' }}>{item.a}</p>
          </div>
        ))}
      </div>
    </DocLayout>
  );
}
