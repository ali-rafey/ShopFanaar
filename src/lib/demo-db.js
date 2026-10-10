// Development-only stand-in for Supabase: a tiny database in localStorage,
// seeded from src/data/store.js. It mirrors the rules in
// supabase/migrations/*_init.sql closely enough to click through checkout and
// the admin before Supabase keys exist. Never included in production builds
// (see loadDemo in ./api.js).
import { products as P, collections as C, defaultSizeChart } from "../data/store";
import { ApiError } from "./api";

const DB_KEY = "fanaar-demo-db-v1";
const SESSION_KEY = "fanaar-demo-session";
const listeners = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const now = () => new Date().toISOString();
const fail = (msg) => {
  throw new ApiError(msg, "P0001");
};

function seed() {
  const t = now();
  return {
    products: P.map((p, i) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      description: p.description,
      disclaimer: p.disclaimer,
      price: p.price,
      compare_at_price: p.compareAtPrice,
      size_chart: clone(defaultSizeChart),
      images: [...p.images],
      collections: [...p.collections],
      status: "active",
      position: i,
      created_at: t,
      updated_at: t,
    })),
    variants: P.flatMap((p) =>
      p.sizes.map((s, i) => ({
        id: crypto.randomUUID(),
        product_id: p.id,
        size: s.size,
        stock: s.qty,
        sku: null,
        position: i,
      }))
    ),
    collections: C.map((c, i) => ({
      handle: c.handle,
      title: c.title,
      nav_group: c.group,
      position: i,
    })),
    settings: { shipping_fee: 250, free_shipping_threshold: null, accepting_orders: true },
    orders: [],
    items: [],
    events: [],
    subscribers: [],
    messages: [],
    seq: 1001,
  };
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(DB_KEY));
    if (d && d.products) return d;
  } catch {
    /* fall through to a fresh seed */
  }
  const d = seed();
  localStorage.setItem(DB_KEY, JSON.stringify(d));
  return d;
}

async function tx(fn) {
  await sleep(120); // feel like a network round trip
  const d = load();
  const result = fn(d);
  localStorage.setItem(DB_KEY, JSON.stringify(d));
  return clone(result);
}

const withVariants = (d, p) => ({
  ...p,
  product_variants: d.variants.filter((v) => v.product_id === p.id),
});

const byPosition = (a, b) =>
  a.position - b.position || b.created_at.localeCompare(a.created_at);

function addEvent(d, order_id, kind, status, message) {
  d.events.push({ id: d.events.length + 1, order_id, kind, status, message, created_at: now() });
}

// ---------------------------------------------------------------- storefront

export function catalogRows() {
  return tx((d) => [
    d.products.filter((p) => p.status === "active").sort(byPosition).map((p) => withVariants(d, p)),
    [...d.collections].sort((a, b) => a.position - b.position),
    [d.settings],
  ]);
}

export async function placeOrder(payload) {
  const { customer: c = {}, items = [] } = payload;
  const result = await tx((d) => {
    if (!d.settings.accepting_orders) fail("We are not taking orders right now. Please check back soon.");
    const phone = String(c.phone || "").replace(/\D/g, "").replace(/^(0092|92|0)/, "");
    if (!c.name || c.name.trim().length < 2) fail("Please enter your full name.");
    if (!/^3\d{9}$/.test(phone)) fail("Please enter a valid mobile number, e.g. 0300 1234567.");
    if (!c.address || c.address.trim().length < 5) fail("Please enter your full delivery address.");
    if (!c.city || c.city.trim().length < 2) fail("Please enter your city.");
    if (!items.length) fail("Your cart is empty.");

    const merged = new Map();
    for (const i of items) {
      const k = `${i.product_id}|${i.size}`;
      merged.set(k, { ...i, qty: (merged.get(k)?.qty || 0) + i.qty });
    }
    const lines = [...merged.values()].map((i) => {
      const p = d.products.find((x) => x.id === i.product_id);
      const v = d.variants.find((x) => x.product_id === i.product_id && x.size === i.size);
      if (!p || !v || p.status !== "active") fail("Sorry, an item in your cart is no longer available.");
      if (v.stock < i.qty) {
        fail(v.stock === 0
          ? `${p.title} (size ${i.size}) has just sold out.`
          : `Only ${v.stock} left of ${p.title} in size ${i.size}.`);
      }
      return { v, product_id: p.id, variant_id: v.id, title: p.title, handle: p.handle, size: i.size, image: p.images[0] || null, unit_price: p.price, quantity: i.qty };
    });

    const subtotal = lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);
    const s = d.settings;
    const shipping_fee = s.free_shipping_threshold != null && subtotal >= s.free_shipping_threshold ? 0 : s.shipping_fee;
    const order = {
      id: crypto.randomUUID(),
      order_number: d.seq++,
      status: "pending",
      payment_method: "cod",
      payment_status: "unpaid",
      customer_name: c.name.trim(),
      phone: "0" + phone,
      email: c.email?.trim().toLowerCase() || null,
      address: c.address.trim(),
      city: c.city.trim(),
      postal_code: c.postal_code?.trim() || null,
      customer_note: c.note?.trim() || null,
      subtotal,
      shipping_fee,
      discount: 0,
      total: subtotal + shipping_fee,
      courier: null,
      tracking_number: null,
      admin_note: null,
      restocked: false,
      created_at: now(),
      updated_at: now(),
    };
    d.orders.push(order);
    for (const { v, ...l } of lines) {
      v.stock -= l.quantity;
      d.items.push({ id: crypto.randomUUID(), order_id: order.id, ...l });
    }
    addEvent(d, order.id, "status", "pending", "Order placed on the website");
    return {
      id: order.id,
      order_number: order.order_number,
      subtotal,
      shipping_fee,
      total: order.total,
      items: lines.map(({ v, ...l }) => l),
    };
  });
  listeners.forEach((fn) => fn({ eventType: "INSERT", new: { id: result.id, order_number: result.order_number, customer_name: payload.customer.name, total: result.total } }));
  return result;
}

