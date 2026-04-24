/**
 * observability.js
 * ─────────────────────────────────────────────────────────────
 * Client-side QoE metrics collection and push to Grafana Cloud.
 *
 * Design principles:
 *  - Aggregates locally; never sends raw per-event data
 *  - Pushes every 30 s OR on video end
 *  - Low-cardinality labels only: region, device_type, network_type
 *  - Prometheus remote_write (protobuf-less text format via CORS proxy shim)
 *
 * Integration: loaded AFTER observability_config.js and shaka-player.
 */

(() => {
  "use strict";

  /* ── config ────────────────────────────────────────────────── */
  const CFG = window.OTT_OBSERVABILITY || {};
  const PROM_URL    = CFG.prometheusUrl    || "";
  const PROM_USER   = CFG.prometheusUser   || "";
  const PROM_API_KEY= CFG.prometheusApiKey || "";
  const PUSH_MS     = CFG.pushIntervalMs   || 30_000;
  const REGION      = CFG.region           || "IN";

  if (!PROM_URL || PROM_USER === "REPLACE_ME_GRAFANA_PROM_USER") {
    console.info("[OBS] observability_config.js credentials not set – metrics disabled.");
  }

  /* ── helpers ───────────────────────────────────────────────── */
  function detectDeviceType() {
    const ua = navigator.userAgent || "";
    if (/TV|SmartTV|HbbTV|Tizen|WebOS/i.test(ua)) return "tv";
    if (/Mobi|Android|iPhone|iPad/i.test(ua))      return "mobile";
    return "desktop";
  }

  function detectNetworkType() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return "unknown";
    const ect = conn.effectiveType || "";
    if (ect === "4g") {
      // crude 5G check: type === "cellular" and downlink > 20 Mbit/s
      if (conn.downlink && conn.downlink > 20) return "5g";
      return "4g";
    }
    if (ect === "wifi" || conn.type === "wifi") return "wifi";
    return ect || "unknown";
  }

  /* ── session object ────────────────────────────────────────── */
  let session = null;
  let pushTimer = null;

  function newSession() {
    return {
      sessionId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      startTime: Date.now(),
      playClickTime: null,
      firstFrameTime: null,
      bufferingStartTime: null,
      bufferingTotalMs: 0,
      rebufferCount: 0,
      bitrateSamples: [],
      droppedFrames: 0,
      lastDroppedFrames: 0,
      errors: 0,
      playTimeStartMs: null,
      playTimeTotalMs: 0,
      estimatedBandwidthBps: 0,
      deviceType: detectDeviceType(),
      networkType: detectNetworkType()
    };
  }

  /* ── metric aggregation ────────────────────────────────────── */
  function computeMetrics() {
    if (!session) return null;

    const now = Date.now();

    // Accumulate running play time
    if (session.playTimeStartMs !== null) {
      session.playTimeTotalMs += now - session.playTimeStartMs;
      session.playTimeStartMs = now;
    }

    const playTimeSec = session.playTimeTotalMs / 1000;
    const startupSec  = (session.firstFrameTime && session.playClickTime)
      ? (session.firstFrameTime - session.playClickTime) / 1000
      : 0;
    const rebufRatio  = playTimeSec > 0
      ? session.bufferingTotalMs / (session.playTimeTotalMs || 1)
      : 0;
    const avgBitrate  = session.bitrateSamples.length
      ? session.bitrateSamples.reduce((a, b) => a + b, 0) / session.bitrateSamples.length / 1000
      : 0;
    const errorRate   = session.errors > 0 ? 1 : 0;
    const bandwidth   = session.estimatedBandwidthBps / 1000; // kbps

    return {
      startup_time_seconds: startupSec,
      rebuffer_ratio:       Math.min(rebufRatio, 1),
      avg_bitrate_kbps:     avgBitrate,
      error_rate:           errorRate,
      avg_bandwidth_kbps:   bandwidth,
      dropped_frames:       session.droppedFrames,
      rebuffer_count:       session.rebufferCount,
      labels: {
        region:       REGION,
        device_type:  session.deviceType,
        network_type: session.networkType
      }
    };
  }

  /* ── Prometheus remote_write (text format via fetch) ───────── */
  /**
   * Grafana Cloud Prometheus accepts the Prometheus HTTP API
   * compatible remote_write endpoint at /api/prom/push.
   * We send newline-delimited text (exposition format) using
   * Basic auth (user = instance_id, password = API key).
   *
   * Note: browsers block direct remote_write protobuf pushes from
   * cross-origin pages.  Grafana Cloud's /api/prom/push endpoint
   * supports CORS for Bearer/Basic auth when the caller sends
   * Content-Type: application/x-www-form-urlencoded with a
   * prometheus-encoded body via the Pushgateway-compatible
   * text exposition format.  We use the lightweight text push.
   */
  async function pushMetrics(metrics) {
    if (!PROM_URL || PROM_USER === "REPLACE_ME_GRAFANA_PROM_USER" || !PROM_API_KEY || PROM_API_KEY === "REPLACE_ME_GRAFANA_PROM_API_KEY") {
      console.debug("[OBS] Skipping push – credentials not configured.", metrics);
      return;
    }

    const { labels } = metrics;
    const labelStr = `region="${labels.region}",device_type="${labels.device_type}",network_type="${labels.network_type}"`;
    const ts = Date.now(); // milliseconds epoch

    const lines = [
      `# TYPE qoe_startup_time_seconds gauge`,
      `qoe_startup_time_seconds{${labelStr}} ${metrics.startup_time_seconds.toFixed(3)} ${ts}`,
      `# TYPE qoe_rebuffer_ratio gauge`,
      `qoe_rebuffer_ratio{${labelStr}} ${metrics.rebuffer_ratio.toFixed(4)} ${ts}`,
      `# TYPE qoe_avg_bitrate_kbps gauge`,
      `qoe_avg_bitrate_kbps{${labelStr}} ${metrics.avg_bitrate_kbps.toFixed(1)} ${ts}`,
      `# TYPE qoe_error_rate gauge`,
      `qoe_error_rate{${labelStr}} ${metrics.error_rate} ${ts}`,
      `# TYPE qoe_avg_bandwidth_kbps gauge`,
      `qoe_avg_bandwidth_kbps{${labelStr}} ${metrics.avg_bandwidth_kbps.toFixed(1)} ${ts}`,
      `# TYPE qoe_dropped_frames counter`,
      `qoe_dropped_frames{${labelStr}} ${metrics.dropped_frames} ${ts}`,
      `# TYPE qoe_rebuffer_count counter`,
      `qoe_rebuffer_count{${labelStr}} ${metrics.rebuffer_count} ${ts}`,
      `# TYPE qoe_active_sessions gauge`,
      `qoe_active_sessions{${labelStr}} 1 ${ts}`
    ].join("\n");

    const basicAuth = btoa(`${PROM_USER}:${PROM_API_KEY}`);

    try {
      const response = await fetch(PROM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "Authorization": `Basic ${basicAuth}`
        },
        body: lines,
        keepalive: true
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.warn("[OBS] Push failed:", response.status, body.slice(0, 200));
      } else {
        console.debug("[OBS] Metrics pushed OK", metrics);
      }
    } catch (err) {
      console.warn("[OBS] Push error:", err);
    }

    // ── Persist to localStorage so dashboard.js can display history ──
    persistQoEHistory(metrics);
  }

  const LS_QOE_HISTORY = "ott-obs-qoe-history-v1";
  const MAX_LS_HISTORY = 20;

  function persistQoEHistory(metrics) {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_QOE_HISTORY) || "[]");
      stored.push({ ts: Date.now(), ...metrics });
      if (stored.length > MAX_LS_HISTORY) stored.splice(0, stored.length - MAX_LS_HISTORY);
      localStorage.setItem(LS_QOE_HISTORY, JSON.stringify(stored));
    } catch (e) {
      // localStorage may be full or unavailable
    }
  }

  /* ── public API attached to window.OTT_OBS ─────────────────── */
  const obs = {

    /** Call when user clicks Play. */
    onPlayIntent() {
      if (session) obs.onVideoEnd(); // flush previous
      session = newSession();
      session.playClickTime = Date.now();
      schedulePush();
    },

    /** Call when first frame is rendered / canplay fires. */
    onFirstFrame() {
      if (session && !session.firstFrameTime) {
        session.firstFrameTime = Date.now();
        session.playTimeStartMs = Date.now();
      }
    },

    /** Call when playback begins/resumes. */
    onPlayResume() {
      if (session && session.playTimeStartMs === null) {
        session.playTimeStartMs = Date.now();
      }
    },

    /** Call when playback pauses. */
    onPlayPause() {
      if (session && session.playTimeStartMs !== null) {
        session.playTimeTotalMs += Date.now() - session.playTimeStartMs;
        session.playTimeStartMs = null;
      }
    },

    /** Call when buffering starts. */
    onBufferingStart() {
      if (!session) return;
      session.bufferingStartTime = Date.now();
    },

    /** Call when buffering ends. */
    onBufferingEnd() {
      if (!session || !session.bufferingStartTime) return;
      const elapsed = Date.now() - session.bufferingStartTime;
      session.bufferingTotalMs += elapsed;
      session.rebufferCount += 1;
      session.bufferingStartTime = null;
    },

    /**
     * Call on bitrate adaptation events.
     * @param {number} bitrateBps
     */
    onBitrateChange(bitrateBps) {
      if (!session) return;
      session.bitrateSamples.push(bitrateBps);
      if (session.bitrateSamples.length > 200) {
        session.bitrateSamples.shift();
      }
    },

    /**
     * Call periodically with estimated bandwidth (Shaka provides this).
     * @param {number} bps
     */
    onBandwidthEstimate(bps) {
      if (session) session.estimatedBandwidthBps = bps;
    },

    /** Call on any player error. */
    onError() {
      if (session) session.errors += 1;
    },

    /**
     * Call on video timeupdate to sample dropped frames.
     * @param {HTMLVideoElement} videoEl
     */
    onTimeUpdate(videoEl) {
      if (!session || !videoEl) return;
      const quality = videoEl.getVideoPlaybackQuality
        ? videoEl.getVideoPlaybackQuality()
        : null;
      if (quality) {
        const total = quality.droppedVideoFrames || 0;
        session.droppedFrames = total;
      }
    },

    /** Call when video ends or player closes – flushes & resets. */
    async onVideoEnd() {
      clearInterval(pushTimer);
      pushTimer = null;
      if (!session) return;
      obs.onPlayPause();
      const metrics = computeMetrics();
      session = null;
      if (metrics) await pushMetrics(metrics);
    },

    /** Force a push now (called by interval). */
    async flush() {
      const metrics = computeMetrics();
      if (metrics) await pushMetrics(metrics);
    }
  };

  function schedulePush() {
    clearInterval(pushTimer);
    pushTimer = setInterval(() => obs.flush(), PUSH_MS);
  }

  // Expose globally so app.js can call obs hooks
  window.OTT_OBS = obs;

  console.info("[OBS] Observability module loaded. Push interval:", PUSH_MS / 1000, "s");
})();
