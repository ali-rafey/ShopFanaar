// Shared helpers for sending events to Meta's Conversions API from the
// Vercel functions in api/. Kept outside api/ so Vercel doesn't turn it into
// an endpoint of its own.
//
// Vercel env: META_CAPI_TOKEN (Secret). Optional META_TEST_EVENT_CODE routes
// events to Events Manager → Test events while checking the setup.

const PIXEL_ID = process.env.VITE_META_PIXEL_ID || "1278679466701518";
const GRAPH_URL = `https://graph.facebook.com/v26.0/${PIXEL_ID}/events`;

export function cookie(req, name) {
  const m = String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

// What every website event carries: the shopper's IP, browser, and Meta's
// first-party cookies (set by the pixel, or by src/lib/pixel.js when the
// pixel is blocked).
export function browserUserData(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const data = {
    client_ip_address: req.headers["x-real-ip"] || xff || undefined,
    client_user_agent: req.headers["user-agent"] || undefined,
    fbp: cookie(req, "_fbp"),
    fbc: cookie(req, "_fbc"),
  };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  return data;
}

// The page the event happened on — only ever one of our own pages.
export function sourceUrl(req, given) {
  try {
    const u = new URL(given);
    if (u.protocol === "https:" && /(^|\.)shopfanaar\.com$/.test(u.hostname)) return u.href;
  } catch {
    /* fall through */
  }
  return req.headers.referer || "https://www.shopfanaar.com/";
}

export function parseBody(req) {
  const body = req.body || {};
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

// Resolves { ok, events_received } or { ok: false, message, trace }.
export async function sendToMeta(event) {
  try {
    const res = await fetch(GRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [event],
        access_token: process.env.META_CAPI_TOKEN,
        ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, events_received: result.events_received ?? 0 };
    const message = result.error?.error_user_msg || result.error?.message || "Meta rejected the event";
    return { ok: false, message, trace: result.error?.fbtrace_id || "" };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
