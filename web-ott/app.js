(() => {
  "use strict";

  const config = window.OTT_CONFIG || {};
  const SESSION_KEY = "ott-glass-session-v1";
  const MY_LIST_KEY = "ott-glass-my-list-v1";
  const DEVICE_KEY = "ott-glass-device-credential-v1";

  const state = {
    currentUser: null,
    catalog: [],
    catalogById: new Map(),
    featuredVideo: null,
    searchQuery: "",
    keyStore: null,
    player: null,
    ui: null,
    shakaReady: false,
    currentVideo: null,
    currentManifestUrl: "",
    manifestBlobUrl: "",
    firedAds: new Set(),
    adCuePoints: [],
    adTimer: null,
    adPlaying: false,
    imaReady: false,
    adsLoader: null,
    adsManager: null,
    installPrompt: null
  };

  const els = {};

  window.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    bindElements();
    bindEvents();
    drawIcons();
    registerServiceWorker();
    await detectPlaybackDevice();

    const session = readJson(SESSION_KEY);
    if (session && (session.email || session.userId)) {
      state.currentUser = session;
      await enterApp();
    } else {
      setAuthMessage("Sign in with a whitelisted email or user ID.");
    }
  }

  function bindElements() {
    const ids = [
      "authScreen",
      "appShell",
      "loginForm",
      "loginButton",
      "emailInput",
      "userIdInput",
      "deviceUnlockButton",
      "installButton",
      "authMessage",
      "profileName",
      "logoutButton",
      "searchInput",
      "heroImage",
      "heroCategory",
      "heroTitle",
      "heroDescription",
      "heroMeta",
      "heroPlayButton",
      "heroListButton",
      "notificationButton",
      "registerDeviceButton",
      "refreshDataButton",
      "deviceStatus",
      "rails",
      "my-list",
      "playerOverlay",
      "closePlayerButton",
      "pipButton",
      "fullscreenButton",
      "videoContainer",
      "videoElement",
      "adContainer",
      "adOverlay",
      "adCountdown",
      "playerError",
      "playerTitle",
      "playerMeta",
      "watchTitle",
      "watchDescription",
      "licenseStatus",
      "drmStatus",
      "adStatus",
      "toastStack"
    ];

    for (const id of ids) {
      els[id] = document.getElementById(id);
    }
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", handleLogin);
    els.logoutButton.addEventListener("click", logout);
    els.searchInput.addEventListener("input", () => {
      state.searchQuery = els.searchInput.value.trim().toLowerCase();
      renderRails();
    });

    els.heroPlayButton.addEventListener("click", () => {
      if (state.featuredVideo) {
        playVideo(state.featuredVideo);
      }
    });

    els.heroListButton.addEventListener("click", () => {
      if (state.featuredVideo) {
        toggleMyList(state.featuredVideo.id);
      }
    });

    els.closePlayerButton.addEventListener("click", closePlayer);
    els.notificationButton.addEventListener("click", requestNotifications);
    els.registerDeviceButton.addEventListener("click", registerDeviceUnlock);
    els.deviceUnlockButton.addEventListener("click", unlockWithDevice);
    els.refreshDataButton.addEventListener("click", refreshData);
    els.pipButton.addEventListener("click", togglePictureInPicture);
    els.fullscreenButton.addEventListener("click", toggleFullscreen);
    els.installButton.addEventListener("click", installPwa);

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.installPrompt = event;
      els.installButton.hidden = false;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.player) {
        setToast("Playback can continue in the background when your browser allows it.");
      }
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    const email = normalizeEmail(els.emailInput.value);
    const userId = normalizeUserId(els.userIdInput.value);

    if (!email && !userId) {
      setAuthMessage("Enter an email or user ID.", true);
      return;
    }

    setBusy(els.loginButton, true);
    setAuthMessage("Checking GitHub allowlists...");

    try {
      const auth = await authorize(email, userId);
      if (!auth.ok) {
        setAuthMessage("Not authorized by GitHub allowlist.", true);
        return;
      }

      state.currentUser = {
        email,
        userId,
        displayName: userId || email,
        authorizedBy: auth.authorizedBy,
        signedInAt: new Date().toISOString()
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(state.currentUser));
      await enterApp();
      setToast("Signed in with GitHub allowlist.", "success");
    } catch (error) {
      console.error(error);
      setAuthMessage("Authorization files could not be loaded.", true);
    } finally {
      setBusy(els.loginButton, false);
    }
  }

  async function authorize(email, userId) {
    const [emailsResult, userIdsResult] = await Promise.allSettled([
      fetchJson(config.allowedEmailsUrl),
      fetchJson(config.allowedUserIdsUrl)
    ]);

    const allowedEmails = mergeUnique([
      ...normalizeList(emailsResult.value, ["allowed_emails", "emails", "users"]),
      ...(config.demoAllowedEmails || [])
    ]).map(normalizeEmail);

    const allowedUserIds = mergeUnique([
      ...normalizeList(userIdsResult.value, ["allowed_userids", "allowed_user_ids", "userids", "users"]),
      ...(config.demoAllowedUserIds || [])
    ]).map(normalizeUserId);

    const emailOk = email && allowedEmails.includes(email);
    const userOk = userId && allowedUserIds.includes(userId);

    return {
      ok: Boolean(emailOk || userOk),
      authorizedBy: emailOk ? "email" : userOk ? "userId" : ""
    };
  }

  async function enterApp() {
    els.authScreen.hidden = true;
    els.appShell.hidden = false;
    els.profileName.textContent = state.currentUser.displayName || "Authorized";
    await loadCatalog();
    renderApp();
    drawIcons();
  }

  async function refreshData() {
    setToast("Refreshing GitHub metadata...");
    state.keyStore = null;
    await loadCatalog();
    renderApp();
    drawIcons();
  }

  function logout() {
    closePlayer();
    localStorage.removeItem(SESSION_KEY);
    state.currentUser = null;
    els.appShell.hidden = true;
    els.authScreen.hidden = false;
    setAuthMessage("Signed out.");
  }

  async function loadCatalog() {
    const [descriptionsResult, mappingsResult] = await Promise.allSettled([
      fetchJson(config.descriptionsUrl),
      fetchJson(config.mpdMappingUrl)
    ]);

    const descriptions = descriptionsResult.status === "fulfilled" && descriptionsResult.value
      ? descriptionsResult.value
      : {};
    const mpdMapping = mappingsResult.status === "fulfilled" && mappingsResult.value
      ? mappingsResult.value
      : {};

    const byId = new Map();
    for (const item of config.staticVideos || []) {
      byId.set(item.id, normalizeVideo(item, descriptions[item.id], mpdMapping[item.id]));
    }

    for (const [id, description] of Object.entries(descriptions)) {
      byId.set(id, normalizeVideo({ id }, description, mpdMapping[id]));
    }

    for (const [id, mpdUrl] of Object.entries(mpdMapping)) {
      const existing = byId.get(id) || { id };
      byId.set(id, normalizeVideo(existing, descriptions[id], mpdUrl));
    }

    for (const rail of config.rails || []) {
      for (const id of rail.items || []) {
        if (!byId.has(id)) {
          byId.set(id, normalizeVideo({ id, title: titleFromId(id), category: rail.title }, descriptions[id], mpdMapping[id]));
        }
      }
    }

    state.catalog = Array.from(byId.values());
    state.catalogById = byId;
    state.featuredVideo = byId.get(config.featuredVideoId) || state.catalog[0] || null;
  }

  function normalizeVideo(base, description, mappedMpd) {
    const id = String(base.id || "").trim();
    const merged = { ...base, ...(description || {}) };
    return {
      id,
      title: merged.title || titleFromId(id),
      description: merged.description || "Streaming item",
      category: merged.category || "Browse",
      year: merged.year || "",
      duration: merged.duration || "",
      maturity: merged.maturity || "U/A",
      mpdUrl: merged.mpdUrl || mappedMpd || "",
      thumbnail: merged.thumbnail || "",
      adCuePoints: merged.adCuePoints || config.demoAdCuePoints || [],
      playable: merged.playable !== false
    };
  }

  function renderApp() {
    renderHero();
    renderRails();
    renderMyList();
  }

  function renderHero() {
    const video = state.featuredVideo;
    if (!video) {
      return;
    }

    els.heroCategory.textContent = video.category || "Featured";
    els.heroTitle.textContent = video.title;
    els.heroDescription.textContent = video.description;
    els.heroMeta.innerHTML = "";

    for (const value of [video.year, video.duration, video.maturity, "DASH", "ClearKey"]) {
      if (!value) {
        continue;
      }
      const span = document.createElement("span");
      span.textContent = value;
      els.heroMeta.appendChild(span);
    }

    setSmartImage(els.heroImage, thumbnailCandidates(video));
    updateHeroListButton();
  }

  function renderRails() {
    els.rails.innerHTML = "";
    const rails = buildRails();
    let visibleCount = 0;

    for (const rail of rails) {
      const videos = rail.items
        .map((id) => state.catalogById.get(id) || normalizeVideo({ id, title: titleFromId(id), category: rail.title }))
        .filter(matchesSearch);

      if (videos.length === 0) {
        continue;
      }

      visibleCount += videos.length;
      els.rails.appendChild(createRail(rail.title, videos));
    }

    if (!visibleCount) {
      els.rails.appendChild(createEmptyState("No titles match this search."));
    }

    renderMyList();
    drawIcons();
  }

  function buildRails() {
    const configured = (config.rails || []).map((rail) => ({
      title: rail.title,
      items: mergeUnique(rail.items || [])
    }));

    const titles = new Set(configured.map((rail) => rail.title.toLowerCase()));
    const categories = new Map();

    for (const video of state.catalog) {
      const key = video.category || "Browse";
      if (!categories.has(key)) {
        categories.set(key, []);
      }
      categories.get(key).push(video.id);
    }

    for (const [title, ids] of categories) {
      if (!titles.has(title.toLowerCase())) {
        configured.push({ title, items: mergeUnique(ids) });
      }
    }

    return configured;
  }

  function renderMyList() {
    if (!els["my-list"]) {
      return;
    }

    els["my-list"].innerHTML = "";
    const ids = readJson(MY_LIST_KEY) || [];
    const videos = ids
      .map((id) => state.catalogById.get(id))
      .filter(Boolean)
      .filter(matchesSearch);

    if (videos.length) {
      els["my-list"].appendChild(createRail("My List", videos));
    } else {
      const wrapper = document.createElement("section");
      wrapper.className = "rail";
      wrapper.innerHTML = '<div class="rail-header"><h2>My List</h2><span>Saved titles appear here</span></div>';
      wrapper.appendChild(createEmptyState("Add a title from the hero or rail."));
      els["my-list"].appendChild(wrapper);
    }
  }

  function createRail(title, videos) {
    const section = document.createElement("section");
    section.className = "rail";
    const header = document.createElement("div");
    header.className = "rail-header";
    header.innerHTML = `<h2>${escapeHtml(title)}</h2><span>${videos.length} titles</span>`;

    const track = document.createElement("div");
    track.className = "rail-track";
    for (const video of videos) {
      track.appendChild(createTile(video));
    }

    section.append(header, track);
    return section;
  }

  function createTile(video) {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.title = `Play ${video.title}`;
    tile.addEventListener("click", () => playVideo(video));

    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    setSmartImage(img, thumbnailCandidates(video));

    const body = document.createElement("span");
    body.className = "tile-body";
    body.innerHTML = `
      <span class="tile-badges">
        <span class="badge">${escapeHtml(video.category || "OTT")}</span>
      </span>
      <span class="tile-title">${escapeHtml(video.title)}</span>
      <span class="tile-meta">
        ${video.year ? `<span>${escapeHtml(video.year)}</span>` : ""}
        ${video.duration ? `<span>${escapeHtml(video.duration)}</span>` : ""}
        <span>DASH</span>
      </span>
    `;

    tile.append(img, body);
    return tile;
  }

  function createEmptyState(message) {
    const box = document.createElement("div");
    box.className = "empty-state";
    box.textContent = message;
    return box;
  }

  async function playVideo(video) {
    state.currentVideo = video;
    els.playerOverlay.hidden = false;
    els.playerError.hidden = true;
    els.playerTitle.textContent = video.title;
    els.playerMeta.textContent = [video.year, video.duration, video.category].filter(Boolean).join("  ");
    els.watchTitle.textContent = video.title;
    els.watchDescription.textContent = video.description;
    els.licenseStatus.textContent = "Fetching GitHub Raw";
    els.drmStatus.textContent = "ClearKey";
    els.adStatus.textContent = "Waiting";
    els.videoElement.poster = firstThumbnail(video);
    state.firedAds = new Set();
    state.adCuePoints = (video.adCuePoints || config.demoAdCuePoints || []).map(Number).filter(Number.isFinite);

    try {
      await ensureShaka();
      await state.player.unload();
      revokeManifestBlob();

      const key = await getClearKey(video.id);
      if (key) {
        state.player.configure({
          drm: {
            clearKeys: {
              [cleanHex(key.key_id)]: cleanHex(key.key)
            }
          }
        });
        els.licenseStatus.textContent = `Key ${cleanHex(key.key_id).slice(0, 8)} from GitHub`;
      } else {
        state.player.configure({ drm: { clearKeys: {} } });
        els.licenseStatus.textContent = "No key needed";
      }

      const loadedUrl = await loadManifestWithFallback(video);
      state.currentManifestUrl = loadedUrl;
      prepareMediaSession(video);
      prepareIma();
      await els.videoElement.play().catch(() => undefined);
      setToast(`Playing ${video.title}`, "success");
    } catch (error) {
      console.error(error);
      showPlayerError();
      setToast("Video file or segment is not available.", "error");
    }
  }

  async function ensureShaka() {
    if (!window.shaka) {
      throw new Error("Shaka Player script is not loaded.");
    }

    if (!state.shakaReady) {
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        throw new Error("Browser does not support Shaka Player.");
      }

      state.player = new shaka.Player(els.videoElement);
      state.ui = new shaka.ui.Overlay(state.player, els.videoContainer, els.videoElement);
      state.ui.configure({
        controlPanelElements: [
          "play_pause",
          "time_and_duration",
          "spacer",
          "mute",
          "volume",
          "fullscreen",
          "overflow_menu"
        ],
        overflowMenuButtons: ["captions", "quality", "language", "picture_in_picture", "playback_rate"]
      });

      state.player.configure({
        abr: { enabled: true },
        streaming: {
          bufferingGoal: 20,
          rebufferingGoal: 3,
          retryParameters: {
            maxAttempts: 2,
            baseDelay: 700,
            backoffFactor: 1.6,
            fuzzFactor: 0.4,
            timeout: 12000
          }
        }
      });

      state.player.addEventListener("error", (event) => {
        console.error("Shaka error", event.detail);
        showPlayerError();
      });

      state.player.addEventListener("timelineregionenter", onTimelineRegionEnter);
      state.player.addEventListener("timelineregionadded", onTimelineRegionAdded);
      els.videoElement.addEventListener("error", showPlayerError);
      els.videoElement.addEventListener("timeupdate", handleCuePoints);
      els.videoElement.addEventListener("ended", () => {
        els.adStatus.textContent = "Complete";
      });

      state.shakaReady = true;
    }
  }

  async function loadManifestWithFallback(video) {
    const urls = manifestCandidates(video);
    let lastError = null;

    for (const url of urls) {
      try {
        await state.player.load(url);
        return url;
      } catch (error) {
        lastError = error;
        await state.player.unload().catch(() => undefined);
        const patchedUrl = await createStaticMpdBlobUrl(url).catch(() => "");
        if (patchedUrl) {
          try {
            await state.player.load(patchedUrl);
            return url;
          } catch (patchedError) {
            lastError = patchedError;
            await state.player.unload().catch(() => undefined);
          }
        }
      }
    }

    throw lastError || new Error("No manifest URL worked.");
  }

  function manifestCandidates(video) {
    const urls = [];
    if (video.mpdUrl) {
      urls.push(video.mpdUrl);
    }
    if (config.cdnBaseUrl) {
      urls.push(`${trimSlash(config.cdnBaseUrl)}/${encodeURIComponent(video.id)}/manifest.mpd`);
    }
    if (config.r2BaseUrl) {
      urls.push(`${trimSlash(config.r2BaseUrl)}/${encodeURIComponent(video.id)}/manifest.mpd`);
    }
    return mergeUnique(urls);
  }

  async function createStaticMpdBlobUrl(url) {
    const response = await fetch(withCacheBust(url), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`MPD fetch failed: ${response.status}`);
    }

    const text = await response.text();
    if (!/type=["']dynamic["']/.test(text) && /<BaseURL>/i.test(text)) {
      return "";
    }

    const base = url.slice(0, url.lastIndexOf("/") + 1);
    const patched = staticizeMpd(text, base);
    revokeManifestBlob();
    state.manifestBlobUrl = URL.createObjectURL(new Blob([patched], { type: "application/dash+xml" }));
    return state.manifestBlobUrl;
  }

  function staticizeMpd(text, baseUrl) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parserError = doc.getElementsByTagName("parsererror")[0];
    if (parserError) {
      return stringStaticizeMpd(text, baseUrl);
    }

    const mpd = doc.documentElement;
    mpd.setAttribute("type", "static");
    mpd.removeAttribute("publishTime");
    mpd.removeAttribute("availabilityStartTime");
    mpd.removeAttribute("minimumUpdatePeriod");
    mpd.removeAttribute("timeShiftBufferDepth");

    if (!mpd.getElementsByTagName("BaseURL")[0]) {
      const base = doc.createElementNS(mpd.namespaceURI, "BaseURL");
      base.textContent = baseUrl;
      mpd.insertBefore(base, mpd.firstElementChild);
    }

    if (!mpd.getAttribute("mediaPresentationDuration")) {
      const seconds = estimateMpdDuration(doc);
      if (seconds > 0) {
        mpd.setAttribute("mediaPresentationDuration", secondsToIsoDuration(seconds));
      }
    }

    return new XMLSerializer().serializeToString(doc);
  }

  function stringStaticizeMpd(text, baseUrl) {
    let patched = text
      .replace(/\s+type=["']dynamic["']/, ' type="static"')
      .replace(/\s+publishTime=["'][^"']*["']/g, "")
      .replace(/\s+availabilityStartTime=["'][^"']*["']/g, "")
      .replace(/\s+minimumUpdatePeriod=["'][^"']*["']/g, "")
      .replace(/\s+timeShiftBufferDepth=["'][^"']*["']/g, "");

    if (!/<BaseURL>/i.test(patched)) {
      patched = patched.replace(/(<MPD\b[^>]*>)/, `$1\n  <BaseURL>${escapeXml(baseUrl)}</BaseURL>`);
    }

    return patched;
  }

  function estimateMpdDuration(doc) {
    let maxSeconds = 0;
    const templates = Array.from(doc.getElementsByTagName("SegmentTemplate"));
    for (const template of templates) {
      const timescale = Number(template.getAttribute("timescale")) || 1;
      let total = 0;
      const timeline = template.getElementsByTagName("SegmentTimeline")[0];
      if (!timeline) {
        continue;
      }

      for (const s of Array.from(timeline.getElementsByTagName("S"))) {
        const duration = Number(s.getAttribute("d")) || 0;
        const repeat = Number(s.getAttribute("r")) || 0;
        total += duration * (repeat >= 0 ? repeat + 1 : 1);
      }

      maxSeconds = Math.max(maxSeconds, total / timescale);
    }
    return maxSeconds;
  }

  async function getClearKey(videoId) {
    const store = await getKeyStore();
    if (!store) {
      return null;
    }

    const direct = store[videoId];
    const fallback = store.demo_video || Object.values(store)[0];
    const key = direct || fallback;

    if (!key || !key.key_id || !key.key) {
      return null;
    }

    return key;
  }

  async function getKeyStore() {
    if (state.keyStore) {
      return state.keyStore;
    }

    const raw = await fetchJson(config.keysUrl);
    const decrypted = await maybeDecryptKeyStore(raw);
    state.keyStore = normalizeKeyStore(decrypted);
    return state.keyStore;
  }

  async function maybeDecryptKeyStore(raw) {
    if (!raw || !raw.encrypted) {
      return raw;
    }

    if (!crypto.subtle) {
      throw new Error("Web Crypto is required to decrypt keys.");
    }

    const iv = decodeFlexibleBytes(raw.iv || raw.nonce);
    const ciphertext = decodeFlexibleBytes(raw.ciphertext || raw.data || raw.payload);
    const key = await deriveAesGcmKey(config.fixedKeyPassphrase);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text);
  }

  function normalizeKeyStore(raw) {
    if (!raw) {
      return {};
    }
    if (raw.videos && typeof raw.videos === "object") {
      return raw.videos;
    }
    if (raw.keys && typeof raw.keys === "object") {
      return raw.keys;
    }
    return raw;
  }

  async function deriveAesGcmKey(passphrase) {
    const source = new TextEncoder().encode(passphrase || "OTT_DEMO_FIXED_KEY_2026");
    const digest = await crypto.subtle.digest("SHA-256", source);
    return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  }

  function onTimelineRegionAdded(event) {
    if (isScteRegion(event.detail)) {
      els.adStatus.textContent = "SCTE marker detected";
    }
  }

  function onTimelineRegionEnter(event) {
    if (isScteRegion(event.detail)) {
      requestAdBreak("SCTE-35 marker");
    }
  }

  function isScteRegion(detail) {
    if (!detail) {
      return false;
    }
    const scheme = String(detail.schemeIdUri || detail.schemeIdURI || detail.id || "").toLowerCase();
    if (scheme.includes("scte") || scheme.includes("splice")) {
      return true;
    }
    try {
      const text = JSON.stringify(detail).toLowerCase();
      return text.includes("scte") || text.includes("splice_insert") || text.includes("spliceinsert");
    } catch {
      return false;
    }
  }

  function handleCuePoints() {
    if (!state.currentVideo || state.adPlaying) {
      return;
    }

    const time = els.videoElement.currentTime || 0;
    for (const cue of state.adCuePoints) {
      if (time >= cue && !state.firedAds.has(cue)) {
        state.firedAds.add(cue);
        requestAdBreak(`cue ${Math.round(cue)}s`);
        break;
      }
    }
  }

  function prepareIma() {
    if (state.imaReady || !window.google || !google.ima || !config.googleImaAdTag) {
      return;
    }

    const displayContainer = new google.ima.AdDisplayContainer(els.adContainer, els.videoElement);
    displayContainer.initialize();
    state.adsLoader = new google.ima.AdsLoader(displayContainer);
    state.adsLoader.addEventListener(
      google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      onAdsManagerLoaded,
      false
    );
    state.adsLoader.addEventListener(
      google.ima.AdErrorEvent.Type.AD_ERROR,
      (event) => {
        console.warn("IMA error", event.getError());
        showDemoAdBreak("ad error fallback");
      },
      false
    );
    state.imaReady = true;
  }

  function requestAdBreak(reason) {
    els.adStatus.textContent = reason || "Ad break";

    if (!config.googleImaAdTag || !window.google || !google.ima || !state.adsLoader) {
      showDemoAdBreak(reason);
      return;
    }

    try {
      const request = new google.ima.AdsRequest();
      request.adTagUrl = config.googleImaAdTag;
      request.linearAdSlotWidth = Math.max(320, els.videoContainer.clientWidth);
      request.linearAdSlotHeight = Math.max(180, els.videoContainer.clientHeight);
      request.nonLinearAdSlotWidth = request.linearAdSlotWidth;
      request.nonLinearAdSlotHeight = 120;
      state.adsLoader.requestAds(request);
    } catch (error) {
      console.warn(error);
      showDemoAdBreak(reason);
    }
  }

  function onAdsManagerLoaded(event) {
    state.adsManager = event.getAdsManager(els.videoElement);
    state.adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
      state.adPlaying = true;
      els.videoElement.pause();
    });
    state.adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => {
      state.adPlaying = false;
      els.videoElement.play().catch(() => undefined);
    });
    state.adsManager.addEventListener(google.ima.AdEvent.Type.COMPLETE, () => {
      els.adStatus.textContent = "Ad complete";
    });
    state.adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, () => {
      state.adPlaying = false;
      els.videoElement.play().catch(() => undefined);
    });

    const width = Math.max(320, els.videoContainer.clientWidth);
    const height = Math.max(180, els.videoContainer.clientHeight);
    state.adsManager.init(width, height, google.ima.ViewMode.NORMAL);
    state.adsManager.start();
  }

  function showDemoAdBreak(reason) {
    if (state.adPlaying) {
      return;
    }

    state.adPlaying = true;
    els.videoElement.pause();
    els.adOverlay.hidden = false;
    els.adStatus.textContent = reason ? `Demo ad: ${reason}` : "Demo ad";

    let seconds = 5;
    els.adCountdown.textContent = String(seconds);
    clearInterval(state.adTimer);
    state.adTimer = setInterval(() => {
      seconds -= 1;
      els.adCountdown.textContent = String(Math.max(0, seconds));
      if (seconds <= 0) {
        clearInterval(state.adTimer);
        state.adPlaying = false;
        els.adOverlay.hidden = true;
        els.adStatus.textContent = "Ad complete";
        els.videoElement.play().catch(() => undefined);
      }
    }, 1000);
  }

  function showPlayerError() {
    els.playerError.hidden = false;
  }

  async function closePlayer() {
    els.playerOverlay.hidden = true;
    els.playerError.hidden = true;
    clearInterval(state.adTimer);
    state.adPlaying = false;
    els.adOverlay.hidden = true;

    if (state.player) {
      await state.player.unload().catch(() => undefined);
    }
    revokeManifestBlob();
  }

  async function togglePictureInPicture() {
    const video = els.videoElement;
    if (!document.pictureInPictureEnabled || video.disablePictureInPicture) {
      setToast("Picture in picture is not available in this browser.", "error");
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.warn(error);
      setToast("Picture in picture could not start.", "error");
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await els.videoContainer.requestFullscreen();
      }
    } catch (error) {
      console.warn(error);
      setToast("Fullscreen could not start.", "error");
    }
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setToast("Notifications are not available in this browser.", "error");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(config.appName || "OTT Glass", {
        body: "Notifications are enabled.",
        icon: config.logoUrl || "./assets/logo.png"
      });
      setToast("Notifications enabled.", "success");
    } else {
      setToast("Notifications were not enabled.", "error");
    }
  }

  async function registerDeviceUnlock() {
    if (!state.currentUser) {
      setToast("Sign in before registering device unlock.", "error");
      return;
    }

    if (!window.PublicKeyCredential || !navigator.credentials) {
      setToast("Device unlock is not available in this browser.", "error");
      return;
    }

    try {
      const displayName = state.currentUser.displayName || state.currentUser.email || state.currentUser.userId || "OTT User";
      const userBytes = new TextEncoder().encode(displayName).slice(0, 64);
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: randomBytes(32),
          rp: { name: config.appName || "OTT Glass" },
          user: {
            id: userBytes,
            name: displayName,
            displayName
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "preferred"
          },
          timeout: 60000,
          attestation: "none"
        }
      });

      localStorage.setItem(DEVICE_KEY, JSON.stringify({
        credentialId: bufferToBase64Url(credential.rawId),
        user: state.currentUser
      }));
      setToast("Device unlock registered.", "success");
    } catch (error) {
      console.warn(error);
      setToast("Device unlock registration was not completed.", "error");
    }
  }

  async function unlockWithDevice() {
    const saved = readJson(DEVICE_KEY);
    if (!saved || !saved.credentialId) {
      setAuthMessage("No device unlock is registered yet.", true);
      return;
    }

    if (!window.PublicKeyCredential || !navigator.credentials) {
      setAuthMessage("Device unlock is not available here.", true);
      return;
    }

    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          allowCredentials: [
            {
              type: "public-key",
              id: base64UrlToBuffer(saved.credentialId)
            }
          ],
          userVerification: "preferred",
          timeout: 60000
        }
      });

      state.currentUser = saved.user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(saved.user));
      await enterApp();
      setToast("Unlocked with this device.", "success");
    } catch (error) {
      console.warn(error);
      setAuthMessage("Device unlock was cancelled or rejected.", true);
    }
  }

  async function installPwa() {
    if (!state.installPrompt) {
      setToast("Install is available from the browser menu on this device.");
      return;
    }

    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => undefined);
    state.installPrompt = null;
    els.installButton.hidden = true;
  }

  async function detectPlaybackDevice() {
    const parts = [];
    if (window.shaka) {
      parts.push("Shaka ready");
    }

    if (navigator.requestMediaKeySystemAccess) {
      const clearKey = await supportsKeySystem("org.w3.clearkey");
      const widevine = await supportsKeySystem("com.widevine.alpha");
      if (clearKey) {
        parts.push("ClearKey supported");
      }
      if (widevine) {
        parts.push("Widevine available");
      }
      if (widevine && /Android/i.test(navigator.userAgent)) {
        parts.push("OEMCrypto handled by Android if present");
      }
    }

    if (!parts.length) {
      parts.push("DASH support will be checked at playback");
    }

    if (els.deviceStatus) {
      els.deviceStatus.textContent = parts.join(" | ");
    }
  }

  async function supportsKeySystem(keySystem) {
    try {
      await navigator.requestMediaKeySystemAccess(keySystem, [
        {
          initDataTypes: ["cenc"],
          audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
          videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
        }
      ]);
      return true;
    } catch {
      return false;
    }
  }

  function prepareMediaSession(video) {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: video.title,
      artist: config.appName || "OTT Glass",
      album: video.category || "OTT",
      artwork: [
        { src: firstThumbnail(video), sizes: "512x512", type: "image/png" }
      ]
    });

    const actions = {
      play: () => els.videoElement.play(),
      pause: () => els.videoElement.pause(),
      seekbackward: () => seekBy(-10),
      seekforward: () => seekBy(10),
      previoustrack: () => playNeighbor(-1),
      nexttrack: () => playNeighbor(1)
    };

    for (const [name, handler] of Object.entries(actions)) {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch {
        // Some Android/browser combinations do not support every action.
      }
    }
  }

  function seekBy(seconds) {
    const video = els.videoElement;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
  }

  function playNeighbor(direction) {
    if (!state.currentVideo || !state.catalog.length) {
      return;
    }
    const index = state.catalog.findIndex((video) => video.id === state.currentVideo.id);
    const next = state.catalog[(index + direction + state.catalog.length) % state.catalog.length];
    if (next) {
      playVideo(next);
    }
  }

  function toggleMyList(videoId) {
    const ids = readJson(MY_LIST_KEY) || [];
    const exists = ids.includes(videoId);
    const next = exists ? ids.filter((id) => id !== videoId) : [videoId, ...ids];
    localStorage.setItem(MY_LIST_KEY, JSON.stringify(next));
    updateHeroListButton();
    renderMyList();
    setToast(exists ? "Removed from My List." : "Added to My List.", exists ? "" : "success");
  }

  function updateHeroListButton() {
    if (!state.featuredVideo) {
      return;
    }
    const ids = readJson(MY_LIST_KEY) || [];
    const inList = ids.includes(state.featuredVideo.id);
    els.heroListButton.innerHTML = inList
      ? '<i data-lucide="check" aria-hidden="true"></i> In My List'
      : '<i data-lucide="plus" aria-hidden="true"></i> My List';
    drawIcons();
  }

  function thumbnailCandidates(video) {
    const candidates = [];
    if (video.thumbnail) {
      candidates.push(video.thumbnail);
    }
    for (const fileName of config.thumbnailFileNames || []) {
      if (config.cdnBaseUrl) {
        candidates.push(`${trimSlash(config.cdnBaseUrl)}/${encodeURIComponent(video.id)}/${fileName}`);
      }
      if (config.r2BaseUrl) {
        candidates.push(`${trimSlash(config.r2BaseUrl)}/${encodeURIComponent(video.id)}/${fileName}`);
      }
    }
    candidates.push(config.logoUrl || "./assets/logo.png");
    return mergeUnique(candidates);
  }

  function firstThumbnail(video) {
    return thumbnailCandidates(video)[0] || config.logoUrl || "./assets/logo.png";
  }

  function setSmartImage(img, candidates) {
    const safeCandidates = mergeUnique(candidates.filter(Boolean));
    let index = 0;
    img.onerror = () => {
      index += 1;
      if (index < safeCandidates.length) {
        img.src = safeCandidates[index];
      } else {
        img.onerror = null;
        img.src = config.logoUrl || "./assets/logo.png";
      }
    };
    img.src = safeCandidates[0] || config.logoUrl || "./assets/logo.png";
  }

  function matchesSearch(video) {
    if (!state.searchQuery) {
      return true;
    }
    const haystack = `${video.title} ${video.description} ${video.category} ${video.id}`.toLowerCase();
    return haystack.includes(state.searchQuery);
  }

  async function fetchJson(url) {
    if (!url) {
      return null;
    }
    const response = await fetch(withCacheBust(url), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${url}`);
    }
    return response.json();
  }

  function withCacheBust(url) {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}_=${Date.now()}`;
  }

  function normalizeList(source, keys) {
    if (!source) {
      return [];
    }
    if (Array.isArray(source)) {
      return source;
    }
    for (const key of keys) {
      if (Array.isArray(source[key])) {
        return source[key];
      }
    }
    return [];
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeUserId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function setAuthMessage(message, isError = false) {
    els.authMessage.textContent = message;
    els.authMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    if (busy) {
      button.textContent = "Please wait";
    } else {
      button.innerHTML = '<i data-lucide="log-in" aria-hidden="true"></i> Sign in';
      drawIcons();
    }
  }

  function setToast(message, type = "") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    els.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 3600);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") {
      return;
    }
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }

  function drawIcons() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function mergeUnique(values) {
    return Array.from(new Set(values.filter((value) => value !== undefined && value !== null && String(value).length)));
  }

  function titleFromId(id) {
    return String(id || "video")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function trimSlash(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function cleanHex(value) {
    return String(value || "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  }

  function secondsToIsoDuration(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    return `PT${safe.toFixed(3).replace(/\.?0+$/, "")}S`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeXml(value) {
    return escapeHtml(value);
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function decodeFlexibleBytes(value) {
    const text = String(value || "").trim();
    if (/^[0-9a-fA-F]+$/.test(text) && text.length % 2 === 0) {
      return hexToBytes(text);
    }
    return new Uint8Array(base64UrlToBuffer(text));
  }

  function hexToBytes(hex) {
    const clean = cleanHex(hex);
    const bytes = new Uint8Array(clean.length / 2);
    for (let index = 0; index < clean.length; index += 2) {
      bytes[index / 2] = parseInt(clean.slice(index, index + 2), 16);
    }
    return bytes;
  }

  function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToBuffer(value) {
    const text = String(value || "");
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function revokeManifestBlob() {
    if (state.manifestBlobUrl) {
      URL.revokeObjectURL(state.manifestBlobUrl);
      state.manifestBlobUrl = "";
    }
  }
})();