export function getOrderPublic(id) {
  return tx((d) => {
    const o = d.orders.find((x) => x.id === id);
    if (!o) return null;
    return {
      ...o,
      phone: o.phone.slice(0, 4) + "*****" + o.phone.slice(9),
      items: d.items.filter((i) => i.order_id === id),
    };
  });
}

export function subscribe(email) {
  return tx((d) => {
    const e = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail("Please enter a valid email address.");
    d.subscribers ||= [];
    if (d.subscribers.some((s) => s.email === e)) return "already";
    d.subscribers.push({ id: Date.now(), email: e, created_at: now() });
    return "subscribed";
  });
}

export function sendContactMessage(p) {
  return tx((d) => {
    if (!p.name || p.name.trim().length < 2) fail("Please enter your name.");
    if (!p.email?.trim() && !p.phone?.trim()) fail("Please leave an email or phone number so we can reply.");
    if (!p.message || p.message.trim().length < 5) fail("Please write a message (up to 2000 characters).");
    d.messages ||= [];
    d.messages.push({
      id: Date.now(),
      name: p.name.trim(),
      email: p.email?.trim().toLowerCase() || null,
      phone: p.phone?.trim() || null,
      order_number: Number(String(p.order_number || "").replace(/\D/g, "")) || null,
      message: p.message.trim(),
      status: "new",
      created_at: now(),
    });
  });
}

// --------------------------------------------------------------------- auth

export async function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export async function signIn(email) {
  await sleep(200);
  const session = { user: { id: "demo-admin", email: email || "admin@demo" } };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session.user;
}

export async function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

// -------------------------------------------------------------------- admin

// ------------------------------------------------------------ live visitors
// Mirrors shop_presence / live_visitors in *_live_visitors.sql.

const VISIT_GAP = 30 * 60e3;
const LIVE_MS = 75e3;

export function shopPresence({ p_id, p_path, p_source, p_device, p_cart_items, p_country, p_region, p_city, p_lat, p_lng }) {
  return tx((d) => {
    d.visitors ||= [];
    const t = Date.now();
    const place = p_country ? { country: p_country, region: p_region, city: p_city, lat: p_lat, lng: p_lng } : {};
    const v = d.visitors.find((x) => x.id === p_id);
    if (!v) {
      d.visitors.push({ id: p_id, first_seen: t, visit_start: t, last_seen: t, visits: 1, path: p_path, source: p_source, device: p_device, cart_items: p_cart_items, ...place });
      return;
    }
    if (t - v.last_seen > VISIT_GAP) Object.assign(v, { visit_start: t, visits: v.visits + 1, source: p_source });
    Object.assign(v, { last_seen: t, path: p_path, device: p_device, cart_items: p_cart_items, ...place });
  });
}

