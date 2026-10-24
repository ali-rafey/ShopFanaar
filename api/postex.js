// PostEx from the admin: book orders, link bookings made in the PostEx
// portal, sync parcel progress, cancel bookings and print airway bills / load
// sheets. Only signed-in admins get in: every request carries the admin's
// Supabase session, which is checked with is_admin(), and every database
// write goes through the courier_* functions in
// supabase/migrations/*_courier_postex.sql using that same session.
//
// Never books an order twice: each order is claimed in the database first,
// and PostEx is searched for an existing booking with the same order number
// (e.g. one made by hand in the portal) — if there is one it is linked, not
// re-created.
//
// Vercel env: POSTEX_API_TOKEN (Secret) — the PostEx merchant API token.
import { canonicalCity, cityIndex, normCity, resolveCity } from "../src/lib/courierCity.js";
import * as postex from "../server/postex.js";

const COURIER = "PostEx";
const MAX_BATCH = 25; // orders per request (the admin sends 10 at a time)
const MAX_PDF = { awb: 10, loadsheet: 50 }; // airway bills: PostEx's limit per PDF
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 864e5;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Supabase REST as the signed-in admin.
function database(jwt) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  return async (path, { method = "GET", body, prefer } = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.message || `Database error ${res.status}`);
    return data;
  };
}

