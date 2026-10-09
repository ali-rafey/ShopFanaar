// Storefront ↔ backend.
//
// The storefront talks to Supabase's REST API with plain fetch (no SDK) to
// keep the shopper bundle small; the admin uses supabase-js in its own
// lazy-loaded chunk.
//
// Backends:
//   supabase — VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set (production)
//   demo     — dev server without Supabase keys: a browser-local database
//              seeded from src/data/store.js, so checkout + admin can be tried
//   static   — production build without keys: bundled catalog, no checkout
import {
  products as storeProducts,
  collections as bundledCollections,
  defaultSizeChart,
} from "../data/store";
import { toProduct, toSettings } from "./catalog";

const bundledProducts = storeProducts.map((p) => ({ sizeChart: defaultSizeChart, ...p }));

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const BACKEND =
  SUPABASE_URL && SUPABASE_KEY
    ? "supabase"
    : import.meta.env.DEV
    ? "demo"
    : "static";

// The demo database never ships in production builds.
export const loadDemo = () =>
  import.meta.env.DEV
    ? import("./demo-db.js")
    : Promise.reject(new Error("Demo backend is only available in development"));

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function rest(path, body) {
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  // Legacy anon keys are JWTs and go in Authorization too; the newer
  // publishable keys must only be sent as `apikey`.
  if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_KEY}`;

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "We couldn't reach the store. Check your connection and try again."
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // P0001 = a message raised on purpose by place_order — written for shoppers.
    throw new ApiError(
      data?.code === "P0001" ? data.message : "Something went wrong. Please try again.",
      data?.code
    );
  }
  return data;
}

const CATALOG_SELECT =
  "id,handle,title,description,disclaimer,price,compare_at_price,images,collections,status,position,size_chart," +
  "product_variants(id,size,stock,sku,position)";

export function bundledCatalog() {
  return { products: bundledProducts, collections: bundledCollections, settings: null };
}

export async function fetchCatalog() {
  if (BACKEND === "static") return bundledCatalog();

  const [rows, collections, settings] =
    BACKEND === "demo"
      ? await (await loadDemo()).catalogRows()
      : await Promise.all([
          rest(`products?select=${CATALOG_SELECT}&status=eq.active&order=position.asc,created_at.desc`),
          rest("collections?select=handle,title,nav_group,position&order=position.asc"),
          rest("store_settings?select=shipping_fee,free_shipping_threshold,accepting_orders&id=eq.1"),
        ]);

  return {
    products: rows.map(toProduct),
    collections: collections.map((c) => ({ handle: c.handle, title: c.title, group: c.nav_group })),
    settings: toSettings(settings[0]),
  };
}

// payload: { customer: {name, phone, email, address, city, postal_code, note},
//            items: [{product_id, size, qty}] }
export async function placeOrder(payload) {
  if (BACKEND === "static") {
    throw new ApiError("Online checkout isn't available yet.");
  }
  if (BACKEND === "demo") return (await loadDemo()).placeOrder(payload);
  return rest("rpc/place_order", { payload });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchOrder(id) {
  if (!UUID.test(id) || BACKEND === "static") return null;
  if (BACKEND === "demo") return (await loadDemo()).getOrderPublic(id);
  return rest("rpc/get_order_public", { p_id: id });
}

// Newsletter. Resolves "subscribed" or "already".
export async function subscribe(email) {
  if (BACKEND === "static") throw new ApiError("Sign-ups aren't available yet.");
  if (BACKEND === "demo") return (await loadDemo()).subscribe(email);
  return rest("rpc/subscribe", { p_email: email });
}

// payload: { name, email?, phone?, order_number?, message }
export async function sendContactMessage(payload) {
  if (BACKEND === "static") throw new ApiError("The contact form isn't available yet.");
  if (BACKEND === "demo") return (await loadDemo()).sendContactMessage(payload);
  await rest("rpc/send_contact_message", { payload });
}
