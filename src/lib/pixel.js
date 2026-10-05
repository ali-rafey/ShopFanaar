// Meta (Facebook) Pixel integration.
//
// The pixel ID is read from VITE_META_PIXEL_ID at build time, falling back to
// the pixel the old Shopify store used, so ad history stays in the same Meta
// dataset. Override it per-environment with VITE_META_PIXEL_ID (.env.example).
//
// Events: PageView (every route), ViewContent (product page), AddToCart,
// InitiateCheckout (checkout page), Purchase (order accepted, with an
// eventID for de-duplication against a future Conversions API feed).
export const PIXEL_ID =
  import.meta.env.VITE_META_PIXEL_ID || "1278679466701518";

const CURRENCY = "PKR";
let loaded = false;

// Inject the official Meta Pixel base code once. We intentionally do NOT fire
// the initial PageView here — PageView is tracked on every route change
// (including first load) so SPA navigations are counted correctly.
export function initPixel() {
  if (loaded || typeof window === "undefined" || !PIXEL_ID) return;

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
// `eventID` lets Meta de-duplicate against a future server-side
// (Conversions API) event for the same action.
export function track(event, data, eventID) {
  if (typeof window !== "undefined" && window.fbq) {
    if (eventID) window.fbq("track", event, data, { eventID });
    else window.fbq("track", event, data);
  }
}

// ---- Convenience helpers for the storefront's key events ----

export function trackPageView() {
  track("PageView");
}

export function trackViewContent(product) {
  track("ViewContent", {
    content_ids: [String(product.id)],
    content_name: product.title,
    content_type: "product",
    value: product.price,
    currency: CURRENCY,
  });
}

export function trackAddToCart(product, size, qty = 1) {
  track("AddToCart", {
    content_ids: [String(product.id)],
    content_name: product.title,
    content_type: "product",
    contents: [{ id: String(product.id), quantity: qty, variant: size }],
    value: product.price * qty,
    currency: CURRENCY,
  });
}

export function trackInitiateCheckout(items, subtotal) {
  track("InitiateCheckout", {
    content_ids: items.map((i) => String(i.id)),
    content_type: "product",
    contents: items.map((i) => ({ id: String(i.id), quantity: i.qty })),
    num_items: items.reduce((n, i) => n + i.qty, 0),
    value: subtotal,
    currency: CURRENCY,
  });
}

// Fired once, right after the order is accepted by the backend.
export function trackPurchase(order) {
  track(
    "Purchase",
    {
      content_ids: order.items.map((i) => String(i.product_id)),
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
}

export function trackLead() {
  track("Lead", { content_name: "Newsletter" });
}

export function trackContact() {
  track("Contact");
}
