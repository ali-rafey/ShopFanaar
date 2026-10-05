// Admin data access. One interface, two backends: Supabase (supabase-js, with
// the signed-in admin's session so row-level security applies) or the
// dev-only demo database.
import { createClient } from "@supabase/supabase-js";
import { BACKEND, loadDemo, ApiError } from "../lib/api";
import { toProduct, toSettings } from "../lib/catalog";

export { BACKEND };

const sb =
  BACKEND === "supabase"
    ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "fanaar-admin-auth" },
      })
    : null;

const BUCKET = "product-images";
const demo = () => loadDemo();

// supabase-js returns { data, error } — turn errors into exceptions with
// messages an admin can act on.
function unwrap({ data, error }) {
  if (error) {
    let msg = error.message || "Something went wrong.";
    if (error.code === "23505") msg = "That value is already used by another record (e.g. URL handle or size).";
    if (error.code === "42501") msg = "Your account doesn't have permission to do that.";
    throw new ApiError(msg, error.code);
  }
  return data;
}

// ------------------------------------------------------------------- auth

export async function getSession() {
  if (!sb) return (await demo()).getSession();
  return unwrap(await sb.auth.getSession()).session;
}

export function onAuthChange(cb) {
  if (!sb) return () => {};
  // Deferred: calling other Supabase methods (we check is_admin) from inside
  // this callback can deadlock supabase-js's auth lock.
  const { data } = sb.auth.onAuthStateChange((_event, session) => setTimeout(() => cb(session), 0));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  if (!sb) return (await demo()).signIn(email);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    throw new ApiError(
      error.status === 400 ? "Wrong email or password." : error.message
    );
  }
  return data.user;
}

export async function signOut() {
  if (!sb) return (await demo()).signOut();
  await sb.auth.signOut();
}

export async function checkIsAdmin() {
  if (!sb) return true;
  return unwrap(await sb.rpc("is_admin"));
}

// ------------------------------------------------------------------ stats

export async function getStats() {
  if (!sb) return (await demo()).stats();
  return unwrap(await sb.rpc("admin_stats"));
}

// ----------------------------------------------------------------- orders

const ORDER_LIST_COLS =
  "id,order_number,status,payment_status,customer_name,phone,city,total,created_at,order_items(quantity)";

export async function listOrders({ status, search, limit = 50, offset = 0 } = {}) {
  if (!sb) return (await demo()).listOrders({ status, search, limit, offset });

  let q = sb
    .from("orders")
    .select(ORDER_LIST_COLS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) q = q.eq("status", status);

  // Strip characters that have meaning in PostgREST filter syntax.
  const s = (search || "").trim().replace(/^#/, "").replace(/[,()*%\\]/g, " ").trim();
  if (s) {
    const digits = s.replace(/\D/g, "");
    const ors = [`customer_name.ilike.*${s}*`, `city.ilike.*${s}*`];
    if (/^\d{1,9}$/.test(s)) ors.push(`order_number.eq.${s}`);
    if (digits.length >= 4) ors.push(`phone.ilike.*${digits.replace(/^(92|0)/, "")}*`);
    q = q.or(ors.join(","));
  }
  const { data, error, count } = await q;
  unwrap({ data, error });
  return { rows: data, count };
}

export async function getOrder(id) {
  if (!sb) return (await demo()).getOrder(id);
  const [order, items, events] = await Promise.all([
    sb.from("orders").select("*").eq("id", id).maybeSingle(),
    sb.from("order_items").select("*").eq("order_id", id).order("title"),
    sb.from("order_events").select("*").eq("order_id", id).order("created_at"),
  ]);
  const o = unwrap(order);
  return o ? { order: o, items: unwrap(items), events: unwrap(events) } : null;
}

export async function setOrderStatus(id, status, note, restock = true) {
  if (!sb) return (await demo()).setOrderStatus(id, status, note, restock);
  return unwrap(
    await sb.rpc("update_order_status", {
      p_order_id: id,
      p_status: status,
      p_note: note || null,
      p_restock: restock,
    })
  );
}

// patch: any of payment_status, courier, tracking_number, admin_note,
// customer_name, phone, email, address, city, postal_code
export async function updateOrder(id, patch) {
  if (!sb) return (await demo()).updateOrder(id, patch);
  return unwrap(await sb.from("orders").update(patch).eq("id", id).select().single());
}

export async function addOrderNote(id, message) {
  if (!sb) return (await demo()).addOrderNote(id, message);
  unwrap(await sb.from("order_events").insert({ order_id: id, kind: "note", message }));
}

export async function deleteOrder(id) {
  if (!sb) return (await demo()).deleteOrder(id);
  const rows = unwrap(await sb.from("orders").delete().eq("id", id).select("id"));
  if (!rows.length) throw new ApiError("Only cancelled orders can be deleted.");
}

// Calls onChange whenever an order is created or updated (live feed).
export function subscribeOrders(onChange) {
  if (!sb) {
    let off = () => {};
    demo().then((d) => (off = d.subscribeOrders(onChange)));
    return () => off();
  }
  const channel = sb
    .channel("admin-orders")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) =>
      onChange(payload)
    )
    .subscribe();
  return () => sb.removeChannel(channel);
}

