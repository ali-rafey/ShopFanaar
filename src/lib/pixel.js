// Meta (Facebook) Pixel integration.
//
// The pixel ID is read from VITE_META_PIXEL_ID at build time, falling back to
// the same pixel configured on the Shopify store (www.shopfanaar.com) so the
// custom site reports into the same Meta dataset. Override it per-environment
// by setting VITE_META_PIXEL_ID (see .env.example).
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
export function track(event, data) {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", event, data);
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