export function liveVisitors() {
  return tx((d) => {
    const t = Date.now();
    const all = d.visitors || [];
    const live = all.filter((v) => t - v.last_seen < LIVE_MS);
    const count = (key) =>
      Object.entries(live.reduce((m, v) => ({ ...m, [v[key]]: (m[v[key]] || 0) + 1 }), {}))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      now: live.length,
      checking_out: live.filter((v) => v.path === "/checkout").length,
      with_cart: live.filter((v) => v.cart_items > 0 && v.path !== "/checkout" && v.path !== "/order").length,
      ordered: live.filter((v) => v.path === "/order").length,
      pages: count("path").slice(0, 8).map(([path, n]) => ({
        path,
        n,
        title: d.products.find((p) => path === `/products/${p.handle}`)?.title || null,
      })),
      sources: count("source").map(([source, n]) => ({ source, n })),
      devices: Object.fromEntries(count("device")),
      places: Object.values(
        live
          .filter((v) => v.country)
          .reduce((m, v) => {
            const k = `${v.country}|${v.city || ""}`;
            m[k] ||= { city: v.city || null, country: v.country, lat: v.lat, lng: v.lng, n: 0 };
            m[k].n += 1;
            return m;
          }, {})
      ).sort((a, b) => b.n - a.n),
      last_30m: all.filter((v) => t - v.last_seen < 30 * 60e3).length,
      today: all.filter((v) => v.last_seen >= today.getTime()).length,
    };
  });
}

export function stats() {
  return tx((d) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = Date.now() - 30 * 864e5;
    const live = (o) => !["cancelled", "returned"].includes(o.status);
    const by_status = {};
    d.orders.forEach((o) => (by_status[o.status] = (by_status[o.status] || 0) + 1));
    const todays = d.orders.filter((o) => new Date(o.created_at) >= today);
    const recent = d.orders.filter((o) => new Date(o.created_at) > month && live(o));
    return {
      by_status,
      orders_today: todays.length,
      revenue_today: todays.filter(live).reduce((n, o) => n + o.total, 0),
      orders_30d: recent.length,
      revenue_30d: recent.reduce((n, o) => n + o.total, 0),
      low_stock: d.variants
        .map((v) => ({ v, p: d.products.find((p) => p.id === v.product_id) }))
        .filter(({ v, p }) => p && p.status === "active" && v.stock <= 3)
        .sort((a, b) => a.v.stock - b.v.stock || a.p.title.localeCompare(b.p.title))
        .slice(0, 20)
        .map(({ v, p }) => ({ id: p.id, title: p.title, handle: p.handle, size: v.size, stock: v.stock })),
      unread_messages: (d.messages || []).filter((m) => m.status === "new").length,
      subscribers: (d.subscribers || []).length,
    };
  });
}

export function listMessages(status) {
  return tx((d) =>
    (d.messages || [])
      .filter((m) => (status ? m.status === status : m.status !== "archived"))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  );
}

export function setMessageStatus(id, status) {
  return tx((d) => {
    const m = (d.messages || []).find((x) => x.id === id);
    if (m) m.status = status;
  });
}

export function deleteMessage(id) {
  return tx((d) => {
    d.messages = (d.messages || []).filter((x) => x.id !== id);
  });
}

