// Approximate location for the admin's live visitor globe (src/lib/visitors.js).
//
// Vercel works out a city from each request's connection and passes it in
// x-vercel-ip-* headers; this just hands that back to the browser, which
// asks once per visit and adds it to its presence pings. Nothing is stored
// here and the IP address itself never leaves Vercel. Kept separate from the
// Meta Pixel / Conversions API.
//
// The path avoids words like "geo" or "track" that ad blockers filter.

function header(req, name) {
  const value = req.headers[name];
  if (!value) return null;
  try {
    return decodeURIComponent(String(value)).slice(0, 80); // city names arrive URL-encoded
  } catch {
    return String(value).slice(0, 80);
  }
}

const coord = (value, limit) => {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    country: header(req, "x-vercel-ip-country"),
    region: header(req, "x-vercel-ip-country-region"),
    city: header(req, "x-vercel-ip-city"),
    lat: coord(req.headers["x-vercel-ip-latitude"], 90),
    lng: coord(req.headers["x-vercel-ip-longitude"], 180),
  });
}
