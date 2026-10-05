// Sends a Web Push notification to every admin device that turned on order
// notifications. Called by the database (private.notify_new_order trigger,
// via pg_net) when an order is placed, and by "Send test notification".
//
// The database includes the device subscriptions in the request, so this
// function needs no database access of its own.
//
// Vercel env (both "Secret"): VAPID_PRIVATE_KEY, NOTIFY_SECRET.
import crypto from "node:crypto";
import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "../src/lib/vapid.js";

const SUBJECT = "https://www.shopfanaar.com";

function authorised(req) {
  const expected = process.env.NOTIFY_SECRET || "";
  const given = String(req.headers["x-notify-secret"] || "");
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Tell the database to forget devices the push service says are gone
// (app deleted, notifications turned off).
async function prune(endpoints) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !endpoints.length) return;
  await fetch(`${url}/rest/v1/rpc/prune_push_subscriptions`, {
    method: "POST",
    headers: {
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_secret: process.env.NOTIFY_SECRET, p_endpoints: endpoints }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authorised(req)) return res.status(401).json({ error: "unauthorised" });
  if (!process.env.VAPID_PRIVATE_KEY) return res.status(500).json({ error: "VAPID_PRIVATE_KEY not set" });

  const { title, body, url, tag, pending, subscriptions = [] } = req.body || {};
  webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title, body, url, tag, pending });

  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24, urgency: "high", topic: tag ? tag.slice(0, 32) : undefined }
      )
    )
  );

  const gone = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") return;
    const code = r.reason?.statusCode;
    if (code === 404 || code === 410) gone.push(subscriptions[i].endpoint);
    else errors.push({ code, message: String(r.reason?.body || r.reason?.message || r.reason).slice(0, 200) });
  });
  await prune(gone);

  return res.status(200).json({
    sent: results.length - gone.length - errors.length,
    removed: gone.length,
    errors,
  });
}
