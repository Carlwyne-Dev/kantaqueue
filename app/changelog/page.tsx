'use client';

import { motion } from 'framer-motion';
import { DocLayout } from '@/app/components/DocLayout';

export default function ChangelogPage() {
  const updates = [
    {
      version: 'v1.2.0',
      date: 'July 2026',
      badge: 'New Features',
      title: 'Community Chat & Smarter Search',
      description: 'KanTara gets more social! We\'ve added a live community chat on the landing page so you can connect with other music lovers anytime. We also made search smarter with better error handling and a fallback library when the daily search limit is reached.',
      changes: [
        {
          type: 'New',
          items: [
            'Live Community Chat — say hi, share thoughts, and connect with other KanTara users directly from the homepage',
            'KanTara Community Library — when the daily YouTube search limit is reached, browse songs the community has already discovered',
          ]
        },
        {
          type: 'Improvements',
          items: [
            'Lightning fast search — KanTara now instantly remembers songs you and the community have searched for before, making future searches completely instant',
            'Smarter song filtering — blocked and unavailable songs are now automatically filtered out before they can reach your queue',
            'Improved host layout — the host sidebar now scales perfectly for smaller laptop and tablet screens',
            'Smoother animations — the library panel now slides in and out with polished, buttery transitions',
          ]
        },
        {
          type: 'Fixes',
          items: [
            'Fixed a visual glitch where the search loading spinner would occasionally get stuck after clearing the search box',
          ]
        }
      ]
    },
    {
      version: 'v1.1.0',
      date: 'July 2026',
      badge: 'Update',
      title: 'Dedications, Reactions & Leaderboards',
      description: 'Massive update to the KanTara experience! You can now send live emoji reactions to the host screen and add personal song dedications. We also added a live global leaderboard, interactive physics cards, and a new feedback system.',
      changes: [
        {
          type: 'New',
          items: [
            'Live emoji reactions — guests can now send real-time emoji reactions directly to the Host screen',
            'Song Dedications — easily dedicate your requested song to someone special in the room',
            'Discover tab — guests can now quickly browse and add Trending and Popular songs',
            'In-app feedback — easily share your thoughts, report issues, and request features directly in the app',
            'Global leaderboard — see the most requested songs across all KanTara rooms right on the homepage',
          ]
        },
        {
          type: 'Improvements',
          items: [
            'Playful landing page — interact with draggable, physics-based floating cards in the hero section',
            'Fluid queue animations — the active song queue now animates smoothly as songs are added, moved, and played',
            'Beautiful QR scanner — completely redesigned the "Scan to join" modal for a sleeker, more modern look',
            'Remembered nicknames — your guest nickname is now automatically saved across all rooms you join',
            'Polished Host UI — the Host screen now looks even better on large TVs with refined styling and new cast icons'
          ]
        }
      ]
    },
    {
      version: 'v1.0.0',
      date: 'July 2026',
      badge: 'Launch',
      title: 'KanTara Officially Launched!',
      description: 'The modern way to run karaoke sessions with your friends. Say goodbye to passing the phone around, fighting over the queue, and accidentally tapping the wrong YouTube video.',
      changes: [
        {
          type: 'Launch Features',
          items: [
            'Real-time guest synchronization',
            'Built-in YouTube Data API search (karaoke-filtered)',
            'Host dashboard with full video controls',
            'Sleek earthy aesthetic & WebGL animated backgrounds'
          ]
        }
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
                
                <div className="space-y-6">
                  {update.changes.map((section) => (
                    <div key={section.type}>
                      <h3 className="text-[13px] font-bold text-secondary uppercase tracking-widest mb-3">{section.type}</h3>
                      <ul className="space-y-3">
                        {section.items.map(item => (
                          <li key={item} className="flex items-start gap-3 text-on-surface/90 text-[15px] font-medium">
                            <span className="material-symbols-outlined text-[20px] text-primary shrink-0">
                              {section.type === 'Fixes' ? 'build' : section.type === 'Improvements' ? 'upgrade' : 'check_circle'}
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>
        ))}
      </div>
    </DocLayout>
  );
}
