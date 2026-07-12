'use client';

import { DocLayout } from '@/app/components/DocLayout';

const sections = [
  {
    heading: 'Use of the Service',
    body: 'KanTara is a free tool for coordinating karaoke queues at private gatherings. You may use it for personal, non-commercial purposes. You agree not to misuse the service or use it in any way that violates applicable laws.',
  },
  {
    heading: 'No Account Required',
    body: 'KanTara uses anonymous browser sessions — no email address or password is collected or required. Sessions are temporary and scoped to your browser tab.',
  },
  {
    heading: 'YouTube Content',
    body: 'All song search results and video playback are powered by the YouTube Data API and YouTube IFrame Player. Your use of YouTube content is subject to the YouTube Terms of Service (youtube.com/t/terms). KanTara does not host, store, or redistribute any audio or video content.',
  },
  {
    heading: 'Service Availability',
    body: 'We make no guarantee of uptime, reliability, or availability. Rooms expire automatically after 6 hours of inactivity. We reserve the right to modify or discontinue the service at any time without notice.',
  },
  {
    heading: 'Disclaimer of Warranties',
    body: 'KanTara is provided "as is" and "as available," without any warranty of any kind — express, implied, or statutory. We do not warrant that the service will be error-free, uninterrupted, or free of harmful components.',
  },
  {
    heading: 'Limitation of Liability',
    body: 'To the fullest extent permitted by law, KanTara and its creators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of — or inability to use — the service.',
  },
  {
    heading: 'Changes to These Terms',
    body: 'We may update these Terms of Use from time to time. Continued use of the service after changes are posted constitutes your acceptance of the revised terms.',
  },
];

export default function TermsPage() {
  const updated = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <DocLayout title="Terms of Use">
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
