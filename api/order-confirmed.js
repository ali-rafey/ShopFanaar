// Sends each website order to Meta's Conversions API as a server-side
// Purchase, next to the browser pixel's Purchase. Both carry the same event
// ID (order-<uuid>), so Meta counts the order once — and still gets it when
// an ad blocker or iOS stops the pixel in the shopper's browser.
//
// Called by the checkout page right after place_order succeeds. Nothing the
// browser sends is taken on trust: the order is re-read from the database,
// must be under an hour old, and the phone number sent must match the one on
// the order. Personal details are SHA-256 hashed here before they go to
// Meta, as Meta requires.
//
// Vercel env: META_CAPI_TOKEN (Secret) — Events Manager → fanaar's pixel →
// Settings → Conversions API → Generate access token. See server/meta.js.
//
// The path deliberately avoids words like "pixel" or "facebook" that ad
// blockers filter.
import crypto from "node:crypto";
import { browserUserData, parseBody, sendToMeta, sourceUrl } from "../server/meta.js";

const MAX_AGE_MS = 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
// Meta's normalisation for names and cities: lowercase, letters/digits only.
const squash = (s) =>
  String(s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const hashed = (s) => (s ? [sha256(s)] : undefined);

// place_order() stores every mobile as 03001234567 whatever the shopper
// typed (+92 300…, 0300-…); get_order_public() masks it as 0300*****67.
// Normalise and mask the same way so the two can be compared.
const localPhone = (s) => "0" + String(s || "").replace(/[^0-9]/g, "").replace(/^(0092|92|0)/, "");
const maskPhone = (p) => p.slice(0, 4) + "*****" + p.slice(9);

async function supabase(path, body) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${path.split("?")[0]} ${res.status}`);
  return res.json();
}

// The pixel reports catalog product ids; the order snapshot only has handles.
async function productIds(handles) {
  const list = [...new Set(handles.filter(Boolean))];
  if (!list.length) return {};
  const rows = await supabase(`products?select=id,handle&handle=in.(${list.join(",")})`).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.handle, String(r.id)]));
}


export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.META_CAPI_TOKEN) return res.status(500).json({ error: "META_CAPI_TOKEN not set" });

  const { id, phone, email, url } = parseBody(req);
  if (!UUID.test(String(id || ""))) return res.status(400).json({ error: "bad order id" });

  let order;
  try {
    order = await supabase("rpc/get_order_public", { p_id: id });
  } catch (err) {
    console.error("order-confirmed: order lookup failed", err.message);
    return res.status(502).json({ error: "order lookup failed" });
  }
  if (!order) return res.status(404).json({ error: "no such order" });

  const local = localPhone(phone);
  if (!/^03\d{9}$/.test(local) || maskPhone(local) !== order.phone) {
    return res.status(403).json({ error: "phone mismatch" });
  }
  if (Date.now() - new Date(order.created_at).getTime() > MAX_AGE_MS) {
    return res.status(409).json({ error: "order too old" });
  }
  if (order.status === "cancelled") return res.status(409).json({ error: "order cancelled" });

  const ids = await productIds(order.items.map((i) => i.handle));
  const idFor = (i) => ids[i.handle] || i.handle || i.title;
  const names = String(order.customer_name || "").trim().split(/\s+/);
  const cleanEmail = String(email || "").trim().toLowerCase();

  const userData = {
    ph: hashed(`92${local.slice(1)}`), // international form, as Meta expects
    em: hashed(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail) ? cleanEmail : ""),
    fn: hashed(squash(names[0])),
    ln: hashed(names.length > 1 ? squash(names[names.length - 1]) : ""),
    ct: hashed(squash(order.city)),
    country: hashed("pk"),
    ...browserUserData(req),
  };
  Object.keys(userData).forEach((k) => userData[k] === undefined && delete userData[k]);

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(new Date(order.created_at).getTime() / 1000),
    event_id: `order-${order.id}`,
    action_source: "website",
    event_source_url: sourceUrl(req, url),
    user_data: userData,
    custom_data: {
      currency: "PKR",
      value: order.total,
      content_type: "product",
      content_ids: [...new Set(order.items.map(idFor))],
      contents: order.items.map((i) => ({ id: idFor(i), quantity: i.quantity, item_price: i.unit_price })),
      num_items: order.items.reduce((n, i) => n + i.quantity, 0),
      order_id: String(order.order_number),
    },
  };

  const sent = await sendToMeta(event);
  if (!sent.ok) {
    console.error("order-confirmed: Meta error", sent.message, sent.trace);
    return res.status(502).json({ error: sent.message });
  }
  return res.status(200).json({ events_received: sent.events_received });
}
