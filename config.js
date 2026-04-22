window.OTT_CONFIG = {
  appName: "OTT Glass",

  // Public GitHub Raw files act as the demo auth/key/license source.
  githubBaseUrl: "https://raw.githubusercontent.com/pdek1992/ott/main",
  allowedEmailsUrl: "https://raw.githubusercontent.com/pdek1992/ott/main/keys/allowed_emails.json",
  allowedUserIdsUrl: "https://raw.githubusercontent.com/pdek1992/ott/main/keys/allowed_userids.json",
  descriptionsUrl: "https://raw.githubusercontent.com/pdek1992/ott/main/keys/description.json",
  mpdMappingUrl: "https://raw.githubusercontent.com/pdek1992/ott/main/keys/mpd_mapping.json",
  keysUrl: "https://raw.githubusercontent.com/pdek1992/ott/main/keys/keys.json",

  // Local copies are used as fallbacks when this folder is hosted by itself.
  localAllowedEmailsUrl: "./keys/allowed_emails.json",
  localAllowedUserIdsUrl: "./keys/allowed_userids.json",
  localDescriptionsUrl: "./keys/description.json",
  localMpdMappingUrl: "./keys/mpd_mapping.json",
  localKeysUrl: "./keys/keys.json",

  // Public playback origins. Do not put R2 secret keys in a browser app.
  cdnBaseUrl: "https://ott.prashantkadam.in",
  r2BaseUrl: "https://e63579be88693f2808e148ec66d99bb4.r2.cloudflarestorage.com/ott",
  localOutputBaseUrl: "./output",

  logoUrl: "./assets/logo.png",
  thumbnailFileNames: ["thumbnail.webp", "thumbnail.jpg", "thumbnail.jpeg", "thumbnail.png"],

  // Demo-only fixed passphrase used to decrypt an encrypted keys.json wrapper.
  // Supported encrypted wrapper shape:
  // { "encrypted": true, "algorithm": "AES-GCM", "iv": "...", "ciphertext": "..." }
  fixedKeyPassphrase: "OTT_DEMO_FIXED_KEY_2026",

  // Optional Google IMA tag. Leave empty to show a local demo ad break when SCTE markers fire.
  googleImaAdTag: "",

  // Local cue points let you test ad break behavior even when the MPD has no SCTE-35 emsg markers.
  demoAdCuePoints: [30, 90],

  demoAllowedEmails: ["pdek1991@gmail.com", "pdek1992@gmail.com"],
  demoAllowedUserIds: ["pdek1991", "admin"],

  featuredVideoId: "free",

  staticVideos: [
    {
      id: "free",
      title: "Free Preview",
      description: "A DASH sample wired for GitHub Raw key delivery and CDN playback.",
      category: "Featured",
      year: "2026",
      duration: "2m"
    },
    {
      id: "tmkoc",
      title: "Taarak Mehta Ka Ooltah Chashmah",
      description: "A light-hearted sitcom rail item from the existing OTT metadata.",
      category: "Comedy",
      year: "2008",
      duration: "22m",
      thumbnail: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Cast-of-Taarak-Mehta-Ka-Ooltah-Chashmah-celebrate-the-12-year-anniversary-of-the-show.jpg"
    },
    {
      id: "asiacup",
      title: "Asia Cup Finals",
      description: "Sports rail content with the same thumbnail and playback fallback flow.",
      category: "Sports",
      year: "2026",
      duration: "2h 15m"
    },
    {
      id: "blackmail",
      title: "Blackmail",
      description: "Comedy rail item backed by GitHub metadata when available.",
      category: "Comedy",
      year: "2018",
      duration: "1h 54m"
    },
    {
      id: "output_2min",
      title: "Two Minute Encode",
      description: "Short encoded DASH folder for quick playback checks.",
      category: "Encoded",
      year: "2026",
      duration: "2m"
    },
    {
      id: "output_02_04",
      title: "Packaged Sample",
      description: "Packaged output folder used as a static demo tile.",
      category: "Encoded",
      year: "2026",
      duration: "Demo"
    },
    {
      id: "withlogo",
      title: "With Logo",
      description: "Encoded sample mapped to the withlogo DASH manifest on the CDN.",
      category: "Encoded",
      year: "2026",
      duration: "Demo"
    }
  ],

  rails: [
    { title: "Trending Now", items: ["free", "tmkoc", "asiacup", "blackmail", "withlogo"] },
    { title: "Encrypted DASH", items: ["free", "output_2min", "output_02_04", "tmkoc", "withlogo"] },
    { title: "Comedy", items: ["tmkoc", "blackmail"] },
    { title: "Sports", items: ["asiacup", "free"] },
    { title: "Continue Watching", items: ["free", "tmkoc", "output_2min", "output_02_04"] }
  ]
};
