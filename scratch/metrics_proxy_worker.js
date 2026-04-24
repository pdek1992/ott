/**
 * VigilSiddhi OTT - Metrics CORS Proxy (Cloudflare Worker)
 * ─────────────────────────────────────────────────────────────
 * This worker solves the "405 Method Not Allowed" error when pushing
 * metrics from the browser to Grafana Cloud.
 *
 * Deployment:
 * 1. Log in to Cloudflare Workers.
 * 2. Create a new Worker.
 * 3. Paste this code and "Save and Deploy".
 * 4. Copy the Worker URL (e.g., https://your-worker.workers.dev)
 *    and paste it into `CORS_PROXY_URL` in `observability.js`.
 * ─────────────────────────────────────────────────────────────
 */

const GRAFANA_PROM_URL = "https://prometheus-prod-43-prod-ap-south-1.grafana.net/api/prom/push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Forward the push to Grafana Cloud
    try {
      const response = await fetch(GRAFANA_PROM_URL, {
        method: "POST",
        headers: {
          "Content-Type": request.headers.get("Content-Type") || "text/plain",
          "Authorization": request.headers.get("Authorization"),
        },
        body: await request.text(),
      });

      // Mirror the response back to the browser
      const responseHeaders = new Headers(response.headers);
      Object.keys(corsHeaders).forEach(h => responseHeaders.set(h, corsHeaders[h]));

      return new Response(await response.text(), {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response("Internal Server Error: " + err.message, { 
        status: 500,
        headers: corsHeaders 
      });
    }
  },
};
