window.OTT_CONFIG = {
  appName: "VigilSiddhi OTT",

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

  // Production encryption passphrase used for keys.json wrapper.
  fixedKeyPassphrase: "VIGIL_SIDDHI_PROD_2026",

  // Advertising configuration
  googleImaAdTag: "",

  // Cue points for server-side or local ad insertions
  adCuePoints: [30, 90],

  allowedEmails: ["pdek1991@gmail.com", "pdek1992@gmail.com"],
  allowedUserIds: ["pdek1991", "admin"],

  featuredVideoId: "angel_one",

  staticVideos: [
    // ── Featured / Your Content ─────────────────────────────────
    {
      id: "free",
      title: "Free Preview",
      description: "Start watching instantly with a smooth premium playback experience.",
      category: "Featured",
      year: "2026",
      duration: "2m",
      thumbnail: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=640&q=80"
    },
    {
      id: "output_2min",
      title: "Quick Preview",
      description: "A short title for a fast watch.",
      category: "Featured",
      year: "2026",
      duration: "2m",
      thumbnail: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=640&q=80"
    },
    {
      id: "output_02_04",
      title: "Weekend Special",
      description: "A featured pick ready for streaming.",
      category: "Featured",
      year: "2026",
      duration: "Preview",
      thumbnail: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=640&q=80"
    },
    {
      id: "withlogo",
      title: "Studio Preview",
      description: "A polished sample from the VigilSiddhi OTT collection.",
      category: "Featured",
      year: "2026",
      duration: "Preview",
      thumbnail: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=640&q=80"
    },
    // ── Sci-Fi ──────────────────────────────────────────────────
    {
      id: "angel_one",
      title: "Angel One",
      description: "A celestial sci-fi adventure with stunning ABR-adaptive streaming. Shaka Player official demo asset.",
      category: "Sci-Fi",
      year: "2016",
      duration: "4m",
      maturity: "U",
      thumbnail: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=640&q=80"
    },
    {
      id: "tears_of_steel",
      title: "Tears of Steel",
      description: "Robots invade Amsterdam in this stunning sci-fi short from the Blender Foundation.",
      category: "Sci-Fi",
      year: "2012",
      duration: "12m",
      maturity: "U/A",
      thumbnail: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=640&q=80"
    },
    // ── Documentary ─────────────────────────────────────────────
    {
      id: "heliocentrism",
      title: "Heliocentrism",
      description: "An immersive space documentary journey through our solar system. Multi-bitrate adaptive streaming.",
      category: "Documentary",
      year: "2017",
      duration: "3m",
      maturity: "U",
      thumbnail: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=640&q=80"
    },
    // ── Animation ───────────────────────────────────────────────
    {
      id: "big_buck_bunny",
      title: "Big Buck Bunny",
      description: "A giant rabbit vs. three mischievous rodents. A timeless Blender Foundation classic.",
      category: "Animation",
      year: "2008",
      duration: "9m 56s",
      maturity: "U",
      thumbnail: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=640&q=80"
    },
    {
      id: "bbb_dark_truths",
      title: "Big Buck Bunny — Dark Truths",
      description: "A darker, cinematic reimagining of the animated classic. Shaka demo with full ABR.",
      category: "Animation",
      year: "2012",
      duration: "10m",
      maturity: "U/A",
      thumbnail: "https://images.unsplash.com/photo-1541562232579-512a21360020?w=640&q=80"
    },
    {
      id: "sintel",
      title: "Sintel",
      description: "Fantasy epic — a lone heroine searches for her lost dragon across dangerous lands.",
      category: "Animation",
      year: "2010",
      duration: "14m 48s",
      maturity: "PG",
      thumbnail: "https://images.unsplash.com/photo-1628155930542-3c7a64e2aed1?w=640&q=80"
    },
    {
      id: "elephant_dream",
      title: "Elephant's Dream",
      description: "The world's first open movie — a surrealist journey through impossible mechanical worlds.",
      category: "Animation",
      year: "2006",
      duration: "10m 54s",
      maturity: "U",
      thumbnail: "https://images.unsplash.com/photo-1557990010-6e3c65a7d8c7?w=640&q=80"
    },
    {
      id: "cosmos_laundromat",
      title: "Cosmos Laundromat",
      description: "A sheep meets a mysterious stranger who grants infinite lives. Award-winning Blender open short.",
      category: "Animation",
      year: "2015",
      duration: "12m 10s",
      maturity: "U/A",
      thumbnail: "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=640&q=80"
    },
    // ── Comedy ──────────────────────────────────────────────────
    {
      id: "tmkoc",
      title: "Taarak Mehta Ka Ooltah Chashmah",
      description: "A light-hearted sitcom set in the Gokuldham Society. Humor and wit in every episode.",
      category: "Comedy",
      year: "2008",
      duration: "22m",
      thumbnail: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Cast-of-Taarak-Mehta-Ka-Ooltah-Chashmah-celebrate-the-12-year-anniversary-of-the-show.jpg"
    },
    {
      id: "blackmail",
      title: "Blackmail",
      description: "Starring Irrfan Khan, Kirti Kulhari, Divya Dutta. A dark comedy thriller.",
      category: "Comedy",
      year: "2018",
      duration: "1h 54m",
      thumbnail: "https://images.unsplash.com/photo-1572177812156-58036aae439c?w=640&q=80"
    },
    // ── Sports ──────────────────────────────────────────────────
    {
      id: "asiacup",
      title: "Asia Cup Finals",
      description: "India vs Pakistan — edge-of-your-seat cricket action from a packed stadium.",
      category: "Sports",
      year: "2026",
      duration: "2h 15m",
      thumbnail: "https://upload.wikimedia.org/wikipedia/commons/8/89/Test_Match_Cricket_India_Vs._Pakistan.jpg"
    },
    // ── DASH Demo ────────────────────────────────────────────────
    {
      id: "multirate_dash",
      title: "Multi-Rate ABR Baseline",
      description: "Industry-standard multi-bitrate reference stream demonstrating seamless adaptive bitrate switching.",
      category: "Reference Streams",
      year: "2023",
      duration: "Loop",
      maturity: "U",
      thumbnail: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=640&q=80"
    },
    {
      id: "hd_multireso",
      title: "HD Reference Standard",
      description: "High-definition multi-resolution reference stream for verifying ABR performance and player stability.",
      category: "Reference Streams",
      year: "2023",
      duration: "Loop",
      maturity: "U",
      thumbnail: "https://images.unsplash.com/photo-1536240478700-b869ad10e128?w=640&q=80"
    },
    {
      id: "bitmovin_demo",
      title: "Bitmovin Gold Standard",
      description: "Bitmovin reference stream — the global industry benchmark for high-performance adaptive video delivery.",
      category: "Reference Streams",
      year: "2023",
      duration: "Feature",
      maturity: "U",
      thumbnail: "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=640&q=80"
    }
  ],

  // ── Netflix-like genre rails ─────────────────────────────────
  rails: [
    {
      title: "🔥 Trending Now",
      items: ["angel_one", "tears_of_steel", "sintel", "big_buck_bunny", "heliocentrism", "bbb_dark_truths"]
    },
    {
      title: "🎬 Animation",
      items: ["big_buck_bunny", "bbb_dark_truths", "sintel", "elephant_dream", "cosmos_laundromat"]
    },
    {
      title: "🚀 Sci-Fi",
      items: ["angel_one", "tears_of_steel"]
    },
    {
      title: "🌌 Documentary",
      items: ["heliocentrism"]
    },
    {
      title: "😂 Comedy",
      items: ["tmkoc", "blackmail"]
    },
    {
      title: "🏏 Sports",
      items: ["asiacup"]
    },
    {
      title: "📡 Reference Streams",
      items: ["multirate_dash", "hd_multireso", "bitmovin_demo"]
    },
    {
      title: "▶️ Your Content",
      items: ["free", "output_2min", "output_02_04", "withlogo"]
    },
    {
      title: "⬇️ Continue Watching",
      items: ["angel_one", "sintel", "big_buck_bunny", "tears_of_steel", "heliocentrism"]
    }
  ]
};