const money = (n) => `Rs ${Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

// "[ 1 x Light Weight Interlock Shirt - M ] [ 2 x … ]", as PostEx's Shopify app writes it.
const orderDetail = (items) =>
  items.map((i) => `[ ${i.quantity} x ${i.title} - ${i.size} ]`).join(" ").slice(0, 500);

const ORDER_COLS =
  "id,order_number,status,payment_status,customer_name,phone,address,city,postal_code,customer_note," +
  "total,courier,tracking_number,courier_status,created_at,order_items(title,size,quantity)";

const loadOrders = (db, ids) => db(`orders?select=${ORDER_COLS}&id=in.(${ids.join(",")})`);

// Every PostEx booking made since a day before the oldest of these orders.
function postexOrdersAround(orders) {
  if (!orders.length) return [];
  const from = Math.min(...orders.map((o) => Date.parse(o.created_at))) - DAY;
  return postex.listOrders(from, Date.now() + DAY);
}

// An order's PostEx bookings, newest first: same order number ("1019" or
// "#1019"), made no earlier than a day before the order — old Shopify-era
// bookings reused the same numbers.
const bookingsFor = (rows) => (order) =>
  rows
    .filter((r) => {
      const ref = String(r.orderRefNumber || "").trim().replace(/^#/, "");
      return ref === String(order.order_number) && Date.parse(r.transactionDate) >= Date.parse(order.created_at) - DAY;
    })
    .sort((a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate));

const liveBookings = (bookings) => bookings.filter((r) => !postex.progress(r).cancelled);
const twoBookings = (n) => `PostEx has ${n} live bookings with this order number — check the portal and cancel the extra one.`;

function linkNote(order, row) {
  const amount = Number(row.invoicePayment);
  const expected = order.payment_status === "paid" ? 0 : order.total;
  return (
    `Linked to PostEx booking ${row.trackingNumber}` +
    (amount !== expected ? ` — PostEx collects ${money(amount)}, order total ${money(order.total)}` : "")
  );
}

// The cash PostEx collects for a parcel, as a whole number of rupees.
function amountOf(row) {
  const n = Math.round(Number(row.invoicePayment));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// PostEx times are Pakistan time; add the zone when PostEx leaves it off.
function pakistanTime(value) {
  if (!value) return null;
  const s = String(value);
  const t = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}+05:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// The day as people in Pakistan read it, e.g. "21 Oct".
const pkDay = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
};

// Bring an order in line with its PostEx parcel: PostEx's status, the cash it
// collects, its delivery date, and — once PostEx has returned the parcel to
// us (`back`, from its tracking history) — the return itself. Nothing goes
// back in stock until the admin has checked the parcel (receive_return).
// Returns the order's status.
async function applyProgress(db, order, tracking, row, back = null) {
  const p = postex.progress(row);
  const rpc = (fn, body) => db(`rpc/${fn}`, { method: "POST", body });
  await rpc("courier_details", {
    p_order_id: order.id,
    p_tracking: tracking,
    p_amount: amountOf(row),
    p_delivered_at: p.delivered ? pakistanTime(row.orderDeliveryDate) : null,
  });
  const after = await rpc("courier_status_update", {
    p_order_id: order.id,
    p_tracking: tracking,
    p_courier_status: p.status,
    p_picked_up: p.pickedUp,
    p_delivered: p.delivered,
  });
  if (back) {
    return rpc("courier_returned", { p_order_id: order.id, p_tracking: tracking, p_returned_at: pakistanTime(back.returnedAt) });
  }
  return after;
}

// ------------------------------------------------------------------ actions

async function setup(db) {
  const [cities, addresses, aliases] = await Promise.all([
    postex.cities(),
    postex.pickupAddresses(),
    db(`courier_city_aliases?courier=eq.${COURIER}&select=input,city`),
  ]);
  return { cities, addresses, learned: Object.fromEntries(aliases.map((a) => [a.input, a.city])) };
}

// body: { orders: [{ id, city? }], pickupCode? }
async function book(db, body) {
  const wanted = Array.isArray(body.orders) ? body.orders.filter((o) => UUID.test(String(o?.id))) : [];
  if (!wanted.length) throw new HttpError(400, "No orders to book.");
  if (wanted.length > MAX_BATCH) throw new HttpError(400, `Book at most ${MAX_BATCH} orders at a time.`);
  const ids = wanted.map((o) => o.id);
  const chosenCity = Object.fromEntries(wanted.map((o) => [o.id, o.city ? String(o.city) : null]));

  const [orders, claimed, cities, aliases] = await Promise.all([
    loadOrders(db, ids),
    db("rpc/courier_claim", { method: "POST", body: { p_order_ids: ids } }),
    postex.cities(),
    db(`courier_city_aliases?courier=eq.${COURIER}&select=input,city`),
  ]);
  const mine = new Set(claimed);
  const release = (list) =>
    list.length ? db("rpc/courier_release", { method: "POST", body: { p_order_ids: list } }).catch(() => {}) : null;

  let existing;
  try {
    existing = bookingsFor(await postexOrdersAround(orders.filter((o) => mine.has(o.id))));
  } catch (err) {
    await release([...mine]);
    throw new HttpError(502, `Couldn't check PostEx for existing bookings, so nothing was booked. ${err.message}`);
  }

  const index = cityIndex(cities);
  const learned = Object.fromEntries(aliases.map((a) => [a.input, a.city]));
  const results = [];

  for (const id of ids) {
    const order = orders.find((o) => o.id === id);
    const result = { id, order_number: order?.order_number ?? null };
    results.push(result);
    if (!order) {
      result.error = "Order not found.";
      continue;
    }
    if (!mine.has(id)) {
      result.skipped = true;
      result.error = order.tracking_number
        ? `Already booked (${order.courier || "courier"} ${order.tracking_number}).`
        : order.status === "confirmed" || order.status === "packed"
          ? "Another booking for this order is already in progress."
          : `It's ${order.status} — only confirmed or packed orders can be booked.`;
      continue;
    }

    try {
      // Booked in the PostEx portal already? Link that booking instead.
      const live = liveBookings(existing(order));
      const found = live[0];
      if (found) {
        await db("rpc/courier_booked", {
          method: "POST",
          body: {
            p_order_id: id,
            p_courier: COURIER,
            p_tracking: String(found.trackingNumber),
            p_city: found.cityName || null,
            p_courier_status: postex.progress(found).status,
            p_note: linkNote(order, found),
          },
        });
        await applyProgress(db, order, String(found.trackingNumber), found);
        Object.assign(result, {
          ok: true,
          linked: true,
          tracking: String(found.trackingNumber),
          note: live.length > 1 ? `${linkNote(order, found)}. ${twoBookings(live.length)}` : linkNote(order, found),
        });
        continue;
      }

      // The city must be one of PostEx's own names.
      const auto = resolveCity(index, order.city, learned);
      const city = chosenCity[id] ? canonicalCity(index, chosenCity[id]) : auto.sure ? auto.city : null;
      if (!city) {
        result.error = chosenCity[id]
          ? `“${chosenCity[id]}” isn't a PostEx city.`
          : `Choose the PostEx city for “${order.city}”.`;
        await release([id]);
        continue;
      }
      const phone = postex.postexPhone(order.phone);
      if (!phone) {
        result.error = `The phone number ${order.phone} isn't a Pakistani mobile (03xx…). Fix it on the order first.`;
        await release([id]);
        continue;
      }
      const units = order.order_items.reduce((n, i) => n + i.quantity, 0);
      const address = [order.address, order.postal_code].filter(Boolean).join(", ");

      let created;
      try {
        created = await postex.createOrder({
          orderRefNumber: String(order.order_number),
          invoicePayment: order.payment_status === "paid" ? 0 : order.total,
          orderDetail: orderDetail(order.order_items),
          customerName: order.customer_name.slice(0, 100),
          customerPhone: phone,
          deliveryAddress: address.slice(0, 500),
          ...(order.customer_note?.trim() ? { transactionNotes: order.customer_note.trim().slice(0, 250) } : {}),
          cityName: city,
          invoiceDivision: 1,
          items: units,
          ...(body.pickupCode ? { pickupAddressCode: String(body.pickupCode) } : {}),
          orderType: "Normal",
        });
      } catch (err) {
        result.error = `PostEx: ${err.message}`;
        await release([id]);
        continue;
      }
      const tracking = String(created?.trackingNumber || "").trim();
      if (!tracking) {
        result.error = "PostEx didn't return a tracking number. Run Sync before trying again.";
        await release([id]);
        continue;
      }

      try {
        await db("rpc/courier_booked", {
          method: "POST",
          body: {
            p_order_id: id,
            p_courier: COURIER,
            p_tracking: tracking,
            p_city: city,
            p_courier_status: created.orderStatus || "Unbooked",
          },
        });
      } catch (err) {
        // Booked at PostEx but not saved here: Sync will link it by order number.
        Object.assign(result, {
          tracking,
          error: `Booked with PostEx (${tracking}) but couldn't save it here — tap Sync to link it. ${err.message}`,
        });
        await release([id]);
        continue;
      }
      Object.assign(result, { ok: true, tracking, city });
      await db("rpc/courier_details", {
        method: "POST",
        body: { p_order_id: id, p_tracking: tracking, p_amount: order.payment_status === "paid" ? 0 : order.total },
      }).catch(() => {}); // Sync fills it in if this fails

      // Remember a city the admin had to choose, for next time.
      if (chosenCity[id] && normCity(order.city) && !(auto.sure && auto.city === city)) {
        await db("courier_city_aliases", {
          method: "POST",
          prefer: "resolution=merge-duplicates,return=minimal",
          body: { courier: COURIER, input: normCity(order.city), city, updated_at: new Date().toISOString() },
        }).catch(() => {});
      }
    } catch (err) {
      result.error = err.message;
      await release([id]);
    }
  }
  return { results };
}

