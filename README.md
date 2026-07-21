# KanTara

**Group karaoke, zero friction.** One screen, everyone's phone, one shared queue.

KanTara (*"kanta"* — to sing, + *"tara"* — let's go) is a real-time shared queue layer on top of YouTube. One device is the **host screen** (TV or laptop). Everyone else joins from their phone via QR code or a 5-character room code — no app install, no account, no passing one phone around.

---

## The problem it solves

Group karaoke over YouTube usually breaks down because there's no shared, visible queue:

- One phone gets passed around while people search
- Nobody knows who's next — constant *"sino sunod?"*
- Songs get skipped or forgotten
- The vibe stalls between every song

KanTara fixes that. Guests add songs from their own phones in seconds. Everyone sees what's playing and what's up next. The host only needs to skip, pause, or reorder — playback stays on YouTube.

---

## How it works

| Role | What they do |
|---|---|
| **Host** | Creates a room, shows the QR on the big screen, controls playback |
| **Guest** | Scans QR or enters the 5-character room code, picks a nickname, searches and queues songs |

Not a music player. Not a YouTube replacement. Just coordination — search, queue, and track songs while YouTube handles playback.

---

## Features

**For Guests**
- Join a room instantly by scanning a QR code or typing a 5-character code
- Search for any song via YouTube — results load fast thanks to a global song cache
- Add up to 3 songs to the queue at once
- Dedicate a song to someone
- See your estimated wait time in real time
- Remove your own queued songs

**For Hosts**
- Generate a unique room with a single tap
- Display a scannable QR code on any screen
- See the full live queue update in real time
- Skip, pause, or reorder songs
- Playback is handled natively by the YouTube IFrame Player

**Smart Search**
- Searches are cached globally across all rooms — if someone has searched for a song before, it loads instantly without hitting the YouTube API
- When the YouTube daily quota is reached, the app automatically falls back to the Community Library — a growing collection of songs previously discovered by KanTara users

**Community Chat**
- A live chat widget on the landing page lets anyone drop a message in real time
- Powered by Supabase Realtime WebSockets

**Song Safety**
- Songs are filtered before playback — unembeddable or region-locked videos are blocked before they ever reach the queue, so the host screen never hits a "Video unavailable" wall

---

## Stack

Next.js · Supabase (Realtime, PostgreSQL, Anonymous Auth) · YouTube Data API v3 · YouTube IFrame Player API · Framer Motion
