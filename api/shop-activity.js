// Server copies of the pixel's browsing events — PageView, ViewContent,
// AddToCart, InitiateCheckout — for Meta's Conversions API. The browser
// posts each event here with the same event ID it gave the pixel, so Meta
// counts it once, and still gets it when the pixel itself is blocked (ad
// blockers stop connect.facebook.net, not our own /api).
//
// Purchase has its own, stricter path (api/order-confirmed.js). These
// events carry no personal details — only IP, browser and Meta's cookies —
// and their product data is size-capped rather than verified, since a
// faked page view can't be worth much to anyone.
//
// The path deliberately avoids words like "pixel" or "facebook" that ad
// blockers filter.
import { browserUserData, parseBody, sendToMeta, sourceUrl } from "../server/meta.js";

const EVENTS = new Set(["PageView", "ViewContent", "AddToCart", "InitiateCheckout"]);
const EVENT_ID = /^[A-Za-z]+-[A-Za-z0-9-]{8,64}$/;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview/i;

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e7 ? Number(v) : undefined);
const text = (v, max = 120) => (v == null || v === "" ? undefined : String(v).slice(0, max));

// Only the fields the pixel sends, sized down. Currency is always PKR.
function customData(d = {}) {
  const out = {
    content_type: d.content_type === "product" ? "product" : undefined,
    content_name: text(d.content_name),
    content_ids: Array.isArray(d.content_ids) ? d.content_ids.slice(0, 30).map((x) => text(x, 64)) : undefined,
    contents: Array.isArray(d.contents)
      ? d.contents.slice(0, 30).map((c) => ({
          id: text(c?.id, 64),
          quantity: num(c?.quantity),
          item_price: num(c?.item_price),
        }))
      : undefined,
    value: num(d.value),
    num_items: num(d.num_items),
  };
  if (out.value !== undefined) out.currency = "PKR";
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.META_CAPI_TOKEN) return res.status(500).json({ error: "META_CAPI_TOKEN not set" });

  const { event, id, url, data } = parseBody(req);
  if (!EVENTS.has(event)) return res.status(400).json({ error: "unsupported event" });
  if (!EVENT_ID.test(String(id || ""))) return res.status(400).json({ error: "bad event id" });
  if (BOT.test(String(req.headers["user-agent"] || ""))) return res.status(204).end();

  const sent = await sendToMeta({
    event_name: event,
    event_time: Math.floor(Date.now() / 1000),
    event_id: id,
    action_source: "website",
    event_source_url: sourceUrl(req, url),
    user_data: browserUserData(req),
    custom_data: customData(data),
  });
  if (!sent.ok) {
    console.error("shop-activity: Meta error", event, sent.message, sent.trace);
    return res.status(502).json({ error: sent.message });
  }
  return res.status(200).json({ events_received: sent.events_received });
}
