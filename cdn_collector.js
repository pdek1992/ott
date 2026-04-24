#!/usr/bin/env node
/**
 * cdn_collector.js
 * ─────────────────────────────────────────────────────────────
 * Cloudflare Analytics → Grafana Cloud CDN metrics collector.
 *
 * Run via:  node cdn_collector.js
 * Or via GitHub Actions (see .github/workflows/cdn_metrics.yml)
 *
 * CREDENTIALS (set as env vars or in observability_config on server):
 *  CF_ACCOUNT_ID       – Cloudflare account ID
 *  CF_ZONE_ID          – Cloudflare zone ID for your domain
 *  CF_API_TOKEN        – Cloudflare API token (Analytics:Read)
 *  GRAFANA_PROM_URL    – Prometheus remote_write endpoint
 *  GRAFANA_PROM_USER   – Grafana metrics instance ID (username)
 *  GRAFANA_PROM_API_KEY– Grafana Cloud API key (MetricsPublisher role)
 *
 * GitHub Actions secrets to configure:
 *  Settings → Secrets → Actions → add all 6 above
 */

"use strict";

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const crypto= require("crypto");

/* ── decryption helper ───────────────────── */
const PASSPHRASE = "VIGIL_SIDDHI_PROD_2026";

function decryptData(blob, phrase) {
  try {
    const key = crypto.createHash("sha256").update(phrase).digest();
    const iv = Buffer.from(blob.iv.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const fullCipher = Buffer.from(blob.ciphertext.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    
    // Tag is last 16 bytes in our Python/Node output format
    const ciphertext = fullCipher.subarray(0, fullCipher.length - 16);
    const tag = fullCipher.subarray(fullCipher.length - 16);
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    throw new Error("Decryption failed. Check passphrase and blob format.");
  }
}

function loadEncryptedConfig() {
  const configPath = path.join(__dirname, "keys", "observability.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config at: ${configPath}`);
  }
  const blob = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (blob.encrypted) {
    return decryptData(blob, PASSPHRASE);
  }
  return blob;
}

// Global credentials loaded from encrypted file
let SECRETS = {};
try {
  SECRETS = loadEncryptedConfig();
} catch (err) {
  console.error(`[CDN] FATAL: Could not load configuration: ${err.message}`);
  process.exit(1);
}

const CF_ACCOUNT_ID    = SECRETS.cfAccountId;
const CF_ZONE_ID       = SECRETS.cfZoneId;
const CF_API_TOKEN     = SECRETS.cfApiToken;
const PROM_URL         = SECRETS.prometheusUrl || "https://prometheus-prod-43-prod-ap-south-1.grafana.net/api/prom/push";
const PROM_USER        = SECRETS.prometheusUser;
const PROM_API_KEY     = SECRETS.prometheusApiKey;

/* ── Cloudflare GraphQL API ──────────────────────────────────── */
const CF_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

function buildQuery(zoneId, fromDate, toDate) {
  return JSON.stringify({
    query: `
      query {
        viewer {
          zones(filter: { zoneTag: "${zoneId}" }) {
            httpRequests1hGroups(
              limit: 1
              filter: {
                datetime_geq: "${fromDate}"
                datetime_leq: "${toDate}"
              }
            ) {
              sum {
                requests
                cachedRequests
                bytes
                cachedBytes
                threats
                pageViews
                responseStatusMap {
                  edgeResponseStatus
                  requests
                }
              }
            }
          }
        }
      }
    `
  });
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const lib = options.protocol === "http:" ? http : https;
    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchCfMetrics() {
  const now   = new Date();
  const from  = new Date(now - 2 * 60 * 60 * 1000); // 2 h window (hourly granularity)
  const query = buildQuery(
    CF_ZONE_ID,
    from.toISOString().replace(/\.\d+Z/, "Z"),
    now.toISOString().replace(/\.\d+Z/, "Z")
  );

  const urlObj = new URL(CF_GRAPHQL_URL);
  const options = {
    hostname: urlObj.hostname,
    port:     urlObj.port || 443,
    path:     urlObj.pathname,
    method:   "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Length": Buffer.byteLength(query)
    }
  };

  const { status, body } = await httpRequest(options, query);
  if (status !== 200) {
    throw new Error(`CF API responded ${status}: ${body.slice(0, 300)}`);
  }

  const parsed = JSON.parse(body);
  if (parsed.errors && parsed.errors.length) {
    throw new Error("CF GraphQL errors: " + JSON.stringify(parsed.errors));
  }

  const groups = parsed.data?.viewer?.zones?.[0]?.httpRequests1hGroups;
  if (!groups || groups.length === 0) {
    console.warn("[CDN] No Cloudflare data returned for the requested window.");
    return null;
  }

  const sum = groups[0].sum;
  const requests       = sum.requests       || 0;
  const cachedRequests = sum.cachedRequests || 0;
  const bytes          = sum.bytes          || 0;
  const cachedBytes    = sum.cachedBytes    || 0;
  const threats        = sum.threats        || 0;
  const pageViews      = sum.pageViews      || 0;
  // uniques field removed due to CF API plan restrictions

  // Count 4xx and 5xx from the status map
  let errors4xx = 0;
  let errors5xx = 0;
  for (const entry of (sum.responseStatusMap || [])) {
    const code = entry.edgeResponseStatus || 0;
    if (code >= 400 && code < 500) errors4xx += entry.requests || 0;
    if (code >= 500)               errors5xx += entry.requests || 0;
  }

  const cacheHitRatio    = requests > 0 ? cachedRequests / requests : 0;
  const bandwidthSavedRatio = bytes > 0 ? cachedBytes / bytes : 0;
  const errorRate        = requests > 0 ? (errors4xx + errors5xx) / requests : 0;

  return {
    requests,
    cachedRequests,
    bytes,
    cachedBytes,
    threats,
    pageViews,
    errors4xx,
    errors5xx,
    cacheHitRatio,
    bandwidthSavedRatio,
    errorRate
  };
}

/* ── Grafana Cloud InfluxDB Compatibility (Zero-Dependency) ── */
async function pushToGrafana(metrics) {
  // Convert Prometheus URL to Influx compatibility URL
  // e.g. https://prometheus-prod-43-prod-ap-south-1... -> https://influx-prod-43-prod-ap-south-1...
  const influxUrl = PROM_URL.replace("prometheus", "influx")
                            .replace("/api/prom/push", "/api/v1/push/influx/write");

  const tsNs = Date.now() * 1000000; // Influx uses nanoseconds
  const zone = CF_ZONE_ID;

  // Influx Line Protocol: measurement,tag=val field=val timestamp
  const lines = [
    `cdn_requests_total,zone=${zone} count=${metrics.requests}u ${tsNs}`,
    `cdn_cached_requests,zone=${zone} count=${metrics.cachedRequests}u ${tsNs}`,
    `cdn_bandwidth_bytes,zone=${zone} bytes=${metrics.bytes}u ${tsNs}`,
    `cdn_cached_bandwidth,zone=${zone} bytes=${metrics.cachedBytes}u ${tsNs}`,
    `cdn_cache_hit_ratio,zone=${zone} value=${metrics.cacheHitRatio.toFixed(4)} ${tsNs}`,
    `cdn_bandwidth_saved_ratio,zone=${zone} value=${metrics.bandwidthSavedRatio.toFixed(4)} ${tsNs}`,
    `cdn_error_rate,zone=${zone} value=${metrics.errorRate.toFixed(6)} ${tsNs}`,
    `cdn_errors_4xx,zone=${zone} count=${metrics.errors4xx}u ${tsNs}`,
    `cdn_errors_5xx,zone=${zone} count=${metrics.errors5xx}u ${tsNs}`,
    `cdn_threats,zone=${zone} count=${metrics.threats}u ${tsNs}`,
    `cdn_pageviews,zone=${zone} count=${metrics.pageViews}u ${tsNs}`
  ].join("\n");

  const basicAuth = Buffer.from(`${PROM_USER}:${PROM_API_KEY}`).toString("base64");
  const urlObj    = new URL(influxUrl);
  const options   = {
    hostname: urlObj.hostname,
    port:     443,
    path:     urlObj.pathname,
    method:   "POST",
    headers: {
      "Content-Type":   "text/plain",
      "Authorization":  `Basic ${basicAuth}`,
      "Content-Length": Buffer.byteLength(lines)
    }
  };

  const { status, body } = await httpRequest(options, lines);
  
  if (status === 429) {
    console.warn(`[CDN] Grafana rate limit hit (429). Skipping push cycle.`);
    return;
  } else if (status < 200 || status >= 300) {
    // If Influx endpoint fails, fall back to helpful error
    throw new Error(`Grafana Influx-push failed ${status}: ${body.slice(0, 200)}`);
  }

  console.log(`[CDN] Pushed to Grafana OK (${status}). Metrics:`, {
    requests: metrics.requests,
    cacheHitRatio: metrics.cacheHitRatio.toFixed(3),
    errorRate: metrics.errorRate.toFixed(5)
  });
}

/* ── main ────────────────────────────────────────────────────── */
(async () => {
  console.log("[CDN] Starting Cloudflare → Grafana metrics collector…");

  if (CF_API_TOKEN === "REPLACE_ME" || PROM_API_KEY === "REPLACE_ME") {
    console.error("[CDN] ERROR: Missing environment variables. See README / observability_config.js for required secrets.");
    process.exit(1);
  }

  try {
    const metrics = await fetchCfMetrics();
    if (metrics) {
      await pushToGrafana(metrics);
    }
  } catch (err) {
    console.error("[CDN] Fatal error:", err.message);
    process.exit(1);
  }
})();
