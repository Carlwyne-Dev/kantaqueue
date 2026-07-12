'use client';

import { DocLayout } from '@/app/components/DocLayout';

const sections = [
  {
    heading: 'What we collect',
    body: 'KanTara does not collect personal information. When you use the app, an anonymous session identifier is generated in your browser automatically. We store: room codes, the display nicknames you choose or are assigned, and the songs added to queues. None of this is linked to your real identity.',
  },
  {
    heading: 'Display names',
    body: 'Nicknames (e.g. "Sunny Mango") are auto-assigned from a random pool or customized by you. They are visible to other users in the same room for the duration of that session. Do not use your real name if privacy is a concern.',
  },
  {
    heading: 'Song data',
    body: 'Song titles and YouTube video IDs are cached in our database to speed up future searches across all rooms. This cache is global and anonymous — it is not associated with any specific user, session, or room.',
  },
  {
    heading: 'Third-party services',
    body: 'We use Supabase (supabase.com) for our database, authentication, and real-time features, and the YouTube Data API for song search and playback. Data processed by those services is subject to their respective privacy policies.',
  },
  {
    heading: 'Cookies and local storage',
    body: 'We use browser session storage to remember your nickname within a room session. No tracking cookies or advertising identifiers are used.',
  },
  {
    heading: 'Data retention',
    body: 'Room and queue data is automatically removed after rooms expire (6 hours of inactivity). Cached song metadata (titles, thumbnails, video IDs) may be retained indefinitely to maintain search performance. No personal data is retained.',
  },
  {
    heading: 'Children\'s privacy',
    body: 'KanTara is not directed at children under 13. We do not knowingly collect any information from children under 13.',
  },
  {
    heading: 'Changes to this policy',
    body: 'We may update this Privacy Policy from time to time. We encourage you to review this page periodically. Continued use of the service after changes are posted constitutes acceptance of the updated policy.',
  },
];

export default function PrivacyPage() {
  const updated = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <DocLayout title="Privacy Policy">
      <p style={{ fontSize: 14, color: '#8e8e93', margin: '0 0 40px', letterSpacing: '-0.1px' }}>
        Last updated: {updated}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {sections.map((s, i) => (
          <div key={s.heading} style={{ paddingBottom: 28, marginBottom: 28, borderBottom: i < sections.length - 1 ? '1px solid #f2f2f7' : 'none' }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1c1c1e', margin: '0 0 10px', letterSpacing: '-0.3px' }}>{s.heading}</h2>
            <p style={{ fontSize: 15, color: '#3a3a3c', margin: 0, lineHeight: 1.7, letterSpacing: '-0.1px' }}>{s.body}</p>
          </div>
        ))}
      </div>
    </DocLayout>
  );
}
