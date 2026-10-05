// Pure catalog helpers — shared by the storefront and the admin.
import { shop } from "../data/store";

export function formatPrice(amount) {
  return `${shop.currencySymbol}${Number(amount || 0).toLocaleString("en-PK")}`;
}

export function totalStock(product) {
  return product.sizes.reduce((n, s) => n + s.qty, 0);
}

// Products sharing a collection with the given one, excluding itself.
export function relatedFor(products, product, limit = 4) {
  if (!product) return [];
  return products
    .filter((p) => p.id !== product.id)
    .map((p) => ({
      p,
      score: p.collections.filter((c) => product.collections.includes(c)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);
}

// Sibling colourways: titles formatted "Base Name - Colour" group together.
export function colorwaysFor(products, product) {
  if (!product || !product.title.includes(" - ")) return [];
  const base = product.title.split(" - ")[0].trim();
  return products
    .filter((p) => p.title.startsWith(base + " - "))
    .map((p) => ({
      ...p,
      colorName: p.title.split(" - ").slice(1).join(" - ").trim(),
    }));
}

// Database row (products + nested product_variants) → storefront shape.
export function toProduct(row) {
  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    price: row.price,
    compareAtPrice: row.compare_at_price ?? null,
    description: row.description || "",
    disclaimer: row.disclaimer || null,
    images: row.images || [],
    collections: row.collections || [],
    status: row.status,
    position: row.position ?? 0,
    sizes: (row.product_variants || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((v) => ({ id: v.id, size: v.size, qty: v.stock, sku: v.sku || "" })),
  };
}

export function toSettings(row) {
  if (!row) return null;
  return {
    shippingFee: row.shipping_fee,
    freeShippingThreshold: row.free_shipping_threshold,
    acceptingOrders: row.accepting_orders,
  };
}

export function shippingFor(subtotal, settings) {
  if (!settings) return null;
  const free =
    settings.freeShippingThreshold != null &&
    subtotal >= settings.freeShippingThreshold;
  return free ? 0 : settings.shippingFee;
}
