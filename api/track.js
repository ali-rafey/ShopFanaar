// Live parcel journey for the storefront's "Track your order" page.
//
// POST { phone, tracking } → { events: [{ at, code, message }] }, oldest first.
//
// The shopper must give the mobile number the parcel was booked to — checked
// against PostEx's own record of the parcel — and only the tracking steps come
// back: never the name, address or amounts. The order list itself (with its
// tracking numbers) comes from track_orders(), which is rate-limited per
// shopper in the database.
import * as postex from "../server/postex.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  const tracking = String(body.tracking || "").replace(/\D/g, "");
  const phone = postex.postexPhone(body.phone);
  if (!/^\d{8,20}$/.test(tracking) || !phone) {
    return res.status(400).json({ error: "Enter your mobile number and the tracking number." });
  }

  let parcel;
  try {
    parcel = await postex.trackOrder(tracking);
  } catch {
    return res.status(502).json({ error: "PostEx didn't answer. Please try again in a minute." });
  }
  // Same answer for "no such parcel" and "not your number".
  if (!parcel || postex.postexPhone(parcel.customerPhone) !== phone) {
    return res.status(404).json({ error: "We couldn't find that parcel for this number." });
  }

  const events = (parcel.transactionStatusHistory || [])
    .map((h) => ({
      at: postex.pakistanTime(h.updatedAt || h.modifiedDatetime),
      code: String(h.transactionStatusMessageCode || "").trim(),
      message: String(h.transactionStatusMessage || "").trim(),
    }))
    .filter((e) => e.message)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return res.status(200).json({ events });
}
