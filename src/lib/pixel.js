// Meta (Facebook) Pixel integration.
//
// The pixel ID is read from VITE_META_PIXEL_ID at build time, falling back to
// the pixel the old Shopify store used, so ad history stays in the same Meta
// dataset. Override it per-environment with VITE_META_PIXEL_ID (.env.example).
//
// Events: PageView (every route), ViewContent (product page), AddToCart,
// AddToWishlist (Save), InitiateCheckout (checkout page), Purchase (order
// accepted, with an eventID that de-duplicates it against the same Purchase
// sent from our server via the Conversions API), Lead (newsletter), Contact
// (contact form).
//
// PageView, ViewContent, AddToCart and InitiateCheckout are also sent to our
// server (api/shop-activity.js) under the same eventID, and Purchase via
// api/order-confirmed.js, so Meta still gets them when an ad blocker or iOS
// stops the pixel.
//
// The pixel starts in main.jsx before React renders, so events fired from a
// page's first effects (e.g. ViewContent on a product landing) are never
// lost. It is never loaded on /admin.
export const PIXEL_ID =
  import.meta.env.VITE_META_PIXEL_ID || "1278679466701518";

const CURRENCY = "PKR";
const SERVER_EVENTS = new Set(["PageView", "ViewContent", "AddToCart", "InitiateCheckout"]);
let loaded = false;

// Meta's first-party cookies: _fbp (this browser) and _fbc (the ad click that
// brought it here, from ?fbclid=). The pixel sets them itself; when an ad
// blocker stops the pixel we set them in Meta's format, so the server copies
// of events can still be matched to the visitor and to the ad.
function ensureMetaCookies() {
  const read = (name) => document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
  const write = (name, value) => {
    const domain = /(^|\.)shopfanaar\.com$/.test(location.hostname) ? "; domain=.shopfanaar.com" : "";
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${value}; max-age=7776000; path=/; SameSite=Lax${domain}${secure}`;
  };
  try {
    if (!read("_fbp")) write("_fbp", `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`);
    const fbclid = new URLSearchParams(location.search).get("fbclid");
    if (fbclid && /^[\w-]+$/.test(fbclid) && !(read("_fbc") || "").endsWith(`.${fbclid}`)) {
      write("_fbc", `fb.1.${Date.now()}.${fbclid}`);
    }
  } catch {
    /* cookies disabled */
  }
}

// Inject the official Meta Pixel base code once. We intentionally do NOT fire
// the initial PageView here — PageView is tracked on every route change
// (including first load) so SPA navigations are counted correctly.
export function initPixel() {
  if (loaded || typeof window === "undefined" || !PIXEL_ID) return;
  ensureMetaCookies(); // before fbevents.js loads, so the pixel adopts them

  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(
    window,
    document,
    "script",
    "https://connect.facebook.net/en_US/fbevents.js"
  );
  /* eslint-enable */

  window.fbq("init", PIXEL_ID);
  loaded = true;
}

// Standard event wrapper — safe no-op if the pixel hasn't loaded.
// `eventID` lets Meta de-duplicate against the server-side
// (Conversions API) copy of the same action.
export function track(event, data, eventID) {
  if (typeof window === "undefined") return;
  // A page's own events (ViewContent, InitiateCheckout…) run before the
  // route-change PageView effect; send that page's PageView first so Meta
  // always sees PageView → event. Never doubles: one PageView per path.
  if (event !== "PageView") trackPageView();
  const mirrored = SERVER_EVENTS.has(event);
  if (mirrored && !eventID) eventID = newEventId(event);
  // Dev builds keep a log (window.__pixelLog) — Meta blocks this pixel on
  // localhost, so this is how events are checked locally.
  if (import.meta.env.DEV) {
    (window.__pixelLog ||= []).push({ event, data, eventID, path: window.location.pathname, fbq: Boolean(window.fbq) });
  }
  if (window.fbq) {
    if (eventID) window.fbq("track", event, data, { eventID });
    else window.fbq("track", event, data);
  }
  if (mirrored) postToServer("/api/shop-activity", { event, id: eventID, url: window.location.href, data });
}

const newEventId = (event) =>
  `${event}-${window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 12)}`;

// Our own /api isn't on ad-blocker lists the way connect.facebook.net is.
// The Vite dev server has no /api, so dev builds skip it.
function postToServer(path, body) {
  if (import.meta.env.DEV) return;
  try {
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true, // survives navigating away
    }).catch(() => {});
  } catch {
    /* never block the page */
  }
}

// ---- Convenience helpers for the storefront's key events ----

const unique = (ids) => [...new Set(ids.map(String))];
let lastPageView = null;

// Once per path: the first call happens at boot (main.jsx), later ones on
// route changes — repeated calls for the same path are ignored.
export function trackPageView(path = window.location.pathname) {
  if (path === lastPageView) return;
  lastPageView = path;
  track("PageView");
}

export function trackViewContent(product) {
  track("ViewContent", {
    content_ids: [String(product.id)],
    content_name: product.title,
    content_type: "product",
    contents: [{ id: String(product.id), quantity: 1, item_price: product.price }],
    value: product.price,
    currency: CURRENCY,
  });
}

export function trackAddToCart(product, size, qty = 1) {
  track("AddToCart", {
    content_ids: [String(product.id)],
    content_name: product.title,
    content_type: "product",
    contents: [{ id: String(product.id), quantity: qty, item_price: product.price, variant: size }],
    value: product.price * qty,
    currency: CURRENCY,
  });
}

export function trackAddToWishlist(product) {
  track("AddToWishlist", {
    content_ids: [String(product.id)],
    content_name: product.title,
    content_type: "product",
    contents: [{ id: String(product.id), quantity: 1, item_price: product.price }],
    value: product.price,
    currency: CURRENCY,
  });
}

export function trackInitiateCheckout(items, subtotal) {
  track("InitiateCheckout", {
    content_ids: unique(items.map((i) => i.id)),
    content_type: "product",
    contents: items.map((i) => ({ id: String(i.id), quantity: i.qty, item_price: i.price })),
    num_items: items.reduce((n, i) => n + i.qty, 0),
    value: subtotal,
    currency: CURRENCY,
  });
}

// Fired once, right after the order is accepted by the backend. The same
// Purchase also goes to Meta from our server (Conversions API,
// api/order-confirmed.js) with the same eventID, so Meta counts it once even
// when the browser pixel is blocked. `customer` is the checkout form: the
// server checks the phone against the order and sends it to Meta hashed.
export function trackPurchase(order, customer) {
  track(
    "Purchase",
    {
      content_ids: unique(order.items.map((i) => i.product_id)),
      content_type: "product",
      contents: order.items.map((i) => ({
        id: String(i.product_id),
        quantity: i.quantity,
        item_price: i.unit_price,
      })),
      num_items: order.items.reduce((n, i) => n + i.quantity, 0),
      value: order.total,
      currency: CURRENCY,
    },
    `order-${order.id}`
  );
  sendServerPurchase(order, customer);
}

function sendServerPurchase(order, customer) {
  if (!customer) return;
  postToServer("/api/order-confirmed", {
    id: order.id,
    phone: customer.phone,
    email: customer.email,
    url: window.location.href,
  });
}

export function trackLead() {
  track("Lead", { content_name: "Newsletter" });
}

export function trackContact() {
  track("Contact");
}
