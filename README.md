# KantaQueue

A web app for group YouTube karaoke — no app install, no passing one phone around.

**KantaQueue** ("kanta" + queue) is a shared queue layer on top of YouTube. One device is the **host screen** (TV or laptop). Everyone else joins from their phone via QR code, searches songs, and adds to a live queue. The host screen plays through the list automatically.

## The problem it solves

Group karaoke over YouTube usually breaks down because there's no shared, visible queue:

- One phone gets passed around while people search
- Nobody knows who's next — constant "sino sunod?"
- Songs get skipped or forgotten
- The vibe stalls between every song

KantaQueue fixes that. Guests add songs from their own phones in seconds. Everyone sees what's playing and what's up next. The host only needs to skip, pause, or reorder — playback stays on YouTube.

## How it works

| Role | What they do |
|---|---|
| **Host** | Creates a room, shows the QR on the big screen, controls playback |
| **Guest** | Scans QR or enters a room code, picks a nickname, searches and queues songs |

Not a music player. Not a YouTube replacement. Just coordination — search, queue, and track songs while YouTube handles playback.

## Get it running

```bash
git clone https://github.com/Carlwyne-Dev/kantaqueue.git
cd kantaqueue
npm install
cp .env.local.example .env.local   # add your Supabase + YouTube API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js · Supabase (realtime + anonymous auth) · YouTube Data API · YouTube IFrame playback
