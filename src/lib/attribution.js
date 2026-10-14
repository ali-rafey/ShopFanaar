// How a shopper found the store, saved with their order so the admin can see
// which Meta campaign — or which organic route — brought it. First-party only;
// nothing here is sent to Meta (the pixel has its own, separate tracking).
//
// Meta ads tag their links with URL parameters. The standard template is
//   utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}
//   &utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{campaign.id}}
// where site_source_name is fb / ig / th / msg / an (Facebook, Instagram,
// Threads, Messenger, Audience Network). Without parameters, a click is
// classified from the referrer and the in-app browser instead.
//
// "Last non-direct touch" attribution: a visit that arrives with no source
// (typed address, bookmark) keeps the credit with the last real source seen
// in the past 30 days — someone who clicks an ad today and comes back to buy
// tomorrow still counts for the ad.

const TOUCH_KEY = "fanaar-touch"; // localStorage: { first, last }
const VISIT_KEY = "fanaar-touch-visit"; // sessionStorage: this visit's touch
const MEMORY_MS = 30 * 864e5;

const PLATFORMS = [
  [/^ig$|instagram/, "Instagram"],
  [/^fb$|facebook|^meta$/, "Facebook"],
  [/^th$|threads/, "Threads"],
  [/^msg$|messenger/, "Messenger"],
  [/^an$|audience/, "Audience Network"],
  [/^wa$|whatsapp/, "WhatsApp"],
  [/tiktok/, "TikTok"],
  [/pinterest/, "Pinterest"],
  [/youtube|youtu\.be/, "YouTube"],
  [/google/, "Google"],
  [/bing/, "Bing"],
];
const platformOf = (s) => PLATFORMS.find(([re]) => re.test(s))?.[1];
const bare = (host) => host.replace(/^www\./, "");
const clip = (s, n = 150) => (s ? String(s).trim().slice(0, n) : undefined);

// Where this visit came from, read from the landing URL — once per tab.
function readTouch() {
  const q = new URLSearchParams(window.location.search);
  const utmSource = (q.get("utm_source") || "").trim().toLowerCase();
  const medium = (q.get("utm_medium") || "").toLowerCase();
  const paid = /paid|cpc|ppc|cpm|^ads?$/.test(medium) || q.has("gclid") || q.has("gbraid") || q.has("wbraid");
  let referrer = "";
  try {
    referrer = bare(new URL(document.referrer).hostname);
  } catch {
    /* no referrer */
  }
  if (referrer === bare(window.location.hostname)) referrer = "";
  const ua = navigator.userAgent;
  const inApp = /Instagram/.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : /musical_ly|TikTok/i.test(ua) ? "TikTok" : "";

  const platform =
    (utmSource && (platformOf(utmSource) || utmSource.charAt(0).toUpperCase() + utmSource.slice(1))) ||
    inApp ||
    (referrer && (platformOf(referrer) || referrer)) ||
    (q.has("fbclid") && "Facebook / Instagram") ||
    (q.has("gclid") && "Google") ||
    "";

  return {
    kind: paid ? "ad" : platform ? "organic" : "direct",
    platform: clip(platform, 40),
    campaign: clip(q.get("utm_campaign")),
    adset: clip(q.get("utm_term")),
    ad: clip(q.get("utm_content")),
    campaign_id: clip(q.get("utm_id"), 40),
    landing: clip(window.location.pathname, 120),
    referrer: clip(referrer, 80),
    at: Date.now(),
  };
}

const storage = (kind) => {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};
const read = (store, key) => {
  try {
    return JSON.parse(store?.getItem(key)) || null;
  } catch {
    return null;
  }
};
const write = (store, key, value) => {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — fine */
  }
};

let memoryVisit = null;

// Call once when the store opens (main.jsx), before the shopper navigates
// away from the landing URL.
export function visitTouch() {
  const session = storage("session");
  const saved = read(session, VISIT_KEY) || memoryVisit;
  if (saved) return saved;
  const touch = readTouch();
  memoryVisit = touch;
  write(session, VISIT_KEY, touch);

  const local = storage("local");
  const kept = read(local, TOUCH_KEY) || {};
  const fresh = kept.last && Date.now() - kept.last.at < MEMORY_MS;
  write(local, TOUCH_KEY, {
    first: kept.first || touch,
    last: touch.kind !== "direct" || !fresh ? touch : kept.last,
  });
  return touch;
}

// Short label, e.g. "Instagram ad", "Google", "Direct" (also used by the live
// visitor count).
export function touchLabel(touch) {
  if (!touch || touch.kind === "direct" || !touch.platform) return "Direct";
  return touch.kind === "ad" ? `${touch.platform} ad` : touch.platform;
}

// What gets saved with an order: the credited touch, plus the very first one
// when it was different.
export function orderSource() {
  visitTouch();
  const { first, last } = read(storage("local"), TOUCH_KEY) || {};
  const credited = last || memoryVisit;
  if (!credited) return null;
  const iso = (ms) => (ms ? new Date(ms).toISOString() : undefined);
  const out = {
    kind: credited.kind,
    platform: credited.platform,
    campaign: credited.campaign,
    adset: credited.adset,
    ad: credited.ad,
    campaign_id: credited.campaign_id,
    landing: credited.landing,
    referrer: credited.referrer,
    touched_at: iso(credited.at),
  };
  if (first && first.at !== credited.at) {
    Object.assign(out, {
      first_kind: first.kind,
      first_platform: first.platform,
      first_campaign: first.campaign,
      first_at: iso(first.at),
    });
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== ""));
}
