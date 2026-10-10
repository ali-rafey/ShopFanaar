// Live visitors — Fanaar's own "who's on the store right now" for the admin.
//
// Kept entirely separate from the Meta Pixel / Conversions API (./pixel.js):
// nothing here goes to Meta, and the pixel doesn't depend on any of it.
//
// While a store tab is visible it sends a presence ping every 30 seconds and
// on every page change (supabase/migrations/*_live_visitors.sql): a random id
// for this browser, the page, how the visit arrived, the device type, the
// number of items in the cart and the approximate city (asked once per visit
// from api/shop-region.js). No names, IP addresses or contact details.
import { BACKEND, sendVisit } from "./api";

const BEAT_MS = 30_000;
const ID_KEY = "fanaar-visitor";
const SOURCE_KEY = "fanaar-visit-source";
const PLACE_KEY = "fanaar-visit-place";
const CART_KEY = "fanaar-cart";

let path = null;
let started = false;
let enabled;

export function trackVisit(pathname) {
  enabled ??= shouldCount();
  if (!enabled) return;
  // Order pages carry the order id; only "on an order page" matters here.
  path = (pathname.startsWith("/order/") ? "/order" : pathname.replace(/\/+$/, "") || "/").slice(0, 200);
  if (!started) {
    started = true;
    visitSource(); // read the landing URL now, before the shopper moves on
    lookUpPlace();
    setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", beat);
  }
  beat();
}

// Hidden tabs stay quiet, so a visitor drops off the live count about a
// minute after they leave or switch away.
function beat() {
  if (document.visibilityState !== "visible") return;
  sendVisit({
    p_id: visitorId(),
    p_path: path,
    p_source: visitSource(),
    p_device: deviceType(),
    p_cart_items: cartItems(),
    ...(place?.country && {
      p_country: place.country,
      p_region: place.region,
      p_city: place.city,
      p_lat: place.lat,
      p_lng: place.lng,
    }),
  });
}

// Once per visit (tab session); the first ping goes out without it and the
// next one, sent as soon as the answer arrives, fills it in.
let place = null;
async function lookUpPlace() {
  try {
    place = JSON.parse(sessionStorage.getItem(PLACE_KEY));
    if (place) return;
  } catch {
    /* storage blocked — look it up */
  }
  if (BACKEND !== "supabase") return; // /api only exists on Vercel
  try {
    const res = await fetch("/api/shop-region");
    if (!res.ok) return;
    place = await res.json();
    try {
      sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
    } catch {
      /* fine — kept in memory for this page */
    }
    if (place?.country) beat();
  } catch {
    /* no location — the visitor still counts */
  }
}

function shouldCount() {
  if (BACKEND === "static") return false;
  if (/bot|crawl|spider|slurp|facebookexternalhit|lighthouse|headless/i.test(navigator.userAgent)) return false;
  // The owner's own browsing isn't counted on a browser signed in to the admin.
  try {
    if (Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k))) return false;
  } catch {
    /* storage blocked — count as a normal visitor */
  }
  return true;
}

let memoryId;
function visitorId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) localStorage.setItem(ID_KEY, (id = uuid()));
    return id;
  } catch {
    return (memoryId ??= uuid());
  }
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Worked out once per tab, from the landing page, so browsing around the
// store doesn't turn an Instagram visit into a "Direct" one.
let memorySource;
function visitSource() {
  try {
    let s = sessionStorage.getItem(SOURCE_KEY);
    if (!s) sessionStorage.setItem(SOURCE_KEY, (s = arrivedFrom()));
    return s;
  } catch {
    return (memorySource ??= arrivedFrom());
  }
}

const NAMES = [
  [/instagram|^ig$/, "Instagram"],
  [/facebook|^fb$|^meta$/, "Facebook"],
  [/whatsapp|^wa$/, "WhatsApp"],
  [/tiktok/, "TikTok"],
  [/pinterest/, "Pinterest"],
  [/youtube|youtu\.be/, "YouTube"],
  [/google/, "Google"],
  [/bing/, "Bing"],
];
const named = (s) => NAMES.find(([re]) => re.test(s))?.[1];
const bare = (host) => host.replace(/^www\./, "");

function arrivedFrom() {
  const q = new URLSearchParams(window.location.search);
  const utm = (q.get("utm_source") || "").trim().toLowerCase();
  const paid = /paid|cpc|ppc|cpm|^ads?$/.test((q.get("utm_medium") || "").toLowerCase()) || q.has("gclid");
  let ref = "";
  try {
    ref = bare(new URL(document.referrer).hostname);
  } catch {
    /* no referrer */
  }
  if (ref === bare(window.location.hostname)) ref = "";
  const ua = navigator.userAgent;

  const source =
    (utm && (named(utm) || utm.charAt(0).toUpperCase() + utm.slice(1))) ||
    (/Instagram/.test(ua) && "Instagram") || // Instagram's in-app browser
    (/FBAN|FBAV|FB_IAB/.test(ua) && "Facebook") || // Facebook's in-app browser
    (ref && (named(ref) || ref)) ||
    (q.has("fbclid") && "Facebook / Instagram") ||
    (q.has("gclid") && "Google") ||
    "Direct";
  return (paid ? `${source} ad` : source).slice(0, 40);
}

function deviceType() {
  if (!window.matchMedia("(pointer: coarse)").matches) return "desktop";
  return Math.min(window.screen.width, window.screen.height) >= 600 ? "tablet" : "mobile";
}

function cartItems() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    return items.reduce((n, i) => n + (Number(i.qty) || 0), 0);
  } catch {
    return 0;
  }
}
