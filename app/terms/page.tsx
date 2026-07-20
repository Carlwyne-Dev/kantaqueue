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
    body: 'All song search results and video playback are powered by the YouTube Data API and YouTube IFrame Player. By using KanTara, you also agree to be bound by the YouTube Terms of Service (youtube.com/t/terms). KanTara does not host, store, or redistribute any audio or video content.',
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
      <p className="text-sm text-secondary font-medium uppercase tracking-widest -mt-6 mb-12">
        Last updated: {updated}
      </p>

      <div className="flex flex-col gap-10">
        {sections.map((s, i) => (
          <div key={s.heading} className={`pb-10 ${i < sections.length - 1 ? 'border-b border-outline-variant/30' : ''}`}>
            <h2 className="text-2xl font-bold text-on-background font-headline mb-4">{s.heading}</h2>
            <p className="text-lg text-on-surface leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </DocLayout>
  );
}