// --------------------------------------------------------------- products

const PRODUCT_COLS = "*,product_variants(id,size,stock,sku,position)";

export async function listProducts() {
  const rows = !sb
    ? await (await demo()).listProducts()
    : unwrap(
        await sb
          .from("products")
          .select(PRODUCT_COLS)
          .order("position")
          .order("created_at", { ascending: false })
      );
  return rows.map(toProduct);
}

export async function listCollections() {
  const rows = !sb
    ? await (await demo()).listCollections()
    : unwrap(await sb.from("collections").select("*").order("position"));
  return rows.map((c) => ({ handle: c.handle, title: c.title }));
}

export async function getProduct(id) {
  const row = !sb
    ? await (await demo()).getProduct(id)
    : unwrap(await sb.from("products").select(PRODUCT_COLS).eq("id", id).maybeSingle());
  return row ? toProduct(row) : null;
}

// `product` is the editor's state (storefront shape). `original` is the
// product as loaded, used to work out which sizes were removed and whose
// stock was actually edited — stock is only written when changed, so saving
// a description never overwrites units sold while the editor was open.
export async function saveProduct(product, original) {
  const row = {
    handle: product.handle,
    title: product.title.trim(),
    description: product.description,
    disclaimer: product.disclaimer || null,
    price: product.price,
    compare_at_price: product.compareAtPrice || null,
    images: product.images,
    collections: product.collections,
    status: product.status,
    position: product.position ?? 0,
  };
  const before = new Map((original?.sizes || []).map((s) => [s.id, s]));
  const variants = product.sizes.map((s, i) => {
    const v = { size: s.size.trim(), sku: s.sku?.trim() || null, position: i };
    if (s.id) v.id = s.id;
    if (!s.id || before.get(s.id)?.qty !== s.qty) v.stock = s.qty;
    return v;
  });

  if (!sb) return (await demo()).saveProduct(product.id, row, variants);

  let id = product.id;
  if (id) unwrap(await sb.from("products").update(row).eq("id", id));
  else id = unwrap(await sb.from("products").insert(row).select("id").single()).id;

  const keep = new Set(variants.filter((v) => v.id).map((v) => v.id));
  const removed = [...before.keys()].filter((vid) => !keep.has(vid));
  if (removed.length) unwrap(await sb.from("product_variants").delete().in("id", removed));
  for (const { id: vid, ...v } of variants.filter((x) => x.id)) {
    unwrap(await sb.from("product_variants").update(v).eq("id", vid));
  }
  const added = variants.filter((v) => !v.id).map((v) => ({ ...v, product_id: id }));
  if (added.length) unwrap(await sb.from("product_variants").insert(added));
  return id;
}

export async function deleteProduct(product) {
  if (!sb) return (await demo()).deleteProduct(product.id);
  unwrap(await sb.from("products").delete().eq("id", product.id));
  await removeImages(product.images);
}

export async function uploadImage(blob, folder = "products") {
  if (!sb) return (await demo()).uploadImage(blob);
  const ext = blob.type === "image/webp" ? "webp" : blob.type.split("/")[1] || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  unwrap(
    await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      cacheControl: "31536000",
      upsert: false,
    })
  );
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Best effort: only files in our bucket (not the bundled /images/ set).
export async function removeImages(urls = []) {
  if (!sb) return;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const paths = urls.filter((u) => u.includes(marker)).map((u) => u.split(marker)[1]);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}

// ------------------------------------------------- inbox + subscribers

// status: "new" | "read" | "archived"; omitted = everything not archived.
export async function listMessages(status) {
  if (!sb) return (await demo()).listMessages(status);
  let q = sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
  q = status ? q.eq("status", status) : q.neq("status", "archived");
  return unwrap(await q);
}

export async function setMessageStatus(id, status) {
  if (!sb) return (await demo()).setMessageStatus(id, status);
  unwrap(await sb.from("contact_messages").update({ status }).eq("id", id));
}

export async function deleteMessage(id) {
  if (!sb) return (await demo()).deleteMessage(id);
  unwrap(await sb.from("contact_messages").delete().eq("id", id));
}

export async function listSubscribers() {
  if (!sb) return (await demo()).listSubscribers();
  return unwrap(
    await sb.from("subscribers").select("*").order("created_at", { ascending: false }).limit(5000)
  );
}

export async function deleteSubscriber(id) {
  if (!sb) return (await demo()).deleteSubscriber(id);
  unwrap(await sb.from("subscribers").delete().eq("id", id));
}

// --------------------------------------------------------------- settings

export async function getSettings() {
  const row = !sb
    ? await (await demo()).getSettings()
    : unwrap(await sb.from("store_settings").select("*").eq("id", 1).single());
  return toSettings(row);
}

export async function saveSettings(s) {
  const patch = {
    shipping_fee: s.shippingFee,
    free_shipping_threshold: s.freeShippingThreshold,
    accepting_orders: s.acceptingOrders,
  };
  if (!sb) return (await demo()).saveSettings(patch);
  unwrap(await sb.from("store_settings").update(patch).eq("id", 1));
}

export async function resetDemo() {
  if (!sb) (await demo()).reset();
}
