// PostEx merchant API client — server-only. The merchant token lives in the
// POSTEX_API_TOKEN Vercel secret and never reaches a browser.
//
// Written from PostEx's Merchant API Integration Guide v4.1.9 and checked
// against the live API (October 2026). Where they disagree, the live API wins:
//   * get-operational-city: the documented operationalCityType=Delivery is
//     rejected, so the full list is fetched (all 901 cities are delivery
//     cities). A few big cities are mixed case ("Lahore", "Karachi"), the rest
//     upper case, and orders must use the exact name.
//   * get-all-order takes orderStatusId / startDate / endDate, not the
//     documented orderStatusID / fromDate / toDate.
//   * tracking numbers are 14 digits (not "CX-…"), and list statuses include
//     undocumented ones such as "In Stock" and "Transferred" (both in transit)
//     — so progress is read from the pickup date and "Delivered", never from
//     a fixed list of status names.

const BASE = "https://api.postex.pk/services/integration/api/order";

export class PostExError extends Error {}

const messageOf = (data) =>
  data && (data.statusMessage || data.message || data.error || (data.dist && typeof data.dist === "string" && data.dist));

async function call(path, { method = "GET", query, body, pdf = false, timeout = 25000 } = {}) {
  const token = process.env.POSTEX_API_TOKEN;
  if (!token) throw new PostExError("POSTEX_API_TOKEN isn't set in Vercel.");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    throw new PostExError(err.name === "TimeoutError" ? "PostEx didn't answer in time." : "Couldn't reach PostEx.");
  }

  if (pdf && res.ok && (res.headers.get("content-type") || "").includes("pdf")) {
    return Buffer.from(await res.arrayBuffer());
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || String(data.statusCode) !== "200") {
    throw new PostExError(messageOf(data) || `PostEx returned an error (${res.status}).`);
  }
  if (pdf) throw new PostExError(messageOf(data) || "PostEx didn't return a PDF.");
  return data.dist;
}

// The city list barely changes; keep it for six hours per server instance.
let cityCache = null;
export async function cities() {
  if (cityCache && cityCache.at > Date.now() - 6 * 3600e3) return cityCache.names;
  const rows = await call("/v2/get-operational-city");
  const names = rows.filter((c) => c.isDeliveryCity !== false).map((c) => String(c.operationalCityName).trim());
  cityCache = { names, at: Date.now() };
  return names;
}

export async function pickupAddresses() {
  const rows = await call("/v1/get-merchant-address");
  return rows.map((a) => ({
    code: a.addressCode,
    city: a.cityName,
    address: a.address,
    isDefault: /default/i.test(a.addressType || ""),
  }));
}

const day = (d) => new Date(d).toISOString().slice(0, 10);

// Every order created between two dates (inclusive), any status.
export function listOrders(from, to) {
  return call("/v1/get-all-order", {
    query: { orderStatusId: 0, startDate: day(from), endDate: day(to) },
    timeout: 40000,
  });
}

// → { trackingNumber, orderStatus, orderDate }
export function createOrder(order) {
  return call("/v3/create-order", { method: "POST", body: order, timeout: 30000 });
}

export function cancelOrder(trackingNumber) {
  return call("/v1/cancel-order", { method: "PUT", body: { trackingNumber } });
}

// Printable airway bills; PostEx makes one PDF for up to 10 tracking numbers.
export function airwayBills(trackingNumbers) {
  return call("/v1/get-invoice", { query: { trackingNumbers: trackingNumbers.join(",") }, pdf: true, timeout: 40000 });
}

// Load sheet for the pickup rider (also tells PostEx these are ready).
export function loadSheet(trackingNumbers) {
  return call("/v2/generate-load-sheet", { method: "POST", body: { trackingNumbers }, pdf: true, timeout: 40000 });
}

// Where a parcel is, from a get-all-order row. Uses PostEx's own dates rather
// than status names: a pickup date means it has left the warehouse.
export function progress(row) {
  const status = String(row.transactionStatus || "").trim();
  const s = status.toLowerCase();
  const cancelled = s === "cancelled" || s === "canceled";
  const delivered = s === "delivered";
  return {
    status,
    cancelled,
    delivered,
    returned: s === "returned", // back with us — final
    returning: /return/.test(s), // on its way back, or back
    pickedUp: delivered || (!cancelled && Boolean(row.orderPickupDate)),
  };
}

// The phone format PostEx wants: 03xxxxxxxxx. null when it isn't a mobile.
export function postexPhone(phone) {
  const digits = String(phone || "").replace(/[^0-9]/g, "").replace(/^(0092|92|0)/, "");
  return /^3[0-9]{9}$/.test(digits) ? "0" + digits : null;
}
