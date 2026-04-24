# OTT Glass Web App

Static GitHub Pages app that mirrors the Android OTT proof of concept:

- GitHub Raw allowlists for email and user ID authorization.
- GitHub Raw `keys.json` as a demo ClearKey license source.
- DASH playback through Shaka Player, with CDN, R2, and local `output/` manifest fallbacks.
- AES-CENC/ClearKey support through browser EME.
- Optional encrypted JSON wrapper decrypted with the fixed demo passphrase in `config.js`.
- Thumbnail discovery from `<cdn>/<video_id>/thumbnail.*`, then `<r2>/<video_id>/thumbnail.*`, then `assets/logo.png`.
- SCTE-35 marker hooks plus optional Google IMA ad tag support.
- PWA install, notifications, media session actions, fullscreen, picture-in-picture, and WebAuthn device unlock where the browser supports them.

## Run Locally

From this folder:

```powershell
python -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Configure

Edit `config.js`:

- `allowedEmailsUrl`, `allowedUserIdsUrl`, `descriptionsUrl`, `mpdMappingUrl`, `keysUrl`
- `cdnBaseUrl`
- `r2BaseUrl`
- `localOutputBaseUrl` for the copied packaged DASH folders
- `googleImaAdTag` if you want real Google IMA ads instead of the local demo ad overlay
- `fixedKeyPassphrase` if you change the encrypted JSON passphrase

Do not put R2 secret credentials in this folder. The browser app only needs public CDN/R2 object URLs.

This folder also includes local copies from the OTT root:

```text
keys/
output/
assets/logo.png
```

The app tries GitHub Raw/CDN first, then these local files.

## Plain Or Encrypted JSON

These app JSON files can be plaintext or encrypted with the same wrapper:

- `allowed_emails.json`
- `allowed_userids.json`
- `description.json`
- `mpd_mapping.json`
- `keys.json`

Plain `keys.json` example:

```json
{
  "demo_video": {
    "key_id": "ed0102030405060708090a0b0c0d0e0f",
    "key": "f0e0d0c0b0a090807060504030201000"
  }
}
```

Encrypted wrapper format for any file above:

```json
{
  "encrypted": true,
  "algorithm": "AES-GCM",
  "iv": "base64url-or-hex",
  "ciphertext": "base64url-or-hex"
}
```

The decrypted payload should be the same plaintext JSON shape the file normally has. For `keys.json`, `{ "videos": { ... } }` and `{ "keys": { ... } }` are also accepted.

## GitHub Pages

Commit the `web-ott` folder and publish it with GitHub Pages. If you publish this folder as a project subdirectory, all local assets use relative paths and should continue to work.

## Demo Security Note

This is a working demo client, not real DRM security. ClearKey and client-side fixed-key decryption are inspectable in the browser. For production, move authorization, key release, signed URLs, and ad decisioning to a server-side service or a managed DRM provider.