// Where a parcel PostEx lists as "Return" really is: on its way back, or back
// with us. null when PostEx can't be asked right now.
async function returnState(tracking) {
  try {
    return postex.returnState(await postex.trackOrder(tracking));
  } catch {
    return null;
  }
}

// Link portal bookings to their orders and bring every PostEx order up to
// date: status, the cash PostEx collects and delivery dates. Orders only move
// forward, and a parcel PostEx has returned to us marks the order returned —
// waiting for the admin to check it before anything is restocked. Returns,
// parcels on their way back and courier cancellations are reported.
async function sync(db) {
  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const orders = await db(
    `orders?select=id,order_number,status,payment_status,total,courier,tracking_number,courier_status,courier_amount,created_at` +
      `&created_at=gte.${since}&order=order_number.asc`
  );
  // Parcels still moving, plus delivered ones whose PostEx amount isn't
  // recorded yet (delivered before amounts were kept) — for the sales figures.
  const tracked = orders.filter(
    (o) =>
      o.courier === COURIER &&
      o.tracking_number &&
      (["confirmed", "packed", "shipped"].includes(o.status) || (o.status === "delivered" && o.courier_amount == null))
  );
  const untracked = orders.filter((o) => !o.tracking_number && o.status !== "pending");
  const relevant = [...tracked, ...untracked];
  const out = { checked: tracked.length, linked: [], moved: [], attention: [], syncedAt: new Date().toISOString() };
  if (!relevant.length) return out;

  const rows = await postexOrdersAround(relevant);
  const byTracking = new Map(rows.map((r) => [String(r.trackingNumber), r]));
  const existing = bookingsFor(rows);

  const report = async (order, tracking, row) => {
    const p = postex.progress(row);
    const ret = p.returning ? await returnState(tracking) : null;
    const after = await applyProgress(db, order, tracking, row, ret?.backWithUs ? ret : null);
    if (after && after !== order.status) out.moved.push({ id: order.id, order_number: order.order_number, from: order.status, to: after });
    if (ret?.backWithUs) {
      out.attention.push({
        id: order.id,
        order_number: order.order_number,
        message: `PostEx returned this parcel to you${pkDay(ret.returnedAt) ? ` on ${pkDay(ret.returnedAt)}` : ""}. Open it and check the items in Orders → Returned, then put them back in stock.`,
      });
    } else if (p.returning) {
      out.attention.push({
        id: order.id,
        order_number: order.order_number,
        message: ret
          ? `On its way back to you — PostEx: “${ret.message || p.status}”${pkDay(ret.at) ? ` (${pkDay(ret.at)})` : ""}.`
          : `PostEx says “${p.status}” — couldn't check yet whether it has reached you; the next sync will.`,
      });
    } else if (p.cancelled) {
      out.attention.push({ id: order.id, order_number: order.order_number, message: "The PostEx booking was cancelled — book it again or cancel the order." });
    }
  };

  for (const order of tracked) {
    const row = byTracking.get(order.tracking_number);
    if (!row) continue;
    // Nothing new from PostEx and nothing to move: skip the database round trip.
    const p = postex.progress(row);
    const moves = (p.delivered && order.status !== "delivered") || (p.pickedUp && order.status !== "shipped");
    const newAmount = amountOf(row) !== null && amountOf(row) !== order.courier_amount;
    if (p.status === order.courier_status && !moves && !newAmount && !p.returning && !p.cancelled) continue;
    await report(order, order.tracking_number, row);
  }

  for (const order of untracked) {
    const bookings = existing(order);
    const live = liveBookings(bookings)[0];
    if (liveBookings(bookings).length > 1) {
      out.attention.push({ id: order.id, order_number: order.order_number, message: twoBookings(liveBookings(bookings).length) });
    }
    if (!live) {
      if (bookings.length && ["confirmed", "packed", "shipped"].includes(order.status)) {
        out.attention.push({
          id: order.id,
          order_number: order.order_number,
          message: "Its PostEx booking was cancelled (merged with another parcel?) — cancel or book it again.",
        });
      }
      continue;
    }
    const tracking = String(live.trackingNumber);
    await db("rpc/courier_booked", {
      method: "POST",
      body: {
        p_order_id: order.id,
        p_courier: COURIER,
        p_tracking: tracking,
        p_city: live.cityName || null,
        p_courier_status: postex.progress(live).status,
        p_note: linkNote(order, live),
      },
    });
    const amount = Number(live.invoicePayment);
    out.linked.push({
      id: order.id,
      order_number: order.order_number,
      tracking,
      ...(amount !== (order.payment_status === "paid" ? 0 : order.total) ? { amount, total: order.total } : {}),
    });
    if (order.status === "cancelled") {
      out.attention.push({
        id: order.id,
        order_number: order.order_number,
        message: `Cancelled here, but PostEx has a live booking (${postex.progress(live).status}).`,
      });
    }
    // courier_booked moved a confirmed order to packed; read progress from there.
    await report({ ...order, status: order.status === "confirmed" ? "packed" : order.status }, tracking, live);
  }
  return out;
}

