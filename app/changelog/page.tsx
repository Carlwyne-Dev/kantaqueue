'use client';

import { motion } from 'framer-motion';
import { DocLayout } from '@/app/components/DocLayout';

export default function ChangelogPage() {
  const updates = [
    {
      version: 'v1.1.0',
      date: 'July 2026',
      badge: 'New Features',
      title: 'Dedications, Reactions & Leaderboards',
      description: 'Massive update to the KanTara experience! You can now send live emoji reactions to the host screen and add personal song dedications. We also added a live global leaderboard, interactive physics cards, and a new feedback system.',
      features: [
        'Minimalist global leaderboard on the homepage',
        'New "Discover" tab for guests featuring Trending & Popular songs',
        'Interactive, draggable floating cards in the hero section',
        'New in-app Report & Feedback system',
        'Live emoji reactions on the Host screen',
        'Song Dedications: dedicate a song to someone special',
        'Framer Motion layout animations for the active queue',
        'Redesigned "Scan to join" QR modal',
        'Persistent guest nicknames across all rooms',
        'Refined Host TV UI with new cast icon badges'
      ]
    },
    {
      version: 'v1.0.0',
      date: 'July 2026',
      badge: 'Launch',
      title: 'KanTara Officially Launched!',
      description: 'The modern way to run karaoke sessions with your friends. Say goodbye to passing the phone around, fighting over the queue, and accidentally tapping the wrong YouTube video.',
      features: [
        'Real-time guest synchronization',
        'Built-in YouTube Data API search (karaoke-filtered)',
        'Host dashboard with full video controls',
        'Sleek earthy aesthetic & WebGL animated backgrounds'
      ]
    }
  ];

  return (
    <DocLayout title="Changelog">
      <p className="text-lg text-secondary font-medium max-w-lg -mt-8 mb-12 leading-relaxed">
        Stay up to date with the latest features, improvements, and fixes to KanTara.
      </p>

      <div className="space-y-16">
        {updates.map((update, i) => (
          <motion.section 
            key={update.version}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: 0.1 }}
            className="relative"
          >
            <div className="md:grid md:grid-cols-[150px_1fr] md:gap-8 items-start">
              
              {/* Timeline metadata */}
              <div className="mb-4 md:mb-0 md:text-right md:pr-8 md:border-r border-outline-variant/20 h-full relative">
                <div className="md:hidden absolute -left-8 top-1.5 w-3 h-3 bg-primary rounded-full ring-4 ring-background" />
                <div className="hidden md:block absolute -right-[6.5px] top-1.5 w-3 h-3 bg-primary rounded-full ring-4 ring-background" />
                
                <span className="inline-block px-2.5 py-1 bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-widest rounded-lg mb-2">
                  {update.badge}
                </span>
                <p className="text-[14px] font-bold text-secondary uppercase tracking-widest">{update.date}</p>
              </div>

              {/* Content */}
              <div className="bg-surface p-8 rounded-[32px] shadow-sm border border-outline-variant/30 hover:shadow-xl hover:border-outline-variant/50 transition-all duration-500">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-2xl font-black tracking-tight text-on-background">{update.title}</h2>
                  <span className="px-2 py-0.5 bg-surface-container-low text-secondary text-xs font-bold rounded-md font-mono">{update.version}</span>
                </div>
                <p className="text-on-surface leading-relaxed mb-6">
                  {update.description}
                </p>
                
                <ul className="space-y-3">
                  {update.features.map(feat => (
                    <li key={feat} className="flex items-start gap-3 text-on-surface/90 text-[15px] font-medium">
                      <span className="material-symbols-outlined text-[20px] text-primary shrink-0">check_circle</span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.section>
        ))}
      </div>
    </DocLayout>
  );
}
