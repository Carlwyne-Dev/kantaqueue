# KanTara Architecture & User Flow Diagrams

> [!TIP]
> Copy each code block below into **[Mermaid Live Editor](https://mermaid.live/)** and click **"Save as PNG"** to export the image for your YouTube API audit form.

---

## 1. Architecture Diagram

```mermaid
graph TD
    classDef frontend fill:#A7B79A,stroke:#6e8b5e,stroke-width:2px,color:#fff
    classDef backend fill:#1C1C1C,stroke:#4CAF50,stroke-width:2px,color:#fff
    classDef google fill:#ba1a1a,stroke:#8a1313,stroke-width:2px,color:#fff
    classDef cache fill:#5c6bc0,stroke:#3949ab,stroke-width:2px,color:#fff

    User(("User Device\nMobile or Desktop"))

    subgraph Vercel["Vercel — Next.js Frontend"]
        App["Next.js App\nReact Pages and API Routes"]:::frontend
        LocalStore["Browser Session Storage\nNickname and User ID"]:::frontend
    end

    subgraph Supabase["Supabase — Backend"]
        Auth["Anonymous Auth\nSupabase Auth"]:::backend
        DB[("PostgreSQL Database\nrooms, songs, guests,\nqueue_items, community_chat")]:::backend
        Realtime["Supabase Realtime\nWebSocket Channels"]:::backend
    end

    subgraph Google["Google Services"]
        YTSearch["YouTube Data API v3\nSong Search and Metadata"]:::google
        YTPlayer["YouTube IFrame Player API\nVideo Playback"]:::google
    end

    SongCache["Global Song Cache\nSongs table in Supabase"]:::cache

    User <-->|HTTP and UI| App
    App <--> LocalStore
    App -->|Sign in anonymously| Auth
    App <-->|REST: Read and Write rooms, queue_items, guests| DB
    App <-->|WebSocket: Live queue sync and room status| Realtime
    App -->|Search queries| YTSearch
    App -->|Embed video player| YTPlayer
    YTSearch -.->|Video ID, title, thumbnail, duration| App
    DB -.->|Cache Fallback when quota exhausted| SongCache
    SongCache -.-> App
```

---

## 2. User Flow Diagram

```mermaid
flowchart TD
    classDef startend fill:#1b1c1a,stroke:#333,color:#fff
    classDef decision fill:#A7B79A,stroke:#6e8b5e,color:#fff
    classDef process fill:#f5f3ef,stroke:#bbb,color:#333
    classDef youtube fill:#ba1a1a,stroke:#8a1313,color:#fff
    classDef db fill:#1C1C1C,stroke:#4CAF50,color:#fff

    Start((Start)):::startend --> Landing[User visits KanTara landing page]:::process
    Landing --> Role{Choose a role}:::decision

    %% HOST FLOW
    Role -->|Host| HostAuth[Host signs in anonymously\nvia Supabase Auth]:::db
    HostAuth --> HostCreate[App generates unique\n5-character room code\ne.g. KJ48X]:::process
    HostCreate --> HostScreen[Host opens the TV or\nProjector display view]:::process
    HostScreen --> ShowQR[QR code is displayed on screen\nfor guests to scan]:::process
    ShowQR --> WaitSongs[Realtime channel listens\nfor queue updates]:::db
    WaitSongs --> PlaySong[Host plays next song via\nYouTube IFrame Player API]:::youtube
    PlaySong --> MarkPlayed[Song marked as played\nin Supabase database]:::db
    MarkPlayed --> WaitSongs

    %% GUEST FLOW
    Role -->|Guest| GuestJoin[Guest scans QR code or\nmanually enters 5-character code]:::process
    GuestJoin --> GuestAuth[Guest signs in anonymously\nvia Supabase Auth]:::db
    GuestAuth --> JoinRoom[Guest record inserted\ninto guests table]:::db
    JoinRoom --> SearchSong[Guest types a song name\ninto search box]:::process
    SearchSong --> CacheCheck{Song cached in\nSupabase songs table?}:::decision
    CacheCheck -->|Yes, cache hit| SelectSong:::process
    CacheCheck -->|No, call API| YTApi[YouTube Data API v3\nsearches for the song]:::youtube
    YTApi -->|Returns results| CacheSave[Result saved to\nglobal songs cache]:::db
    CacheSave --> SelectSong[Guest picks a video\nfrom search results]:::process
    SelectSong --> AddQueue[queue_items row inserted\ninto Supabase database]:::db
    AddQueue --> RealtimeSync[Realtime WebSocket pushes\nupdate to Host screen]:::db
    RealtimeSync --> WaitTurn[Guest sees estimated\nwait time and position]:::process
    WaitTurn --> End((Done)):::startend
```