async function cancel(db, body) {
  if (!UUID.test(String(body.id))) throw new HttpError(400, "Which order?");
  const [order] = await db(`orders?select=id,order_number,courier,tracking_number&id=eq.${body.id}`);
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.courier !== COURIER || !order.tracking_number) throw new HttpError(400, "This order has no PostEx booking.");
  try {
    await postex.cancelOrder(order.tracking_number);
  } catch (err) {
    throw new HttpError(502, `PostEx didn't cancel it: ${err.message}`);
  }
  await db("rpc/courier_cancelled", { method: "POST", body: { p_order_id: order.id, p_tracking: order.tracking_number } });
  return { ok: true };
}

async function trackingFor(db, body, max) {
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => UUID.test(String(x))) : [];
  if (!ids.length) throw new HttpError(400, "Choose orders booked with PostEx.");
  const rows = await db(`orders?select=tracking_number&courier=eq.${COURIER}&tracking_number=not.is.null&id=in.(${ids.join(",")})`);
  const tracking = rows.map((r) => r.tracking_number);
  if (!tracking.length) throw new HttpError(400, "None of these orders is booked with PostEx yet.");
  if (tracking.length > max) throw new HttpError(400, `At most ${max} orders at a time.`);
  return tracking;
}

// ------------------------------------------------------------------ handler

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const jwt = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!jwt) throw new HttpError(401, "Please sign in again.");
    const db = database(jwt);
    if ((await db("rpc/is_admin", { method: "POST", body: {} }).catch(() => false)) !== true) {
      throw new HttpError(403, "Only Fanaar admins can do that.");
    }

    const action = String(req.query?.action || "");
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (action === "setup" && req.method === "GET") return res.status(200).json(await setup(db));
    if (req.method !== "POST") throw new HttpError(405, "POST only.");
    if (action === "book") return res.status(200).json(await book(db, body));
    if (action === "sync") return res.status(200).json(await sync(db));
    if (action === "cancel") return res.status(200).json(await cancel(db, body));
    if (action === "awb" || action === "loadsheet") {
      const tracking = await trackingFor(db, body, MAX_PDF[action]);
      const pdf = action === "awb" ? await postex.airwayBills(tracking) : await postex.loadSheet(tracking);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="postex-${action === "awb" ? "airway-bills" : "load-sheet"}.pdf"`);
      return res.status(200).send(pdf);
    }
    throw new HttpError(404, "Unknown action.");
  } catch (err) {
    const status = err instanceof HttpError ? err.status : err instanceof postex.PostExError ? 502 : 500;
    if (status >= 500) console.error("postex:", err.message);
    return res.status(status).json({ error: err.message || "Something went wrong." });
  }
}
