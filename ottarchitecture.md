Google ads based SCTE markers 
authorrization based on mail whitelisting and userid whitelisting usign github based files
fixed key for encryption and decryption fetch keys from github making it 
use OEMCrypto module if available 
use aes CENC encryption for content encryption stored key on github is also encrypted always with same key 
thumbnails to be displayed on app are stored in same folder as video_id with anme as thumbnail.* use it and display it for default thumbnail use logo.png present at root of OTT folder  on CDN or github use one generic thumbnail for videos without thumbnail
If video file not found or segment not found show generic error 
allow all android actions like fingerprint and notifications minimize etc
create replica of netflix with all options and theme inspired by A sleek modern UI can blend glassmorphism with a dark, cinematic base, using a deep black or charcoal background layered with semi-transparent, frosted panels that softly blur the content behind them, creating depth without distraction. These glass-like cards and overlays carry subtle borders and diffused shadows, while light blue accents (cyan to electric blue gradients) highlight interactive elements like buttons, progress bars, and focus states, giving a cool, futuristic glow. Typography stays clean and minimal in white or soft gray for contrast, and motion is smooth and fluid—hover states gently illuminate, transitions fade like light through glass, and video thumbnails subtly scale under translucent layers—resulting in an interface that feels premium, immersive, and tech-forward, perfect for a streaming or OTT experience.





# 🧠 1. High-level architecture (your system)

```text
                ┌──────────────┐
                │   Frontend   │ (Web + Android)
                │  (Shaka UI)  │
                └──────┬───────┘
                       │
              Signed URL + Auth
                       │
                ┌──────▼───────┐
                │  Cloudflare  │ (CDN)
                └──────┬───────┘
                       │ (cache miss)
                ┌──────▼───────┐
                │ Cloudflare R2│ (video segments)
                └──────────────┘

Backend (Auth + Keys + Signed URL)
        │
        ├── GitHub (user + key config)
        └── Token service (JWT / signed URLs)
```

---

# 🧩 2. Components you’ll use

## 🎬 Video processing

* FFmpeg → encoding (360p + 720p)
* Shaka Packager → segmentation + encryption

## ☁️ Infra

* Cloudflare R2 → storage
* Cloudflare CDN → delivery

## 🔐 Security (your custom layer)

* AES-128 encryption (CENC-like)
* Signed URLs
* GitHub-based config

## 📱 Player

* Shaka Player (web)
* ExoPlayer (Android)

---

# ⚙️ 3. Video pipeline (step-by-step)

## Step 1: Input video

```bash
input.mp4
```

---

## Step 2: Encode 2 renditions (FFmpeg)

```bash
ffmpeg -i input.mp4 \
  -filter:v:0 scale=640:360 -b:v:0 800k \
  -filter:v:1 scale=1280:720 -b:v:1 2500k \
  -map 0:v -map 0:a \
  -c:v libx264 -c:a aac \
  -f dash \
  output.mpd
```

👉 Or better: generate separate files

---

## Step 3: Package + encrypt (Shaka Packager)

```bash
packager \
  input=360p.mp4,stream=video,output=360p.mp4 \
  input=720p.mp4,stream=video,output=720p.mp4 \
  --enable_raw_key_encryption \
  --keys label=:key_id=<KEY_ID>:key=<KEY> \
  --mpd_output manifest.mpd
```

👉 Key is fetched from GitHub config (explained later)

---

## Step 4: Upload to R2

Structure:

```text
r2://bucket/
  video1/
    manifest.mpd
    360p/
    720p/
    segments...
```

---

# 🔐 4. Your “local DRM” system (important)

You are replacing Widevine with:

### 🔑 AES encryption + key delivery

---

## A. Key storage (GitHub-based)

Create repo:

```text
keys.json
users.json
```

### Example:

```json
{
  "videos": {
    "video1": {
      "key_id": "abc123",
      "key": "0123456789abcdef0123456789abcdef"
    }
  }
}
```

---

## B. User whitelist

```json
{
  "users": [
    {
      "id": "user1",
      "allowed_videos": ["video1"]
    }
  ]
}
```

---

## C. Backend service (VERY IMPORTANT)

You must build a small API:

### Endpoints:

#### 1. `/auth`

* Accept login / SSO
* Return JWT

#### 2. `/get-video`

* Input: user token + video id
* Validate:

  * user exists
  * video allowed
* Return:

  * signed MPD URL
  * decryption key

---

## D. Signed URL generation

```python
import hmac, hashlib, time

def sign_url(path, secret):
    expiry = int(time.time()) + 3600
    signature = hmac.new(secret, f"{path}{expiry}".encode(), hashlib.sha256).hexdigest()
    return f"{path}?exp={expiry}&sig={signature}"
```

---

# 🎥 5. Player flow (important)

## Playback sequence:

1. User logs in
2. Player requests `/get-video`
3. Backend returns:

   * signed MPD URL
   * AES key
4. Player config:

```js
player.configure({
  drm: {
    clearKeys: {
      "key_id": "key_value"
    }
  }
});
```

👉 This is **ClearKey DRM (browser-supported)**
👉 No Widevine license server needed

---

# 📱 6. Android player

Use **ExoPlayer**

* Supports ClearKey
* Supports DASH

Flow:

* Fetch key from backend
* Configure DRM session
* Play MPD

---

# 🎨 7. Netflix-like UI (frontend)

## Features:

### 🎞 Home screen

* Rails:

  * Trending
  * Category-based
* Each item:

  * thumbnail
  * title

---

## 📂 Data source (GitHub JSON)

```json
{
  "videos": [
    {
      "id": "video1",
      "title": "Demo",
      "thumbnail": "thumb.jpg",
      "category": "action"
    }
  ]
}
```

---

## ▶️ Auto-play with signed URL

If:

* signed URL present
* user authorized

👉 autoplay enabled

---

# 🔁 8. Key rotation (you mentioned)

You CAN rotate keys:

### Steps:

1. Update `keys.json` in GitHub
2. Re-package video (needed!)
3. Invalidate CDN cache

---

# ⚠️ 9. Security reality check

## What you get:

* Encrypted segments
* Controlled access
* Token-based auth

## What you DON’T get:

* Hardware security (L1)
* Screen recording protection
* Key protection (client can inspect)

👉 This is **L3-level at best**

---

# 🚀 10. CI/CD pipeline (automation)

## Trigger:

* Upload video → GitHub / local

## Pipeline:

```text
1. Encode (FFmpeg)
2. Fetch key from GitHub
3. Package (Shaka)
4. Upload to R2
5. Update metadata.json
6. Purge CDN cache
```

---

# 🧱 11. Final system summary

## ✅ Fully free stack:

* R2 storage (≤10GB)
* Cloudflare CDN
* Shaka Packager
* Shaka Player
* GitHub config (users + keys)
* Backend (small API)

---

## ❗ Missing (by design)

* Real DRM (Widevine license server)
* Multi-device security
* Advanced analytics

---






now check  D:\Desktop Folders\Android app\OTT\ottarchitecture.md and based on this create full android apk refer D:\Desktop Folders\Android app\Roster dir for ui and theme and how to create apk then create apk use exoplayer it should fetch files from 
https://e63579be88693f2808e148ec66d99bb4.r2.cloudflarestorage.com/ott underthis bucket i ahve multipel folders to fetch segments from use https://raw.githubusercontent.com/pdek1992/ott/main/keys/keys.json to fetch keys to decrypt app should ahve all 