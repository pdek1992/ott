# VigilSiddhi OTT - Complete Technical Interview Guide

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [End-to-End Pipeline](#end-to-end-pipeline)
3. [Video Transcoding (FFmpeg)](#video-transcoding-ffmpeg)
4. [Shaka Packager & Encryption](#shaka-packager--encryption)
5. [Live Streaming Implementation](#live-streaming-implementation)
6. [Player & DRM (ClearKey)](#player--drm-clearkey)
7. [Web Integration & Authentication](#web-integration--authentication)
8. [Ad Insertion Strategy](#ad-insertion-strategy)
9. [Observability & Metrics](#observability--metrics)
10. [Database Schema (Supabase)](#database-schema-supabase)
11. [Cloudflare Workers & CDN](#cloudflare-workers--cdn)
12. [Challenges & Solutions](#challenges--solutions)
13. [Android App Deployment](#android-app-deployment)

---

## System Architecture Overview

### High-Level Architecture Diagram

```
                    ┌─────────────────────────────────────┐
                    │    User Interface Layer (PWA)       │
                    │  • Web Frontend (Glassmorphic UI)   │
                    │  • Android App (Media3 + Compose)   │
                    │  • Biometric Auth (WebAuthn)        │
                    └───────────┬─────────────────────────┘
                                │
                    ┌───────────▼─────────────────────────┐
                    │  Application Layer (Vercel)         │
                    │  • REST APIs for Auth & License     │
                    │  • Dynamic Catalog from Supabase    │
                    │  • Metrics Ingestion Proxy          │
                    └───────────┬─────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
    ┌───────▼────────┐ ┌───────▼────────┐ ┌──────▼─────────┐
    │   Supabase     │ │ Cloudflare CDN │ │ Grafana Cloud  │
    │  • Users       │ │ • R2 Storage   │ │ • Prometheus   │
    │  • Videos      │ │ • Video Dist   │ │ • Observability│
    │  • Keys        │ │ • DRM License  │ │ • Analytics    │
    │  • Sessions    │ │   Delivery     │ │                │
    └────────────────┘ └────────────────┘ └────────────────┘
```

### Key Components

| Component | Role | Technology |
|-----------|------|-----------|
| **Input Pipeline** | Video ingestion & processing | FFmpeg, Python |
| **Transcoder** | Multi-bitrate renditions | FFmpeg (H.264) |
| **Packager** | DASH segmentation & encryption | Shaka Packager |
| **Storage** | Video segments & manifests | Cloudflare R2 |
| **CDN** | Global content delivery | Cloudflare CDN |
| **Player** | Playback & DRM handling | Shaka Player (Web), ExoPlayer (Android) |
| **Authentication** | User access control | Email/UserID + Supabase Auth |
| **DRM/Encryption** | Content protection | AES-128 CENC + ClearKey |
| **Backend** | API & License Service | Vercel Serverless Functions |
| **Database** | Metadata & user state | Supabase (PostgreSQL) |
| **Observability** | Performance metrics | Grafana Cloud Prometheus |

---

## End-to-End Pipeline

### Complete Video Workflow (From Input to Playback)

```
1. INPUT PHASE
   ├─ Raw video file placed in ./input/ folder
   ├─ Video monitoring daemon detects new file
   └─ File stability check (wait for full upload)

2. TRANSCODING PHASE
   ├─ FFmpeg processes input video
   ├─ Generates multiple renditions:
   │  ├─ 360p @ 800 kbps
   │  ├─ 720p @ 2500 kbps
   │  ├─ 1080p @ 5000 kbps
   │  └─ 2160p @ 12000 kbps
   ├─ H.264 codec with fixed GOP (keyint=60)
   ├─ AAC audio tracks
   └─ Output: ./workdir/{video_id}_{rendition}.mp4

3. PACKAGING PHASE
   ├─ Shaka Packager processes all renditions
   ├─ Generates DASH manifest (MPD)
   ├─ Creates segment files:
   │  ├─ video.mp4 (init segment)
   │  ├─ v_$Number$.m4s (video segments)
   │  ├─ audio.mp4 (init segment)
   │  └─ a_$Number$.m4s (audio segments)
   ├─ Applies AES-128 CENC encryption
   ├─ Encrypts with stored key_id + key
   └─ Output: ./output/{video_id}/ structure

4. ENCRYPTION PHASE
   ├─ Keys fetched from Supabase (video_keys table)
   ├─ CENC protection applied during packaging
   ├─ key_id_hex: unique identifier
   ├─ key_hex: AES-128 decryption key
   └─ Encrypted manifest embedded with key info

5. UPLOAD PHASE
   ├─ All segments uploaded to Cloudflare R2
   ├─ Directory structure preserved:
   │  └─ ott/
   │     └─ {video_id}/
   │        ├─ manifest.mpd
   │        ├─ 360p/
   │        ├─ 720p/
   │        ├─ 1080p/
   │        └─ 2160p/
   ├─ CDN caching enabled globally
   └─ Manifest URLs registered in Supabase

6. CATALOG REGISTRATION
   ├─ Video metadata stored in catalog_videos table
   ├─ Stream URLs stored in video_streams table
   ├─ Keys stored in private.video_keys table
   ├─ API endpoint: /api/admin/sync-video
   └─ Pipeline triggers update automatically

7. CLIENT PHASE - AUTHENTICATION
   ├─ User enters email/userID on login
   ├─ POST /api/auth/login
   ├─ Server validates credentials
   ├─ HttpOnly secure session cookie set
   ├─ Session hash stored in user_sessions table
   └─ User gains access to catalog

8. CLIENT PHASE - CATALOG LOAD
   ├─ GET /api/catalog (fetch all videos)
   ├─ Returns playable videos from catalog_videos
   ├─ Includes video_streams with manifest URLs
   ├─ Client builds UI rails/categories
   └─ Renders Netflix-style browsing interface

9. CLIENT PHASE - PLAYBACK
   ├─ User selects video
   ├─ GET /api/license/{video_slug}
   ├─ Server verifies session
   ├─ Returns DRM keys (key_id_hex, key_hex)
   ├─ Client loads manifest from R2
   ├─ Shaka Player receives keys
   ├─ Player decrypts segments
   └─ Playback starts with ABR adaptation

10. OBSERVABILITY PHASE
    ├─ Client collects QoE metrics (startup, rebuffering, bitrate)
    ├─ POST /api/metrics/ingest
    ├─ Server pushes to Grafana Cloud
    ├─ CDN metrics collected every 60s
    ├─ Node.js daemon: cdn_collector.js
    ├─ Queries Cloudflare GraphQL API
    └─ Builds performance dashboard
```

---

## Video Transcoding (FFmpeg)

### FFmpeg Transcoding Strategy

**File:** `transcoder/transcode.py`

#### Single Command Multi-Output Transcoding

```bash
ffmpeg -y -i input.mp4 \
  -vf "scale=640:360" -c:v libx264 -preset veryfast \
  -b:v 800k -maxrate 800k -bufsize 800k \
  -r 24 -x264-params "keyint=60:min-keyint=60:no-scenecut=1" \
  -c:a aac -profile:v main -level 4.0 -movflags +faststart \
  workdir/video_360p.mp4 \
  \
  -vf "scale=1280:720" -c:v libx264 -preset veryfast \
  -b:v 2500k -maxrate 2500k -bufsize 2500k \
  -r 24 -x264-params "keyint=60:min-keyint=60:no-scenecut=1" \
  -c:a aac -profile:v main -level 4.0 -movflags +faststart \
  workdir/video_720p.mp4 \
  \
  ... (repeat for 1080p, 2160p)
```

#### Key FFmpeg Parameters Explained

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `-y` | Overwrite output files | Required |
| `-i input.mp4` | Input file | Source video |
| `-vf "scale=X:Y"` | Video filter for resolution | `scale=1280:720` |
| `-c:v libx264` | Video codec (H.264) | Industry standard |
| `-preset veryfast` | Encoding speed/quality tradeoff | veryfast, fast, medium, slow |
| `-b:v 2500k` | Video bitrate | Must match maxrate/bufsize for CBR |
| `-maxrate` | Maximum bitrate (rate control) | Same as `-b:v` for strict CBR |
| `-bufsize` | Buffer size (rate control) | Same as `-b:v` for strict CBR |
| `-r 24` | Frame rate (FPS) | Standardize across renditions |
| `-x264-params "keyint=60..."` | **Critical for DASH** | Fixed GOP enables segment alignment |
| `-c:a aac` | Audio codec | AAC is web-standard |
| `-profile:v main` | H.264 profile | Balanced compatibility/efficiency |
| `-level 4.0` | H.264 level | Supports up to 1080p |
| `-movflags +faststart` | Optimize for streaming | Moves metadata to front of file |

#### Why These Parameters Matter

1. **Fixed GOP (keyint=60)**: DASH requires segment boundaries to align across bitrates. A fixed keyframe interval ensures:
   - All renditions have keyframes at same timestamps
   - Segment boundaries are predictable
   - Quality switches are seamless without re-buffering

2. **Constrained VBR (CBR-like)**: `-maxrate` = `-b:v` = `-bufsize` creates CBR behavior:
   - Stable file size
   - Predictable CDN delivery
   - No sudden bitrate spikes

3. **Profile & Level**: `main/4.0` is the "sweet spot":
   - Supports iOS, Android, desktops equally
   - Handles up to 1080p
   - Widely compatible with legacy devices

### Rendition Ladder (Recommended Specifications)

```
360p:  800 kbps   (mobile/low bandwidth)
720p:  2500 kbps  (standard HD)
1080p: 5000 kbps  (full HD)
2160p: 12000 kbps (4K reference)
```

---

## Shaka Packager & Encryption

### Shaka Packager: DASH Segmentation & Encryption

**File:** `run_package_upload.py`, `packager/package.py`

#### Packaging Command Structure

```bash
packager \
  --generate_static_live_mpd \
  --segment_duration 6 \
  --mpd_output manifest.mpd \
  input=360p.mp4,stream=video,output=360p/video.mp4,segment_template=360p/v_$Number$.m4s \
  input=360p.mp4,stream=audio,output=360p/audio.mp4,segment_template=360p/a_$Number$.m4s \
  input=720p.mp4,stream=video,output=720p/video.mp4,segment_template=720p/v_$Number$.m4s \
  input=720p.mp4,stream=audio,output=720p/audio.mp4,segment_template=720p/a_$Number$.m4s \
  --enable_raw_key_encryption \
  --protection_scheme cenc \
  --keys label=:key_id=<KEY_ID_HEX>:key=<KEY_HEX>
```

#### Shaka Packager Options Explained

| Option | Purpose | Values |
|--------|---------|--------|
| `--generate_static_live_mpd` | Generate DASH manifest | For on-demand VOD |
| `--segment_duration` | Length of each segment | 6 seconds (standard) |
| `--mpd_output` | Output manifest filename | `manifest.mpd` |
| `input=<file>,stream=<type>` | Input file + stream type | `stream=video` or `stream=audio` |
| `output=<file>` | Init segment output | `video.mp4` for ftyp+mdat init |
| `segment_template=<pattern>` | Segment naming pattern | `v_$Number$.m4s` auto-increments |
| `--enable_raw_key_encryption` | Enable ClearKey DRM | AES-128 CENC |
| `--protection_scheme` | Encryption standard | `cenc` (Common Encryption) |
| `--keys label=:key_id=X:key=Y` | DRM key specification | Hex format required |

#### Output Structure After Packaging

```
output/
└─ {video_id}/
   ├─ manifest.mpd  (DASH manifest with encryption info)
   ├─ 360p/
   │  ├─ video.mp4  (init segment)
   │  ├─ v_0.m4s    (video segment 1)
   │  ├─ v_1.m4s    (video segment 2)
   │  ├─ audio.mp4  (init segment)
   │  ├─ a_0.m4s    (audio segment 1)
   │  └─ a_1.m4s    (audio segment 2)
   ├─ 720p/
   │  ├─ video.mp4
   │  ├─ v_*.m4s
   │  ├─ audio.mp4
   │  └─ a_*.m4s
   ├─ 1080p/
   │  └─ ...
   └─ 2160p/
      └─ ...
```

#### DASH Manifest (manifest.mpd) - Key Sections

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MPD type="static" mediaPresentationDuration="PT2M34S">
  
  <Period>
    <!-- Encryption/DRM Info -->
    <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011"
                      value="cenc"
                      cenc:default_KID="6f61f0e4-43dd-4d1f-98d5-5a57a4f0e8a4" />
    
    <!-- Adaptation Set: Video -->
    <AdaptationSet mimeType="video/mp4" codecs="avc1.4d4028">
      
      <!-- Representation: 360p -->
      <Representation id="video-360p" width="640" height="360" bandwidth="800000">
        <BaseURL>360p/</BaseURL>
        <SegmentBase indexRange="0-603">
          <Initialization range="0-603" />
        </SegmentBase>
        <SegmentList>
          <SegmentURL media="v_0.m4s" mediaRange="604-" />
          <SegmentURL media="v_1.m4s" ... />
          <!-- Segments auto-generated by packager -->
        </SegmentList>
      </Representation>
      
      <!-- Representation: 720p -->
      <Representation id="video-720p" width="1280" height="720" bandwidth="2500000">
        <!-- ... -->
      </Representation>
    </AdaptationSet>
    
    <!-- Adaptation Set: Audio -->
    <AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2">
      <Representation id="audio-eng" bandwidth="128000">
        <!-- ... -->
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
```

### Encryption Details: AES-128 CENC

**What is CENC?**
- **Common Encryption (CENC)**: MPEG-DASH standard for encrypted media
- Uses AES-128 in Counter Mode (CTR) or CBC Mode
- Enables cross-DRM compatibility (Widevine, PlayReady, ClearKey)

**Key Information in Manifest:**
```xml
<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" 
                  value="cenc"
                  cenc:default_KID="6f61f0e4-43dd-4d1f-98d5-5a57a4f0e8a4" />
```

**ClearKey License Format:**
```json
{
  "keys": [
    {
      "kty": "oct",
      "kid": "6f61f0e4-43dd-4d1f-98d5-5a57a4f0e8a4",  // Key ID
      "k": "AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow"  // Base64Url key
    }
  ]
}
```

---

## Live Streaming Implementation

### How to Achieve Live Streaming with Shaka Packager & FFmpeg

#### Architecture for Live Streaming

```
LIVE INPUT STREAM (RTMP/HLS)
         │
         ▼
    FFmpeg (Transcoder)
    • Receives live feed
    • Re-encodes to multiple bitrates
    • Outputs as DASH segments
         │
         ▼
    Shaka Packager (Live Mode)
    • Generates dynamic MPD
    • Rolling window manifest
    • Keeps only last N segments
         │
         ▼
    Cloudflare R2 (Object Storage)
    • Manifest updates every segment
    • Segments auto-expire (TTL)
    • CDN caches efficiently
         │
         ▼
    Client (Shaka Player)
    • Refreshes manifest every 2-3s
    • Downloads latest segments
    • Adaptive bitrate switching
```

#### Step 1: Live Transcoding with FFmpeg

```bash
# Capture live RTMP input and transcode to multiple bitrates
ffmpeg -i rtmp://source:1935/live/stream \
  # 360p output
  -vf "scale=640:360" -b:v 800k -maxrate 800k -bufsize 800k \
  -c:v libx264 -preset ultrafast \
  -x264-params "keyint=2:min-keyint=2:scenecut=0" \
  -f dash \
  -movflags +frag_keyframe+dash+delay_moov \
  360p_stream.mpd \
  \
  # 720p output  
  -vf "scale=1280:720" -b:v 2500k -maxrate 2500k -bufsize 2500k \
  -c:v libx264 -preset ultrafast \
  -x264-params "keyint=2:min-keyint=2:scenecut=0" \
  -f dash \
  -movflags +frag_keyframe+dash+delay_moov \
  720p_stream.mpd \
  \
  -c:a aac -b:a 128k \
  -ac 2 -ar 44100
```

**Key Live Streaming Parameters:**

| Parameter | For VOD | For Live | Reason |
|-----------|---------|---------|--------|
| `keyint` | 60 | 2 | Frequent keyframes enable faster segment boundaries |
| `preset` | veryfast | ultrafast | Lower latency at cost of compression |
| `segment_duration` | 6s | 2-4s | Shorter segments = lower latency |
| `mpd_type` | static | dynamic | Manifest updates continuously |
| `frag_keyframe` | no | yes | Fragments at every keyframe for live |

#### Step 2: Shaka Packager in Live Mode

```bash
# For LIVE streaming, use --generate_live_mpd instead of --generate_static_live_mpd
packager \
  --generate_live_mpd \
  --segment_duration 2 \
  --mpd_output live_manifest.mpd \
  input=360p_live.mp4,stream=video,output=360p/video.mp4,segment_template=360p/v_$Number$.m4s \
  input=360p_live.mp4,stream=audio,output=360p/audio.mp4,segment_template=360p/a_$Number$.m4s \
  input=720p_live.mp4,stream=video,output=720p/video.mp4,segment_template=720p/v_$Number$.m4s \
  input=720p_live.mp4,stream=audio,output=720p/audio.mp4,segment_template=720p/a_$Number$.m4s \
  --enable_raw_key_encryption \
  --protection_scheme cenc \
  --keys label=:key_id=<LIVE_KEY_ID>:key=<LIVE_KEY> \
  --time_shift_buffer_depth 30  # Keep last 30 seconds in manifest
```

#### Step 3: Live Manifest Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Dynamic manifest - updates every segment duration -->
<MPD type="dynamic" 
     availabilityStartTime="2026-05-20T10:00:00Z"
     publishTime="2026-05-20T10:05:43Z"
     mediaPresentationDuration="PT30S"  <!-- Only last 30s available -->
     minBufferTime="PT3S"
     timeShiftBufferDepth="PT30S">  <!-- Rolling window -->
  
  <Period start="PT0S">
    <!-- Segment list updates dynamically -->
    <SegmentList timescale="1000">
      <!-- Only last N segments available -->
      <SegmentURL media="v_100.m4s" ... />
      <SegmentURL media="v_101.m4s" ... />
      <SegmentURL media="v_102.m4s" ... />  <!-- Latest segment -->
    </SegmentList>
  </Period>
</MPD>
```

**Manifest Update Frequency:**
- VOD: Static (no updates)
- Live: Updated every segment duration (typically every 2-4 seconds)
- Client polls manifest every 2-3 seconds to detect new segments

#### Step 4: Live Streaming with Encryption

```bash
# Generate rotating encryption keys for live streams
# Key rotation every N segments prevents key compromise

# Initial key
KEY_ID_1="abcd1234567890abcd1234567890abcd"
KEY_1="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Packager command
packager \
  --generate_live_mpd \
  --segment_duration 2 \
  --mpd_output live_manifest.mpd \
  input=live.mp4,stream=video,output=segments/video.mp4,segment_template=segments/v_$Number$.m4s \
  input=live.mp4,stream=audio,output=segments/audio.mp4,segment_template=segments/a_$Number$.m4s \
  --enable_raw_key_encryption \
  --protection_scheme cenc \
  --keys label=:key_id=${KEY_ID_1}:key=${KEY_1} \
  --time_shift_buffer_depth 30
```

#### Step 5: Client-Side Live Playback (Shaka Player)

```javascript
// Client receives live stream
async function playLiveStream(liveManifestUrl) {
  await shaka.Player.probeSupport();
  
  // Configure player for live streaming
  const config = {
    streaming: {
      bufferingGoal: 8,        // Buffer 8 seconds of content
      rebufferingGoal: 2,      // Rebuffer when < 2 seconds remain
      lowLatencyMode: true,    // Enable low-latency mode
      maxDisabledTime: 30000,  // Auto-retry after 30s disable
    },
    abr: {
      minHeight: 360,
      maxHeight: 1080,
    },
    manifest: {
      // For live DASH, manifestUpdateInterval controls refresh rate
      manifestUpdateInterval: 2000,  // Update manifest every 2s
      dash: {
        // Helps with drift between client and server clocks
        clockSyncUri: 'https://time.nist.gov/'
      }
    }
  };
  
  player.configure(config);
  
  // Set up DRM for live stream
  player.configure({
    drm: {
      clearKeys: {
        [liveKeyIdHex]: liveKeyHex,
        [liveKeyIdBase64]: liveKeyBase64,
      }
    }
  });
  
  // Load live manifest (dynamic MPD)
  try {
    await player.load(liveManifestUrl);
    video.play();
  } catch (e) {
    console.error('Failed to load live stream:', e);
  }
}

// Client will automatically:
// - Poll manifest every 2-3 seconds
// - Download new segments as they become available
// - Switch bitrates based on network conditions
// - Maintain buffer at ~8 seconds
// - Handle mid-roll ads based on cue points
```

#### Step 6: Live Ad Insertion with SCTE-35 Markers

```bash
# When packaging live stream, include ad cue points
# SCTE-35 markers signal ad breaks to client

ffmpeg -i live_input.ts \
  -c copy \
  -f mpegts \
  -scte35_pid 1234 \
  -mpegts_flags +initial_discontinuity+pat_pmt_at_frames \
  live_output.ts
```

**Live Stream with Ad Cue Points in Manifest:**
```xml
<MPD>
  <Period>
    <!-- Event/Cue Point for ad insertion -->
    <EventStream schemeIdUri="urn:com:dashif:event:2015"
                 timescale="1000">
      <Event presentationTime="30000" duration="15000" id="ad-1">
        <!-- Ad break: 15 seconds starting at 30s -->
      </Event>
      <Event presentationTime="90000" duration="15000" id="ad-2">
        <!-- Another break at 90s -->
      </Event>
    </EventStream>
  </Period>
</MPD>
```

#### Key Challenges & Solutions for Live Streaming

| Challenge | Solution |
|-----------|----------|
| **Latency** | Use ultrafast preset, 2s segments, low-latency mode |
| **Clock Drift** | Use DASH clock synchronization (UTC time sync) |
| **Key Rotation** | Rotate encryption keys every N segments to prevent compromise |
| **Manifest Freshness** | Client polls manifest every 2-3s; server updates every segment |
| **Ad Insertion** | Use SCTE-35 markers in stream; client respects cue points |
| **Failover** | Multiple CDN origins; client retries on failure |
| **Buffering** | Balance buffer size vs. latency (typically 6-12s) |

---

## Player & DRM (ClearKey)

### Shaka Player Configuration & ClearKey Implementation

**File:** `app.js` (lines 775-850+)

#### What is ClearKey?

- **EME Standard**: Encrypted Media Extensions (W3C standard)
- **License Format**: JSON-based key delivery (no license server needed)
- **Use Case**: Development, testing, and open content
- **Limitation**: Keys sent in plaintext (not suitable for high-value content)
- **Benefit**: Simpler than Widevine/PlayReady; works across platforms

#### DRM Key Delivery Flow

```
1. Client loads manifest.mpd
   └─ Manifest contains encrypted streams + default_KID

2. Shaka Player parses manifest
   └─ Detects CENC protection + KID

3. Client fetches license
   ├─ POST /api/license/{video_slug}
   ├─ Server verifies session cookie
   └─ Returns: { keys: [{ kid, k }] }

4. Shaka Player configures DRM
   ├─ Receives key_id and key_value
   ├─ Stores in clearKeys object
   └─ Ready for decryption

5. Player downloads encrypted segments
   ├─ segment.m4s (encrypted)
   ├─ Decrypts with corresponding key
   └─ Sends decrypted frame to video element

6. Browser hardware rendering
   ├─ H.264 decoder (GPU accelerated)
   └─ Displays video on screen
```

#### Shaka Player Setup & Configuration

```javascript
// Initialize Shaka Player
async function ensureShaka() {
  if (state.player) return state.player;

  await shaka.Player.probeSupport();
  
  if (!shaka.Player.isBrowserSupported()) {
    throw new Error("Shaka Player not supported");
  }

  state.player = new shaka.Player(els.videoElement);
  
  // Configure for optimal playback
  state.player.configure({
    streaming: {
      bufferingGoal: 8,           // Buffer 8s of content
      rebufferingGoal: 2,         // Rebuffer if < 2s remain
      maxDisabledTime: 30000,     // Retry disabled stream after 30s
      retryParameters: {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffFactor: 2,
        fuzzFactor: 0.5
      }
    },
    abr: {
      enabled: true,              // Adaptive Bitrate
      minHeight: 360,             // Don't go below 360p
      maxHeight: 1080,            // Don't exceed 1080p on desktop
      bandwidthDowngradeTarget: 0.95,  // Switch down at 95% bandwidth
      bandwidthUpgradeTarget: 0.85,    // Switch up at 85% bandwidth
    },
    drm: {
      retryParameters: {
        maxAttempts: 1,           // License fetch attempts
      }
    }
  });

  // Listen to events
  state.player.addEventListener('error', (event) => {
    console.error('Shaka Error:', event.detail);
  });

  state.player.addEventListener('adaptation', (event) => {
    const track = event.detail;
    console.log(`Switched to ${track.height}p`);
    window.OTT_OBS?.onQualityChange?.(track.height);
  });

  state.player.addEventListener('buffering', (event) => {
    console.log(`Buffering: ${event.buffering}`);
    window.OTT_OBS?.onBuffering?.(event.buffering);
  });

  return state.player;
}
```

#### ClearKey License Delivery

```javascript
// Fetch license from server
async function getClearKeyLicense(videoSlug) {
  try {
    const response = await fetch(`/api/license/${videoSlug}`, {
      credentials: 'include'  // Include session cookie
    });

    if (!response.ok) {
      throw new Error(`License fetch failed: ${response.status}`);
    }

    const license = await response.json();
    
    // License format from server:
    // {
    //   keys: [
    //     { kid: "6f61f0e4-43dd-4d1f-98d5...", k: "AyM1SysPp..." }
    //   ]
    // }
    
    return license;
  } catch (error) {
    console.error('License delivery failed:', error);
    return null;
  }
}
```

#### Configuring DRM Before Playback

```javascript
async function playVideo(video, options = {}) {
  // Step 1: Get DRM license
  const license = await getClearKeyLicense(video.id);
  
  if (!license?.keys || license.keys.length === 0) {
    console.warn('No DRM key available; attempting unencrypted playback');
  }

  // Step 2: Configure player with DRM keys
  // Dual-format: Hex and Base64Url for maximum compatibility
  const clearKeys = {};
  
  license?.keys?.forEach((keyObj) => {
    // Format 1: Hex key_id -> Hex key
    clearKeys[keyObj.kid] = keyObj.k;
    
    // Format 2: Base64Url key_id -> Base64Url key
    // (handles browser-specific EME requirements)
    const base64KID = hexToBase64Url(keyObj.kid);
    const base64K = hexToBase64Url(keyObj.k);
    clearKeys[base64KID] = base64K;
  });

  // Step 3: Apply configuration
  const player = await ensureShaka();
  player.configure({
    drm: {
      clearKeys: clearKeys,
      servers: {
        // ClearKey servers (if any custom license server needed)
      }
    }
  });

  // Step 4: Load manifest
  const manifestUrl = video.manifestUrl || getManifestFromCatalog(video.id);
  
  try {
    await player.load(manifestUrl);
    els.videoElement.play();
  } catch (error) {
    console.error('Playback failed:', error);
    showPlayerError(error.message);
  }
}

// Helper: Convert Hex to Base64Url
function hexToBase64Url(hexString) {
  const binary = Buffer.from(hexString, 'hex').toString('binary');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

#### Error Handling & Fallback

```javascript
// If decryption fails, show user-friendly error
player.addEventListener('error', (event) => {
  const error = event.detail;
  
  if (error.code === shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_WIDEVINE) {
    // Browser doesn't support DRM
    console.error('DRM not supported in this browser');
  } else if (error.code === shaka.util.Error.Code.LICENSE_REQUEST_FAILED) {
    // License server unreachable
    console.error('License service unavailable');
  } else if (error.code === shaka.util.Error.Code.INVALID_LICENSE) {
    // License is invalid/expired
    console.error('License invalid or expired');
  }
  
  // Offer retry option
  els.playerError.hidden = false;
  els.playerError.textContent = 'Playback failed. Refresh page to retry.';
});
```

---

## Web Integration & Authentication

### Authentication Flow (Vercel + Supabase)

**File:** `versel/api/auth/login.js`, `app.js`

#### Complete Authentication Architecture

```
CLIENT (Browser)
    │
    ├─ POST /api/auth/login
    │  { email: "user@example.com", password: "..." }
    │
CLIENT ◄─────── VERCEL SERVER
    │
    ├─ Query: SELECT * FROM access_users WHERE email = ?
    │
    ├─ Verify: bcrypt.compare(password, password_hash)
    │
    ├─ If valid:
    │  ├─ Generate session_token (crypto.randomBytes)
    │  ├─ Hash: session_token_hash = sha256(session_token)
    │  ├─ Store in Supabase: INSERT user_sessions
    │  ├─ Set HttpOnly cookie: ott_session = session_token
    │  └─ Return: { ok: true, user: {...} }
    │
    ├─ If invalid:
    │  └─ Return: { ok: false, error: "Invalid credentials" }
    │
    └─ Cookie stored securely (HttpOnly, Secure, SameSite)
```

#### Session Management Database Schema

```sql
-- User authentication credentials
CREATE TABLE public.access_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT,
  legacy_user_id TEXT,
  display_name TEXT,
  role TEXT CHECK (role IN ('viewer', 'admin')),
  subscription_tier TEXT CHECK (subscription_tier IN ('basic', 'standard', 'premium')),
  status TEXT CHECK (status IN ('active', 'disabled')),
  can_stream BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Secure session tokens (server-side only)
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_user_id UUID NOT NULL REFERENCES access_users(id),
  session_token_hash TEXT NOT NULL UNIQUE,  -- Never store plaintext
  issued_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,          -- TTL: typically 30 days
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,                   -- NULL = active
  ip_hash TEXT,                             -- Track anomalies
  user_agent TEXT
);

-- Password storage with bcrypt
CREATE TABLE public.user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_user_id UUID UNIQUE REFERENCES access_users(id),
  password_hash TEXT NOT NULL,              -- bcrypt hash
  password_algo TEXT DEFAULT 'argon2id',    -- Future-proof
  failed_login_attempts INT DEFAULT 0,      -- Brute-force protection
  locked_until TIMESTAMPTZ,                 -- Temp lockout
  password_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### API Endpoint: `/api/auth/login`

```javascript
// versel/api/auth/login.js
import crypto from 'crypto';
import { supabase } from '../../src/lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email_or_userid, password } = req.body;

  if (!email_or_userid || !password) {
    return res.status(400).json({ error: 'Email/UserID and password required' });
  }

  try {
    // 1. Find user
    const { data: user, error: userError } = await supabase
      .from('access_users')
      .select('id, email, legacy_user_id, display_name, role, subscription_tier, status')
      .or(`email.eq.${email_or_userid},legacy_user_id.eq.${email_or_userid}`)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 2. Check if user is locked out
    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Account disabled' });
    }

    // 3. Fetch password hash
    const { data: creds, error: credsError } = await supabase
      .from('user_credentials')
      .select('password_hash, failed_login_attempts, locked_until')
      .eq('access_user_id', user.id)
      .single();

    if (credsError || !creds) {
      // First login: default password = userID or email prefix
      const defaultPass = user.legacy_user_id || email_or_userid.split('@')[0];
      if (password !== defaultPass) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } else {
      // Check brute-force lockout
      if (creds.locked_until && new Date(creds.locked_until) > new Date()) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, creds.password_hash);
      if (!isValid) {
        // Increment failed attempts
        const newAttempts = creds.failed_login_attempts + 1;
        const lockUntil = newAttempts >= 5 
          ? new Date(Date.now() + 15 * 60000)  // Lock for 15 min after 5 failures
          : null;

        await supabase
          .from('user_credentials')
          .update({
            failed_login_attempts: newAttempts,
            locked_until: lockUntil
          })
          .eq('access_user_id', user.id);

        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Reset failed attempts on success
      await supabase
        .from('user_credentials')
        .update({
          failed_login_attempts: 0,
          locked_until: null
        })
        .eq('access_user_id', user.id);
    }

    // 4. Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days

    // 5. Store session in database
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert({
        access_user_id: user.id,
        session_token_hash: sessionTokenHash,
        expires_at: expiresAt,
        ip_hash: crypto.createHash('sha256')
          .update(req.headers['x-forwarded-for'] || 'unknown')
          .digest('hex'),
        user_agent: req.headers['user-agent']
      });

    if (sessionError) {
      return res.status(500).json({ error: 'Session creation failed' });
    }

    // 6. Set secure HttpOnly cookie
    res.setHeader('Set-Cookie', `ott_session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);

    // 7. Return user info
    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        subscription_tier: user.subscription_tier
      }
    });

  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

#### Session Verification Middleware

```javascript
// versel/middleware.js - Verify session on every request
import { supabase } from './src/lib/supabase.js';
import crypto from 'crypto';

export async function middleware(req) {
  const cookie = parseCookie(req.headers.get('cookie'), 'ott_session');
  
  if (!cookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Hash the session token from cookie
  const sessionTokenHash = crypto
    .createHash('sha256')
    .update(cookie)
    .digest('hex');

  // Verify session in database
  const { data: session, error } = await supabase
    .from('user_sessions')
    .select('access_user_id, expires_at, revoked_at')
    .eq('session_token_hash', sessionTokenHash)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // Check expiration
  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  // Check revocation
  if (session.revoked_at) {
    return NextResponse.json({ error: 'Session revoked' }, { status: 401 });
  }

  // Update last_seen_at
  await supabase
    .from('user_sessions')
    .update({ last_seen_at: new Date() })
    .eq('session_token_hash', sessionTokenHash);

  // Attach user to request
  req.user = { id: session.access_user_id };
  
  return NextResponse.next();
}
```

---

## Ad Insertion Strategy

### Ad Implementation: SCTE-35 & Google IMA

#### Architecture Options

```
Option A: Server-Side Ad Insertion (SSAI)
┌─────────────────────────────────────────┐
│ Origin Server                            │
│ ├─ MPEG-DASH stream                      │
│ ├─ Ad cue points (SCTE-35)               │
│ ├─ Insert ad segments at break points    │
│ └─ Single manifes with ad segments       │
└─────────────────────────────────────────┘
         │
         ├─ CDN (Cloudflare)
         │
CLIENT ◄─ Seamless playback (no client buffering for ads)
         • Pros: Seamless, DRM-friendly, no CORS issues
         • Cons: Server-side complexity, re-encoding costs


Option B: Client-Side Ad Insertion (CSAI)
┌─────────────────────────────────────────┐
│ Manifest with Cue Points                 │
│ ├─ Main content segments                 │
│ └─ Cue points at [30s, 90s, ...]         │
└─────────────────────────────────────────┘
         │
         ├─ Client detects cue point
         │
         ├─ Fetches ad from Ad Server (Google IMA)
         │
         ├─ Pauses main content
         │
         └─ Plays ad until duration elapsed
         
         ├─ Resumes main content
         • Pros: Flexible, dynamic, easy to implement
         • Cons: CORS complexities, brief pause/resume

👉 VigilSiddhi OTT uses CSAI with Google IMA + SCTE-35 markers
```

#### Client-Side Ad Insertion Implementation

```javascript
// app.js - Ad insertion with SCTE-35 markers
const adCuePoints = [30, 90, 210];  // Ad breaks at 30s, 90s, 210s

function initAdManager() {
  // Option 1: Use Google IMA SDK
  const imaConfig = {
    adContainer: els.adContainer,
    player: els.videoElement,
    autoPlayAdBreaks: true,
    disableFlashAds: true
  };

  state.adsLoader = new google.ima.AdsLoader(imaConfig);
  state.adsLoader.addEventListener(
    google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
    onAdsManagerLoaded,
    false
  );

  state.adsManager = null;
  state.imaReady = true;
}

function onPlaybackTimeUpdate() {
  const currentTime = els.videoElement.currentTime;
  
  // Check if we've hit an ad cue point
  for (const cuePoint of state.adCuePoints) {
    if (!state.firedAds.has(cuePoint) && 
        currentTime >= cuePoint && 
        currentTime < cuePoint + 1) {
      
      state.firedAds.add(cuePoint);
      triggerAdBreak(cuePoint);
    }
  }
}

function triggerAdBreak(cuePoint) {
  // Pause main content
  els.videoElement.pause();
  
  // Fetch ad from server
  const adUrl = `${config.googleImaAdTag}&cue=${cuePoint}`;
  
  const request = new google.ima.AdsRequest();
  request.adTagUrl = adUrl;
  request.linearAdSlotWidth = window.innerWidth;
  request.linearAdSlotHeight = window.innerHeight;
  
  state.adsLoader.requestAds(request);
}

function onAdsManagerLoaded(event) {
  state.adsManager = event.getAdsManager(
    els.videoElement,
    new google.ima.ViewMode.FULLSCREEN
  );

  state.adsManager.addEventListener(
    google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
    () => {
      // Ad finished, resume main content
      els.videoElement.play();
      state.adPlaying = false;
    }
  );

  state.adsManager.addEventListener(
    google.ima.AdEvent.Type.STARTED,
    () => {
      state.adPlaying = true;
      console.log('[ADS] Ad started');
    }
  );

  state.adsManager.start();
}
```

#### SCTE-35 Marker Format in Manifest

```xml
<MPD>
  <Period>
    <!-- SCTE-35 cue points for ad breaks -->
    <EventStream schemeIdUri="urn:scte:scte35:2013:bin" timescale="90000">
      
      <!-- Ad break #1: 30 seconds in, 15 second duration -->
      <Event presentationTime="2700000" duration="1350000" id="ad-1">
        <!-- Ad attributes -->
        <Signal>
          SCTE35 binary signal for ad break
        </Signal>
      </Event>
      
      <!-- Ad break #2: 90 seconds in -->
      <Event presentationTime="8100000" duration="1350000" id="ad-2" />
      
      <!-- Ad break #3: 210 seconds in (end roll) -->
      <Event presentationTime="18900000" duration="1350000" id="ad-3" />
      
    </EventStream>
  </Period>
</MPD>
```

#### Ad Server Integration

```javascript
// Google IMA Ad Server Configuration
const adServerConfig = {
  // Dynamic ad URL with video context
  googleImaAdTag: "https://pubads.g.doubleclick.net/gampad/ads?" +
    "iu=/xxxxxx/vigilsiddhi_ott" +
    "&sz=640x480" +
    "&gdfp_req=1" +
    "&output=xml_vast4" +
    "&unviewed_position_start=1" +
    "&env=vtp" +
    "&impl=s" +
    "&cors=opt" +
    "&correlator=[CORRELATOR]",
  
  // Ad break positions (seconds)
  adCuePoints: [30, 90, 210],
  
  // Max ad duration
  maxAdDuration: 30000,  // 30 seconds
  
  // Skip button delay
  skipButtonDelay: 5,  // Show skip after 5 seconds
};

// VAST 4.0 Response Example:
// <VAST version="4.0">
//   <Ad id="ad1">
//     <InLine>
//       <AdSystem>Google DoubleClick</AdSystem>
//       <AdTitle>Sample Ad</AdTitle>
//       <Duration>PT15S</Duration>
//       <MediaFiles>
//         <MediaFile type="video/mp4" bitrate="500" width="640" height="480">
//           https://example.com/ads/sample.mp4
//         </MediaFile>
//       </MediaFiles>
//       <TrackingEvents>
//         <Tracking event="start">...</Tracking>
//         <Tracking event="midpoint">...</Tracking>
//         <Tracking event="complete">...</Tracking>
//       </TrackingEvents>
//     </InLine>
//   </Ad>
// </VAST>
```

#### Handling Ad Errors

```javascript
function onAdsLoadError(event) {
  // Ad failed to load; resume content immediately
  console.warn('[ADS] Load error:', event.getError().getMessage());
  els.videoElement.play();
  state.adPlaying = false;
}

// Timeout: Fail over to content if ad takes too long
const adTimeout = setTimeout(() => {
  if (state.adPlaying) {
    console.warn('[ADS] Timeout; resuming content');
    els.videoElement.play();
    state.adPlaying = false;
  }
}, 30000);

// On resume, clear timeout
state.adsManager.addEventListener(
  google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
  () => {
    clearTimeout(adTimeout);
  }
);
```

---

## Observability & Metrics

### Complete Metrics Pipeline: Client → CDN → Grafana

#### Client-Side QoE Metrics (`observability.js`)

**Collected Metrics:**

| Metric | Description | Example |
|--------|-------------|---------|
| `qoe_startup_ms` | Time from play() to first frame | 2500ms |
| `qoe_initial_bitrate_kbps` | First rendition selected | 800kbps |
| `qoe_bitrate_switches` | Number of quality changes | 5 |
| `qoe_buffering_events` | Rebuffering occurrences | 2 |
| `qoe_total_buffering_ms` | Total time stalled | 5000ms |
| `qoe_average_bitrate_kbps` | Weighted bitrate over session | 1500kbps |
| `qoe_max_bitrate_kbps` | Highest bitrate achieved | 2500kbps |
| `qoe_dropped_frames` | Video frames dropped due to lag | 10 |
| `qoe_error_count` | Total playback errors | 1 |
| `qoe_watch_duration_ms` | How long content was watched | 120000ms |

```javascript
// observability.js aggregation
const metrics = {
  startup_ms: 0,
  initial_bitrate_kbps: 0,
  bitrate_switches: 0,
  buffering_events: 0,
  total_buffering_ms: 0,
  average_bitrate_kbps: 0,
  max_bitrate_kbps: 0,
  dropped_frames: 0,
  error_count: 0,
  watch_duration_ms: 0,
};

// Called when playback starts
window.OTT_OBS.onPlayIntent = function() {
  metrics.startup_time = Date.now();
};

// Called when first frame rendered
window.OTT_OBS.onCanPlay = function() {
  metrics.startup_ms = Date.now() - metrics.startup_time;
  console.log(`[OBS] Startup: ${metrics.startup_ms}ms`);
};

// Called on quality switch
window.OTT_OBS.onQualityChange = function(height) {
  if (metrics.initial_bitrate_kbps === 0) {
    metrics.initial_bitrate_kbps = height;  // Simplified
  }
  metrics.bitrate_switches++;
};

// Called on buffering
window.OTT_OBS.onBuffering = function(isBuffering) {
  if (isBuffering) {
    metrics.buffer_start = Date.now();
  } else {
    metrics.total_buffering_ms += Date.now() - metrics.buffer_start;
    metrics.buffering_events++;
  }
};

// Push to server every 30 seconds
setInterval(async () => {
  const payload = {
    video_id: state.currentVideo?.id,
    device_type: detectDeviceType(),
    network_type: detectNetworkType(),
    timestamp: new Date().toISOString(),
    metrics: metrics
  };

  try {
    await fetch('/api/metrics/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
  } catch (e) {
    console.warn('[OBS] Metrics push failed:', e);
  }
}, 30000);
```

#### Metrics Push to Grafana Cloud

**File:** `versel/api/metrics/ingest.js`

```javascript
// Vercel API receives metrics from client
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { video_id, device_type, network_type, metrics } = req.body;

  // Convert to Prometheus/Influx Line Protocol
  const lines = [];

  // QoE metrics
  lines.push(
    `qoe_startup_ms{video_id="${video_id}",device="${device_type}",network="${network_type}"} ${metrics.startup_ms}`
  );
  lines.push(
    `qoe_buffering_events{video_id="${video_id}",device="${device_type}",network="${network_type}"} ${metrics.buffering_events}`
  );
  lines.push(
    `qoe_total_buffering_ms{video_id="${video_id}",device="${device_type}",network="${network_type}"} ${metrics.total_buffering_ms}`
  );
  lines.push(
    `qoe_bitrate_switches{video_id="${video_id}",device="${device_type}",network="${network_type}"} ${metrics.bitrate_switches}`
  );

  // Push to Grafana Cloud Prometheus
  const promUrl = process.env.GRAFANA_PROM_URL;
  const promUser = process.env.GRAFANA_PROM_USER;
  const promKey = process.env.GRAFANA_PROM_API_KEY;

  try {
    const response = await fetch(promUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${promUser}:${promKey}`).toString('base64')}`,
        'Content-Type': 'text/plain'
      },
      body: lines.join('\n')
    });

    if (!response.ok) {
      console.error(`[METRICS] Push failed: ${response.status}`);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[METRICS] Push error:', error);
    return res.status(500).json({ error: 'Failed to push metrics' });
  }
}
```

#### CDN Metrics Collection (`cdn_collector.js`)

**File:** `cdn_collector.js` (Node.js daemon)

```javascript
// Every 60 seconds, collect CDN metrics from Cloudflare
async function collectMetrics() {
  // Query Cloudflare GraphQL for last 24 hours
  const zoneData = await fetchCFMetrics();

  // Transform and push to Grafana
  const lines = [];

  for (const hour of zoneData.traffic) {
    const timestamp = new Date(hour.dimensions.datetime).getTime() + '000000';
    
    // Raw traffic metrics
    lines.push(
      `cf_requests{zone="${CF_ZONE_ID}"} ${hour.sum.requests} ${timestamp}`
    );
    lines.push(
      `cf_cached_requests{zone="${CF_ZONE_ID}"} ${hour.sum.cachedRequests} ${timestamp}`
    );
    lines.push(
      `cf_bytes_served{zone="${CF_ZONE_ID}"} ${hour.sum.bytes} ${timestamp}`
    );

    // Country-level breakdown
    for (const country of hour.sum.countryMap) {
      lines.push(
        `cf_requests_by_country{zone="${CF_ZONE_ID}",country="${country.clientCountryName}"} ${country.requests} ${timestamp}`
      );
    }

    // Status codes
    for (const status of hour.sum.responseStatusMap) {
      lines.push(
        `cf_responses_by_status{zone="${CF_ZONE_ID}",status="${status.edgeResponseStatus}"} ${status.requests} ${timestamp}`
      );
    }

    // Browser stats
    for (const browser of hour.sum.browserMap) {
      lines.push(
        `cf_pageviews_by_browser{zone="${CF_ZONE_ID}",browser="${browser.uaBrowserFamily}"} ${browser.pageViews} ${timestamp}`
      );
    }

    // Threats (blocked requests)
    lines.push(
      `cf_threats{zone="${CF_ZONE_ID}"} ${hour.sum.threats} ${timestamp}`
    );
  }

  // Push all lines to Grafana Cloud
  await pushToGrafana(lines.join('\n'));
}

// Run every 60 seconds
setInterval(collectMetrics, 60000);
```

#### Grafana Dashboard Queries

```promql
# Client metrics - Startup time 99th percentile
histogram_quantile(0.99, qoe_startup_ms)

# Buffering rate - % of sessions with >1 buffering event
rate(qoe_buffering_events[5m]) / rate(qoe_watch_duration_ms[5m])

# Average bitrate by device type
avg(qoe_average_bitrate_kbps) by (device_type)

# Error rate by video
count(qoe_error_count > 0) / count(qoe_watch_duration_ms) by (video_id)

# CDN hit ratio
cf_cached_requests / cf_requests

# Geographic distribution
cf_requests_by_country

# Top status codes
cf_responses_by_status
```

---

## Database Schema (Supabase)

**File:** `versel/schema.sql`

### Complete Supabase PostgreSQL Schema

```sql
-- 1. USER MANAGEMENT
create table public.access_users (
  id uuid primary key default gen_random_uuid(),
  email citext unique,
  legacy_user_id text unique,
  display_name text,
  role text default 'viewer' check (role in ('viewer', 'admin')),
  subscription_tier text default 'basic' check (subscription_tier in ('basic', 'standard', 'premium')),
  status text default 'active' check (status in ('active', 'disabled')),
  can_stream boolean default true,
  can_view_dashboard boolean default false,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  access_user_id uuid unique references access_users(id),
  password_hash text not null,
  password_algo text default 'argon2id',
  failed_login_attempts int default 0,
  locked_until timestamptz,
  password_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  access_user_id uuid references access_users(id),
  session_token_hash text unique not null,
  issued_at timestamptz default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  ip_hash text,
  user_agent text
);

-- 2. CONTENT CATALOG
create table public.catalog_videos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text default '',
  category text default 'Browse',
  genre text,
  language text,
  year_label text,
  duration_label text,
  maturity_rating text default 'U/A',
  thumbnail_url text,
  poster_url text,
  featured boolean default false,
  playable boolean default true,
  is_reference_stream boolean default false,
  ad_cue_points jsonb default '[]',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.video_streams (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references catalog_videos(id) on delete cascade,
  origin_type text check (origin_type in ('cdn', 'r2', 'external', 'local')),
  manifest_url text not null,
  thumbnail_url text,
  drm_scheme text default 'clearkey',
  is_primary boolean default true,
  is_active boolean default true,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2b. DRM KEYS (PRIVATE - server-side only)
create schema if not exists private;

create table private.video_keys (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.catalog_videos(id) on delete cascade,
  key_id_hex text not null,
  key_hex text not null,
  key_version int default 1,
  is_active boolean default true,
  notes text,
  created_at timestamptz default now(),
  rotated_at timestamptz,
  unique (video_id, key_version)
);

-- 3. RAILS / CATEGORIES
create table public.catalog_rails (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.catalog_rail_items (
  id uuid primary key default gen_random_uuid(),
  rail_id uuid references catalog_rails(id) on delete cascade,
  video_id uuid references public.catalog_videos(id) on delete cascade,
  sort_order int default 0,
  created_at timestamptz default now(),
  unique (rail_id, video_id)
);

-- 4. OBSERVABILITY
create table public.cdn_metrics_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  finished_at timestamptz,
  poll_window_start timestamptz,
  poll_window_end timestamptz,
  success boolean default false,
  request_count bigint,
  cached_request_count bigint,
  bytes_served bigint,
  error_rate numeric,
  payload jsonb default '{}',
  error_message text
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target_type text not null,
  target_id text,
  payload jsonb default '{}',
  created_at timestamptz default now()
);

-- 5. ROW LEVEL SECURITY (RLS)
alter table public.access_users enable row level security;
alter table public.catalog_videos enable row level security;
alter table public.video_streams enable row level security;

create policy catalog_videos_public on public.catalog_videos
  for select to authenticated
  using (playable = true);

create policy video_streams_public on public.video_streams
  for select to authenticated
  using (is_active = true);

-- 6. INDEXES
create index if not exists idx_user_sessions_user on public.user_sessions(access_user_id);
create index if not exists idx_user_sessions_expires on public.user_sessions(expires_at);
create index if not exists idx_catalog_videos_slug on public.catalog_videos(slug);
create index if not exists idx_video_keys_video on private.video_keys(video_id);
create index if not exists idx_cdn_metrics_timestamp on public.cdn_metrics_runs(started_at);
```

---

## Cloudflare Workers & CDN

### CDN Architecture with Cloudflare

#### Multi-Origin Failover Strategy

```
USER REQUEST
    │
    ▼
Cloudflare CDN (ott.prashantkadam.in)
    │
    ├─ Cache HIT? ────► Return from cache
    │
    └─ Cache MISS? ────► Origin Selection:
                        │
                        ├─ Primary: CDN endpoint (ott.prashantkadam.in)
                        │
                        ├─ Fallback 1: R2 bucket (direct URL)
                        │  └─ if primary fails
                        │
                        └─ Fallback 2: GitHub Raw (backup metadata)
                           └─ if R2 fails
```

#### Cloudflare Worker for Request Routing

```javascript
// Cloudflare Worker - caching & failover logic
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Route to appropriate origin
  if (path.includes('/output/')) {
    // Video segments - R2 origin with long TTL
    return handleVideoSegment(request);
  } else if (path.includes('/keys/')) {
    // Metadata files - GitHub Raw origin, short TTL
    return handleMetadata(request);
  } else if (path.includes('/api/')) {
    // API calls - Vercel origin, no cache
    return handleApiCall(request);
  } else {
    // Static assets - Vercel origin, medium TTL
    return handleStatic(request);
  }
}

async function handleVideoSegment(request) {
  const url = new URL(request.url);
  
  // Try R2 origin first
  const r2Origin = 'https://e63579be88693f2808e148ec66d99bb4.r2.cloudflarestorage.com/ott';
  const r2Url = new URL(url.pathname, r2Origin);
  
  try {
    const response = await fetch(r2Url.toString(), {
      cf: {
        cacheTtl: 86400  // Cache for 24 hours
      }
    });
    
    if (response.ok) {
      return response;
    }
  } catch (e) {
    console.error('R2 origin failed:', e);
  }

  // Fallback to GitHub Raw
  const githubOrigin = 'https://raw.githubusercontent.com/pdek1992/ott/main/output';
  const githubUrl = new URL(url.pathname.replace('/output/', ''), githubOrigin);
  
  return fetch(githubUrl.toString(), {
    cf: {
      cacheTtl: 3600  // Cache for 1 hour
    }
  });
}

async function handleMetadata(request) {
  const url = new URL(request.url);
  const githubOrigin = 'https://raw.githubusercontent.com/pdek1992/ott/main/keys';
  const githubUrl = new URL(url.pathname.replace('/keys/', ''), githubOrigin);
  
  return fetch(githubUrl.toString(), {
    cf: {
      cacheTtl: 300  // Cache for 5 minutes (metadata changes frequently)
    }
  });
}

async function handleApiCall(request) {
  // API calls bypass cache
  return fetch(request, {
    cf: {
      cacheTtl: 0
    }
  });
}
```

#### Caching Strategy

| Resource | Origin | TTL | Cache Key |
|----------|--------|-----|-----------|
| Video segments (.m4s) | R2 | 24 hours | URL + video_id |
| Manifests (.mpd) | R2 | 5 minutes | URL (refreshed often) |
| Metadata (.json) | GitHub | 5 minutes | URL |
| API responses | Vercel | 0 (no cache) | N/A |
| Static assets | Vercel | 1 hour | URL |

#### Cache Purging on New Video Upload

```bash
#!/bin/bash
# purge_cache.sh

VIDEO_ID=$1
CF_ZONE_ID=""
CF_API_TOKEN=""

# Purge all segments for this video
curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "files": [
      "https://ott.prashantkadam.in/output/'${VIDEO_ID}'/manifest.mpd",
      "https://ott.prashantkadam.in/output/'${VIDEO_ID}'/360p/*",
      "https://ott.prashantkadam.in/output/'${VIDEO_ID}'/720p/*",
      "https://ott.prashantkadam.in/output/'${VIDEO_ID}'/1080p/*",
      "https://ott.prashantkadam.in/output/'${VIDEO_ID}'/2160p/*"
    ]
  }'
```

---

## Challenges & Solutions

### Major Challenges Faced & How They Were Solved

#### Challenge 1: CORS Issues with Metrics Push

**Problem:**
- Browser cannot directly POST to Grafana Cloud Prometheus endpoint
- Response: `405 Method Not Allowed` (CORS preflight fails)
- Prometheus doesn't support OPTIONS requests

**Solution:**
- Moved metrics aggregation to backend (Vercel API)
- Client POSTs to `/api/metrics/ingest` (same-origin, no CORS)
- Backend proxies to Grafana Cloud with authentication
- Result: Metrics flow: Client → Vercel → Grafana Cloud

#### Challenge 2: Session Management & XSS Prevention

**Problem:**
- Client-side session storage is vulnerable to XSS attacks
- localStorage accessible via JavaScript

**Solution:**
- Implemented HttpOnly secure cookies
- Session token stored server-side (hashed in Supabase)
- Client never sees actual token (only cookie)
- Middleware verifies session hash on each request

#### Challenge 3: Key Distribution & Security

**Problem:**
- Encryption keys cannot be exposed to browsers (DRM requirement)
- But client needs keys to decrypt content

**Solution:**
- Keys stored in private Supabase schema (server-side only)
- Client receives keys only via `/api/license/{video_slug}`
- License API gates key delivery behind session verification
- Keys never persisted to browser cache

#### Challenge 4: Live Streaming Latency

**Problem:**
- Segment duration 6s typical for VOD = 12s minimum latency
- Live streaming requires < 10s end-to-end latency

**Solution:**
- Reduced segment duration from 6s to 2s for live
- Used ultrafast FFmpeg preset (less compression, faster encoding)
- Enabled Shaka low-latency mode on client
- Result: 4-6s latency achievable

#### Challenge 5: Multi-Bitrate Segment Alignment

**Problem:**
- If different bitrates have different GOP sizes, DASH segmentation misaligns
- Causes stalls during quality switches

**Solution:**
- Enforced fixed GOP across all renditions: `keyint=60:min-keyint=60`
- All renditions encode keyframes at same timestamps
- Segment boundaries align perfectly
- Quality switches are seamless

#### Challenge 6: Android App Build Failures

**Problem:**
- Java Heap OutOfMemoryError during dexing
- Missing AndroidX configuration
- Font resource naming issues (AAPT2)

**Solution:**
- Increased Gradle JVM memory: `org.gradle.jvmargs=-Xmx2048m`
- Added `android.useAndroidX=true` to gradle.properties
- Renamed all fonts to lowercase: `inter_regular.ttf` (not `Inter-Bold.ttf`)
- Disabled resource shrinking: `isShrinkResources=false`
- Result: Successful APK builds

#### Challenge 7: Ad Insertion & CORS

**Problem:**
- Google IMA SDK requires CORS-enabled ad server
- Many ad networks don't support CORS

**Solution:**
- Used server-side ad URL rewriting
- Vercel middleware intercepts ad requests
- Adds CORS headers before proxying to ad server
- Or use SCTE-35 markers with local ad decision engine

#### Challenge 8: CDN Cache Invalidation

**Problem:**
- Published videos still show old version for up to 24 hours
- Users report seeing outdated content

**Solution:**
- Implemented cache purge API on video upload
- Call Cloudflare purge endpoint: `POST /zones/{zone_id}/purge_cache`
- Purges all segments + manifest for that video_id
- Manifest also set to 5-min TTL (refreshes sooner)

#### Challenge 9: Encryption Key Rotation

**Problem:**
- If a key is compromised, all videos using that key are affected
- No easy way to update keys across all published content

**Solution:**
- Stored key versions in Supabase: `key_version` field
- Packaging allows specifying which key_version to use
- Client-side license API returns current active key
- To rotate: mark old key as `is_active=false`, create new key
- Existing streams can point to new key without re-encoding

---

## Android App Deployment

### Android App Architecture & Build Process

**File:** `ANDROID_WORKFLOW.md`, `AndroidApp/build.gradle.kts`

#### App Stack

```
┌─────────────────────────────────────┐
│ User Interface (Jetpack Compose)    │
│ • Material Design 3 theme           │
│ • Glassmorphic cards                │
│ • Responsive layouts                │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│ Media3 ExoPlayer                    │
│ • DASH playback                     │
│ • DRM: ClearKey + Widevine          │
│ • Adaptive bitrate                  │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│ Networking & Auth                   │
│ • Retrofit (HTTP client)            │
│ • Ktor (websockets)                 │
│ • Session management                │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│ Local Storage                       │
│ • SharedPreferences                 │
│ • DataStore (encrypted)             │
│ • Cache for offline playback        │
└─────────────────────────────────────┘
```

#### Build Configuration

```kotlin
// build.gradle.kts
android {
  compileSdk = 34
  minSdk = 26      // Android 8.0 (API 26)
  targetSdk = 34
  
  buildTypes {
    debug {
      debuggable = true
      minifyEnabled = false
    }
    release {
      debuggable = false
      minifyEnabled = true
      isShrinkResources = false  // Don't shrink resources (font issue)
      proguardFiles("proguard-rules.pro")
    }
  }
}

dependencies {
  // Media3 (modern ExoPlayer)
  implementation("androidx.media3:media3-exoplayer:1.1.0")
  implementation("androidx.media3:media3-exoplayer-dash:1.1.0")
  implementation("androidx.media3:media3-ui:1.1.0")
  
  // Jetpack Compose
  implementation("androidx.compose.ui:ui:1.5.0")
  implementation("androidx.compose.material3:material3:1.1.0")
  
  // Authentication
  implementation("androidx.biometric:biometric:1.1.0")
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
  
  // Networking
  implementation("com.squareup.retrofit2:retrofit:2.9.0")
  implementation("com.squareup.okhttp3:okhttp:4.10.0")
}
```

#### AndroidManifest.xml Configuration

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  
  <!-- Permissions -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
  <uses-permission android:name="android.permission.USE_BIOMETRIC" />
  
  <application>
    <!-- Activities -->
    <activity
        android:name=".MainActivity"
        android:exported="true"
        android:theme="@style/Theme.Material3.DayNight">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    
    <!-- Media controls for lock screen -->
    <service
        android:name=".MediaPlaybackService"
        android:foregroundServiceType="mediaPlayback"
        android:exported="false" />
    
    <!-- App icon -->
    <application android:icon="@drawable/logo" />
  </application>
</manifest>
```

#### Video Playback in Android

```kotlin
// MainActivity.kt - ExoPlayer setup
class MainActivity : AppCompatActivity() {
  
  private lateinit var player: ExoPlayer
  
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Initialize ExoPlayer with DRM
    val mediaSource = buildDashMediaSource()
    
    player = ExoPlayer.Builder(this)
      .setTrackSelector(AdaptiveTrackSelector(this))
      .build()
    
    // Configure for DASH + ClearKey
    player.setMediaSource(mediaSource)
    player.prepare()
    
    // Listen to player events
    player.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(playbackState: Int) {
        when (playbackState) {
          Player.STATE_READY -> sendMetric("playback_ready")
          Player.STATE_BUFFERING -> sendMetric("playback_buffering")
          Player.STATE_ENDED -> sendMetric("playback_ended")
        }
      }
      
      override fun onPlayerError(error: PlaybackException) {
        Log.e("ExoPlayer", "Playback error: ${error.message}")
        sendMetric("playback_error", error.errorCode)
      }
    })
  }
  
  private fun buildDashMediaSource(): MediaSource {
    val httpDataSourceFactory = OkHttpDataSource.Factory()
      .setUserAgent("VigilSiddhi-OTT-Android")
    
    val dashSourceFactory = DashMediaSource.Factory(httpDataSourceFactory)
    
    // Load manifest
    val mediaItem = MediaItem.Builder()
      .setUri("https://ott.prashantkadam.in/output/video_id/manifest.mpd")
      .setDrmConfiguration(
        MediaItem.DrmConfiguration.Builder(C.CLEARKEY_UUID)
          .setLicenseUri("https://api.vercel.app/api/license/video_id")
          .build()
      )
      .build()
    
    return dashSourceFactory.createMediaSource(mediaItem)
  }
  
  private fun sendMetric(eventName: String, value: Any? = null) {
    // Post QoE metrics to server
    val payload = mapOf(
      "event" to eventName,
      "video_id" to currentVideoId,
      "device_type" to "android",
      "timestamp" to System.currentTimeMillis(),
      "value" to value
    )
    
    lifecycleScope.launch {
      try {
        apiService.postMetric(payload)
      } catch (e: Exception) {
        Log.w("Metrics", "Failed to send metric: ${e.message}")
      }
    }
  }
}
```

#### Building & Deploying the APK

```bash
# Navigate to Android project
cd AndroidApp

# Build debug APK
./gradlew assembleDebug

# Build release APK (production)
./gradlew assembleRelease

# Output locations
Debug:   AndroidApp/app/build/outputs/apk/debug/app-debug.apk
Release: AndroidApp/app/build/outputs/apk/release/app-release-unsigned.apk

# Sign release APK (required for Play Store)
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore my.keystore \
  app-release-unsigned.apk my_alias

# Align APK
zipalign -v 4 app-release-unsigned.apk app-release-aligned.apk

# Verify signature
jarsigner -verify -verbose -certs app-release-aligned.apk
```

#### Observability in Android

```kotlin
// Collect QoE metrics in Android
class ObservabilityManager {
  
  fun trackStartup(videoId: String) {
    startTime = SystemClock.elapsedRealtimeNanos()
  }
  
  fun trackCanPlay() {
    val startupMs = (SystemClock.elapsedRealtimeNanos() - startTime) / 1_000_000
    sendMetric("qoe_startup_ms", startupMs, mapOf(
      "video_id" to currentVideoId,
      "device_type" to "android",
      "os_version" to Build.VERSION.SDK_INT
    ))
  }
  
  fun trackBuffering(isBuffering: Boolean) {
    if (isBuffering) {
      bufferingStart = SystemClock.elapsedRealtimeNanos()
    } else {
      val bufferingMs = (SystemClock.elapsedRealtimeNanos() - bufferingStart) / 1_000_000
      totalBufferingMs += bufferingMs
    }
  }
  
  private fun sendMetric(name: String, value: Any, labels: Map<String, Any>) {
    val payload = mapOf(
      "metric" to name,
      "value" to value,
      "labels" to labels,
      "timestamp" to System.currentTimeMillis()
    )
    
    apiService.postMetric(payload)
  }
}
```

---

## Interview Summary - Key Talking Points

### 1. Architecture Highlights
- **Decoupled Design**: Static frontend + dynamic backend separation
- **Multi-Origin Failover**: R2 → GitHub Raw fallback strategy
- **Serverless Backend**: Vercel functions for auth, license, metrics
- **Encrypted Keys**: Private Supabase schema for DRM protection

### 2. Video Pipeline
- FFmpeg multi-bitrate transcoding (360p to 4K)
- Fixed GOP alignment for seamless DASH segmentation
- Shaka Packager with AES-128 CENC encryption
- R2 storage with Cloudflare CDN distribution

### 3. Live Streaming
- 2-second segments with ultrafast FFmpeg preset
- Dynamic DASH manifest with rolling window buffer
- SCTE-35 markers for ad insertion
- Low-latency client configuration in Shaka Player

### 4. DRM & Encryption
- ClearKey for development/testing simplicity
- Server-gated license delivery via session verification
- Dual-format key support (Hex + Base64Url) for browser compatibility
- Key rotation capability without re-encoding

### 5. Player & Playback
- Shaka Player for web (DASH + ClearKey)
- Media3 ExoPlayer for Android
- Adaptive bitrate (ABR) based on network conditions
- Error recovery with automatic retry

### 6. Authentication & Authorization
- Email/UserID login with Supabase auth
- HttpOnly secure cookies (no XSS vulnerability)
- Session token hashing (tokens never stored plaintext)
- Role-based access (viewer, admin)

### 7. Ad Insertion
- Client-side ad insertion (CSAI) with Google IMA
- SCTE-35 cue points in manifest for break detection
- Fallback on ad server failure (resume content immediately)
- Flexible ad duration handling

### 8. Observability & Metrics
- Client-side QoE collection (startup, buffering, bitrate)
- Backend proxy to Grafana Cloud (solves CORS)
- CDN metrics from Cloudflare GraphQL every 60s
- Real-time dashboard with geographic breakdowns

### 9. Database & Storage
- Supabase PostgreSQL for all persistent data
- Row-level security (RLS) for multi-tenant isolation
- Private schema for sensitive keys
- Indexes optimized for common queries

### 10. Mobile Deployment
- Jetpack Compose UI framework
- Media3 ExoPlayer for DASH/DRM
- Biometric authentication (fingerprint)
- Offline capabilities with local cache

### 11. Challenges Solved
- CORS proxy for metrics ingestion
- Session security with HttpOnly cookies
- Multi-bitrate GOP alignment
- Live streaming latency reduction
- Android build failures (memory, fonts)

### 12. Production Readiness
- Cache purging on video upload
- Key rotation without content re-encoding
- Brute-force protection with account lockout
- Comprehensive error handling & fallbacks

---

**End of Interview Guide**

This document covers the complete end-to-end OTT platform architecture, from raw video input through final playback on web and mobile clients, with emphasis on live streaming, encryption, and observability.
