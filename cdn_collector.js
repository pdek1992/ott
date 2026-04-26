#!/usr/bin/env node
/**
 * cdn_collector.js
 * ─────────────────────────────────────────────────────────────
 * Cloudflare Analytics → Grafana Cloud CDN metrics collector.
 * Optimized for Free Tier using sum maps (countryMap, responseStatusMap, etc.)
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

// Global credentials
let SECRETS = {};
try {
  SECRETS = loadEncryptedConfig();
} catch (err) {
  console.error(`[CDN] FATAL: Could not load configuration: ${err.message}`);
  process.exit(1);
}

const CF_ZONE_ID       = SECRETS.cfZoneId;
const CF_API_TOKEN     = SECRETS.cfApiToken;
const PROM_URL         = SECRETS.prometheusUrl;
const PROM_USER        = SECRETS.prometheusUser;
const PROM_API_KEY     = SECRETS.prometheusApiKey;

const CF_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

function buildQuery(zoneId, fromDate, toDate) {
  return JSON.stringify({
    query: `
      query GetCloudflareAnalytics {
        viewer {
          zones(filter: { zoneTag: "${zoneId}" }) {
            traffic: httpRequests1hGroups(
              limit: 24
              filter: { datetime_geq: "${fromDate}", datetime_leq: "${toDate}" }
              orderBy: [datetime_ASC]
            ) {
              dimensions { datetime }
              sum {
                requests
                cachedRequests
                bytes
                cachedBytes
                threats
                pageViews
                countryMap { clientCountryName, requests }
                responseStatusMap { edgeResponseStatus, requests }
                browserMap { uaBrowserFamily, pageViews }
                clientHTTPVersionMap { clientHTTPProtocol, requests }
                contentTypeMap { edgeResponseContentTypeName, requests }
              }
            }
          }
        }
      }
    `
  });
}

async function fetchCFMetrics() {
  const now = new Date();
  const toDate = now.toISOString();
  const fromDate = new Date(now.getTime() - 24 * 3600000).toISOString(); // Last 24 hours

  const queryPayload = buildQuery(CF_ZONE_ID, fromDate, toDate);

  return new Promise((resolve, reject) => {
    const options = {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": queryPayload.length
      }
    };

    const req = https.request(CF_GRAPHQL_URL, options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (json.errors) {
            return reject(new Error(`CF GraphQL errors: ${JSON.stringify(json.errors)}`));
          }
          resolve(json.data.viewer.zones[0]);
        } catch (e) {
          reject(new Error(`Failed to parse CF response: ${e.message}`));
        }
      });
    });

    req.on("error", reject);
    req.write(queryPayload);
    req.end();
  });
}

function esc(val) {
  return String(val).replace(/ /g, "\\ ").replace(/,/g, "\\,").replace(/=/g, "\\=");
}

async function pushToGrafana(zoneData) {
  if (!zoneData || !zoneData.traffic) return;

  const allLines = [];
  const baseTags = `zone_id=${CF_ZONE_ID}`;

  // TRANSFORM URL: Grafana Cloud Influx endpoint
  const influxUrlStr = PROM_URL
    .replace("prometheus", "influx")
    .replace("/api/prom/push", "/api/v1/push/influx/write");
  
  const url = new URL(influxUrlStr);

  for (const hour of zoneData.traffic) {
    const tsNs = new Date(hour.dimensions.datetime).getTime() * 1000000;
    const s = hour.sum;

    // 1. Core Metrics
    allLines.push(`cdn_requests,${baseTags} value=${s.requests}u ${tsNs}`);
    allLines.push(`cdn_cached_requests,${baseTags} value=${s.cachedRequests}u ${tsNs}`);
    allLines.push(`cdn_bytes,${baseTags} value=${s.bytes}u ${tsNs}`);
    allLines.push(`cdn_cached_bytes,${baseTags} value=${s.cachedBytes}u ${tsNs}`);
    allLines.push(`cdn_pageviews,${baseTags} value=${s.pageViews}u ${tsNs}`);
    allLines.push(`cdn_threats,${baseTags} value=${s.threats}u ${tsNs}`);

    // 2. Country Breakdown (from Map)
    if (s.countryMap) {
      for (const entry of s.countryMap) {
        const country = entry.clientCountryName || "Unknown";
        allLines.push(`cdn_requests_by_country,${baseTags},country=${esc(country)} value=${entry.requests}u ${tsNs}`);
      }
    }

    // 3. Status Breakdown (from Map)
    if (s.responseStatusMap) {
      for (const entry of s.responseStatusMap) {
        allLines.push(`cdn_requests_by_status,${baseTags},status=${entry.edgeResponseStatus} value=${entry.requests}u ${tsNs}`);
      }
    }

    // 4. Browser Breakdown (from Map)
    if (s.browserMap) {
      for (const entry of s.browserMap) {
        const browser = entry.uaBrowserFamily || "Unknown";
        allLines.push(`cdn_requests_by_browser,${baseTags},browser=${esc(browser)} value=${entry.pageViews}u ${tsNs}`);
      }
    }

    // 5. HTTP Version Breakdown (from Map)
    if (s.clientHTTPVersionMap) {
      for (const entry of s.clientHTTPVersionMap) {
        allLines.push(`cdn_requests_by_http_version,${baseTags},version=${entry.clientHTTPProtocol} value=${entry.requests}u ${tsNs}`);
      }
    }

    // 6. Content Type Breakdown (from Map)
    if (s.contentTypeMap) {
      for (const entry of s.contentTypeMap) {
        const type = entry.edgeResponseContentTypeName || "Unknown";
        allLines.push(`cdn_requests_by_content_type,${baseTags},type=${esc(type)} value=${entry.requests}u ${tsNs}`);
      }
    }
  }

  if (allLines.length === 0) {
    console.log("[CDN] No metrics to push.");
    return;
  }

  const payload = allLines.join("\n") + "\n";
  
  // ── Calculate Summary for Console (as requested) ──
  const latest = zoneData.traffic[zoneData.traffic.length - 1].sum;
  const uncachedReq = latest.requests - latest.cachedRequests;
  const uncachedBytes = latest.bytes - latest.cachedBytes;
  const chr = latest.requests ? latest.cachedRequests / latest.requests : 0;
  const bhr = latest.bytes ? latest.cachedBytes / latest.bytes : 0;

  const originReq = uncachedReq;
  const originBytes = uncachedBytes;
  const reqPerPageview = latest.pageViews ? latest.requests / latest.pageViews : 0;
  const avgBytesPerReq = latest.requests ? latest.bytes / latest.requests : 0;
  const avgBytesPerCachedReq = latest.cachedRequests ? latest.cachedBytes / latest.cachedRequests : 0;

  console.log("\n📊 ===== CDN ANALYTICS (SUMMARY) =====\n");
  console.log(`${"requests".padEnd(30)} : ${latest.requests}`);
  console.log(`${"cached_requests".padEnd(30)} : ${latest.cachedRequests}`);
  console.log(`${"uncached_requests".padEnd(30)} : ${uncachedReq}`);
  console.log(`${"total_bytes".padEnd(30)} : ${(latest.bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`${"cached_bytes".padEnd(30)} : ${(latest.cachedBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`${"uncached_bytes".padEnd(30)} : ${(uncachedBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`${"cache_hit_ratio".padEnd(30)} : ${chr.toFixed(4)}`);
  console.log(`${"byte_hit_ratio".padEnd(30)} : ${bhr.toFixed(4)}`);
  console.log(`${"bandwidth_saved_ratio".padEnd(30)} : ${bhr.toFixed(4)}`);
  console.log(`${"origin_requests".padEnd(30)} : ${originReq}`);
  console.log(`${"origin_bytes".padEnd(30)} : ${(originBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`${"pageViews".padEnd(30)} : ${latest.pageViews}`);
  console.log(`${"requests_per_pageview".padEnd(30)} : ${reqPerPageview}`);
  console.log(`${"avg_bytes_per_request".padEnd(30)} : ${avgBytesPerReq}`);
  console.log(`${"avg_bytes_per_cached_request".padEnd(30)} : ${avgBytesPerCachedReq}`);
  console.log(`${"threats".padEnd(30)} : ${latest.threats}`);
  console.log("\n=======================================\n");

  // Log detailed breakdown metrics if requested for start_metrics.bat logs
  console.log("[CDN] --- Detailed breakdown metrics being pushed ---");
  // (Optional: filter out the 500+ lines to keep log clean, or show all)
  console.log(`[CDN] Pushing ${allLines.length} lines covering Geo, Status, Browser, Version, and Content Type.`);
  console.log("[CDN] -----------------------------------------------");

  const auth = Buffer.from(`${PROM_USER}:${PROM_API_KEY}`).toString("base64");
  
  const options = {
    method: "POST",
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "text/plain",
      "Content-Length": Buffer.byteLength(payload)
    }
  };

  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let body = "";
      res.on("data", (d) => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[CDN] Pushed ${allLines.length} metric lines to Grafana Cloud.`);
          resolve();
        } else {
          reject(new Error(`Grafana push failed (${res.statusCode}): ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("[CDN] Starting Cloudflare → Grafana metrics collector (Map-mode)...");
  try {
    const data = await fetchCFMetrics();
    await pushToGrafana(data);
  } catch (err) {
    console.error(`[CDN] Fatal error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

run();