export function listSubscribers() {
  return tx((d) => [...(d.subscribers || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export function deleteSubscriber(id) {
  return tx((d) => {
    d.subscribers = (d.subscribers || []).filter((x) => x.id !== id);
  });
}

export function listOrders({ status, search, limit = 50, offset = 0 } = {}) {
  return tx((d) => {
    let rows = [...d.orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (status) rows = rows.filter((o) => o.status === status);
    const q = (search || "").trim().toLowerCase().replace(/^#/, "");
    if (q) {
      rows = rows.filter(
        (o) =>
          String(o.order_number) === q ||
          o.phone.includes(q.replace(/\D/g, "") || "~") ||
          o.customer_name.toLowerCase().includes(q) ||
          o.city.toLowerCase().includes(q)
      );
    }
    return {
      count: rows.length,
      rows: rows.slice(offset, offset + limit).map((o) => ({
        ...o,
        order_items: d.items.filter((i) => i.order_id === o.id).map((i) => ({ quantity: i.quantity })),
      })),
    };
  });
}

export function getOrder(id) {
  return tx((d) => {
    const order = d.orders.find((o) => o.id === id);
    if (!order) return null;
    return {
      order,
      items: d.items.filter((i) => i.order_id === id),
      events: d.events.filter((e) => e.order_id === id),
    };
  });
}

export function setOrderStatus(id, status, note, restock = true) {
  return tx((d) => {
    const o = d.orders.find((x) => x.id === id);
    if (!o) fail("Order not found.");
    if (o.status === status) return o;
    const lines = d.items
      .filter((i) => i.order_id === id)
      .map((i) => ({ i, v: d.variants.find((v) => v.id === i.variant_id) }))
      .filter((x) => x.v);
    if (["cancelled", "returned"].includes(status)) {
      if (restock && !o.restocked) {
        lines.forEach(({ i, v }) => (v.stock += i.quantity));
        o.restocked = true;
      }
    } else if (o.restocked) {
      const short = lines.find(({ i, v }) => v.stock < i.quantity);
      if (short) fail(`Not enough stock to reopen this order (${short.i.title} — size ${short.i.size}).`);
      lines.forEach(({ i, v }) => (v.stock -= i.quantity));
      o.restocked = false;
    }
    o.status = status;
    o.updated_at = now();
    addEvent(d, id, "status", status, note?.trim() || null);
    return o;
  });
}

export function updateOrder(id, patch) {
  return tx((d) => {
    const o = d.orders.find((x) => x.id === id);
    if (patch.payment_status && patch.payment_status !== o.payment_status) {
      addEvent(d, id, "payment", null, `Payment marked ${patch.payment_status}`);
    }
    const tracking = patch.tracking_number ?? o.tracking_number;
    const courier = patch.courier ?? o.courier;
    if (tracking && (tracking !== o.tracking_number || courier !== o.courier)) {
      addEvent(d, id, "shipping", null, `${courier || ""} ${tracking}`.trim());
    }
    Object.assign(o, patch, { updated_at: now() });
    return o;
  });
}

export function addOrderNote(id, message) {
  return tx((d) => addEvent(d, id, "note", null, message));
}

export function deleteOrder(id) {
  return tx((d) => {
    const o = d.orders.find((x) => x.id === id);
    if (o?.status !== "cancelled") fail("Only cancelled orders can be deleted.");
    d.orders = d.orders.filter((x) => x.id !== id);
    d.items = d.items.filter((x) => x.order_id !== id);
    d.events = d.events.filter((x) => x.order_id !== id);
  });
}

export function subscribeOrders(onChange) {
  // Orders placed from another tab (e.g. the storefront) arrive via the
  // storage event; replay them as realtime-style INSERT payloads.
  let lastSeq = load().seq;
  const onStorage = (e) => {
    if (e.key !== DB_KEY) return;
    const d = load();
    d.orders
      .filter((o) => o.order_number >= lastSeq)
      .forEach((o) => onChange({ eventType: "INSERT", new: o }));
    if (d.seq === lastSeq) onChange();
    lastSeq = d.seq;
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function listProducts() {
  return tx((d) => [...d.products].sort(byPosition).map((p) => withVariants(d, p)));
}

export function listCollections() {
  return tx((d) => [...d.collections].sort((a, b) => a.position - b.position));
}

export function getProduct(id) {
  return tx((d) => {
    const p = d.products.find((x) => x.id === id);
    return p ? withVariants(d, p) : null;
  });
}

// row: product columns; variants: [{id?, size, stock?, sku, position}]
export function saveProduct(id, row, variants) {
  return tx((d) => {
    if (d.products.some((p) => p.handle === row.handle && p.id !== id)) {
      fail(`Another product already uses the URL handle "${row.handle}".`);
    }
    let p = d.products.find((x) => x.id === id);
    if (p) Object.assign(p, row, { updated_at: now() });
    else {
      p = { id: crypto.randomUUID().replace(/-/g, ""), ...row, created_at: now(), updated_at: now() };
      d.products.push(p);
    }
    const keep = new Set(variants.filter((v) => v.id).map((v) => v.id));
    d.variants = d.variants.filter((v) => v.product_id !== p.id || keep.has(v.id));
    for (const v of variants) {
      const existing = v.id && d.variants.find((x) => x.id === v.id);
      if (existing) Object.assign(existing, v);
      else d.variants.push({ id: crypto.randomUUID(), product_id: p.id, stock: 0, ...v });
    }
    return p.id;
  });
}

export function deleteProduct(id) {
  return tx((d) => {
    d.products = d.products.filter((p) => p.id !== id);
    const gone = new Set(d.variants.filter((v) => v.product_id === id).map((v) => v.id));
    d.variants = d.variants.filter((v) => v.product_id !== id);
    d.items.forEach((i) => {
      if (i.product_id === id) i.product_id = null;
      if (gone.has(i.variant_id)) i.variant_id = null;
    });
  });
}

// Demo images live inline as data URLs (fine for a few test uploads).
export function uploadImage(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function removeImages() {}

export function getSettings() {
  return tx((d) => d.settings);
}

export function saveSettings(patch) {
  return tx((d) => Object.assign(d.settings, patch));
}

export function reset() {
  localStorage.removeItem(DB_KEY);
  listeners.forEach((fn) => fn());
}
