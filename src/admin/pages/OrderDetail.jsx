import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { ALL_STATUSES, FLOW, STATUS } from "../../lib/orderStatus";
import { BookingSheet, openPdf } from "../PostEx";
import { thumb } from "../../lib/catalog";
import {
  ConfirmButton, CourierStatus, ErrorBox, fmtDate, fmtPhone, isMetaPlatform, money, PageHead, PayBadge, SourceTag, Spinner,
  StatusBadge, timeAgo, useLoad, useToast,
} from "../ui";

const COURIERS = [
  "TCS", "Leopards", "M&P", "PostEx", "Trax", "Call Courier", "BlueEx", "Rider", "Pakistan Post",
];

const EDITABLE = ["customer_name", "phone", "email", "address", "city", "postal_code"];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { version, refreshStats } = useFeed();
  const res = useLoad(() => api.getOrder(id), [id, version]);
  const [busy, setBusy] = useState(false);

  async function act(fn, done) {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await res.reload();
      refreshStats();
      return true;
    } catch (e) {
      toast(e.message || "Something went wrong.", "err");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (res.data === undefined) return res.error ? <ErrorBox error={res.error} onRetry={res.reload} /> : <Spinner />;
  if (res.data === null) {
    return (
      <div className="adm-empty">
        Order not found. <Link to="/admin/orders" className="adm-link">Back to orders</Link>
      </div>
    );
  }

  const { order: o, items, events } = res.data;
  const units = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <>
      <PageHead
        back={<Link to="/admin/orders" className="adm-back">Orders</Link>}
        title={`Order #${o.order_number}`}
        sub={`Placed ${fmtDate(o.created_at)} · ${timeAgo(o.created_at)} · ${units} ${units === 1 ? "item" : "items"}`}
        actions={
          <>
            <StatusBadge status={o.status} />
            <PayBadge status={o.payment_status} />
            <button className="adm-btn adm-print-btn" onClick={() => window.print()}>
              Print slip
            </button>
          </>
        }
      />

      {o.suspected && (
        <section className="adm-card adm-flag-callout">
          <div>
            <strong>Possible spam</strong>
            <p>
              Another order came from the same internet connection with a different name, phone number and address.
              Check before confirming.
            </p>
          </div>
          <Link to="/admin/detection" className="adm-btn">
            Review in Detection
          </Link>
        </section>
      )}

      <StatusPanel order={o} busy={busy} act={act} onDeleted={() => navigate("/admin/orders")} />

      <div className="adm-detail">
        <div className="adm-detail-main">
          <section className="adm-card">
            <h2>Items</h2>
            <ul className="adm-items">
              {items.map((i) => (
                <li key={i.id}>
                  <div className="adm-thumb">{i.image && <img src={thumb(i.image)} alt="" />}</div>
                  <div className="adm-items-info">
                    {i.product_id ? <Link to={`/admin/products/${i.product_id}`}>{i.title}</Link> : i.title}
                    <small>Size {i.size}</small>
                  </div>
                  <span className="adm-num muted">
                    {i.quantity} × {money(i.unit_price)}
                  </span>
                  <span className="adm-num">{money(i.quantity * i.unit_price)}</span>
                </li>
              ))}
            </ul>
            <dl className="adm-totals">
              <div><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
              <div><dt>Shipping</dt><dd>{o.shipping_fee ? money(o.shipping_fee) : "Free"}</dd></div>
              {o.discount > 0 && <div><dt>Discount</dt><dd>−{money(o.discount)}</dd></div>}
              <div className="grand"><dt>Total · cash on delivery</dt><dd>{money(o.total)}</dd></div>
            </dl>
          </section>

          <Timeline order={o} events={events} busy={busy} act={act} />
        </div>

        <div className="adm-detail-side">
          <Customer order={o} busy={busy} act={act} />
          <OrderSource order={o} />
          <Shipping order={o} busy={busy} act={act} />

          <section className="adm-card">
            <h2>Payment</h2>
            <p className="adm-sub">Cash on delivery · {money(o.total)}</p>
            <label className="adm-field">
              <span>Payment status</span>
              <select
                value={o.payment_status}
                disabled={busy}
                onChange={(e) =>
                  act(() => api.updateOrder(o.id, { payment_status: e.target.value }), "Payment status updated")
                }
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid (cash received)</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
          </section>

          <InternalNote order={o} busy={busy} act={act} />
        </div>
      </div>

      <PackingSlip order={o} items={items} />
    </>
  );
}

// ------------------------------------------------------------- status panel

function StatusPanel({ order: o, busy, act, onDeleted }) {
  const closed = o.status === "cancelled" || o.status === "returned";
  const booked = Boolean(o.tracking_number);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState(o.status);
  const [restock, setRestock] = useState(true);
  const [booking, setBooking] = useState(null); // { auto } while the PostEx sheet is open

  useEffect(() => setManual(o.status), [o.status]);

  const move = (status, opts = {}) =>
    act(async () => {
      await api.setOrderStatus(o.id, status, note, opts.restock ?? true);
      setNote("");
    }, `Order marked ${STATUS[status].label.toLowerCase()}`);

  // Confirming books the order with PostEx straight away.
  const confirmAndBook = async () => {
    if (await move("confirmed")) setBooking({ auto: true });
  };
  // A booked parcel PostEx hasn't picked up can still be cancelled — there too.
  const cancelOrder = () =>
    act(async () => {
      if (booked) await api.postexCancel(o.id);
      await api.setOrderStatus(o.id, "cancelled", note, true);
      setNote("");
    }, booked ? "Cancelled here and at PostEx" : "Order cancelled");

  return (
    <section className="adm-card adm-status-panel">
      {closed ? (
        <div className="adm-status-row">
          <p>
            This order is <strong>{STATUS[o.status].label.toLowerCase()}</strong>
            {o.restocked ? " and its items are back in stock." : "."}
          </p>
          <div className="adm-btns">
            <button className="adm-btn" disabled={busy} onClick={() => move("pending")}>
              Reopen order
            </button>
            {o.status === "cancelled" && (
              <ConfirmButton
                disabled={busy}
                confirmLabel="Delete permanently?"
                onConfirm={() => act(() => api.deleteOrder(o.id), "Order deleted").then((ok) => ok && onDeleted())}
              >
                Delete order
              </ConfirmButton>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="adm-steps" aria-label="Order progress">
            {FLOW.map((s, i, all) => (
              <span key={s} className={all.indexOf(o.status) >= i ? "done" : ""}>
                {STATUS[s].label}
              </span>
            ))}
          </div>

          {booked ? (
            <div className="adm-status-row">
              <p className="adm-from-courier">
                <CourierStatus courier={o.courier} status={o.courier_status} />
                <span>
                  {o.status === "delivered"
                    ? "Delivered. Mark it paid once PostEx transfers the cash."
                    : "Status comes from PostEx — Sync on the Orders page keeps it up to date."}
                </span>
              </p>
              {o.status === "packed" && (
                <ConfirmButton disabled={busy} confirmLabel="Cancel here and at PostEx?" onConfirm={cancelOrder}>
                  Cancel order
                </ConfirmButton>
              )}
            </div>
          ) : (
            <div className="adm-status-row">
              <input
                className="adm-input grow"
                placeholder="Note for the timeline (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="adm-btns">
                {o.status === "pending" ? (
                  <button className="adm-btn primary" disabled={busy} onClick={confirmAndBook}>
                    Confirm &amp; book with PostEx
                  </button>
                ) : (
                  <button className="adm-btn primary" disabled={busy} onClick={() => setBooking({ auto: false })}>
                    Book with PostEx
                  </button>
                )}
                <ConfirmButton disabled={busy} confirmLabel="Yes, cancel & restock" onConfirm={cancelOrder}>
                  Cancel order
                </ConfirmButton>
              </div>
            </div>
          )}
        </>
      )}

      <details className="adm-manual">
        <summary>Override status (only if PostEx can't)</summary>
        <div className="adm-status-row">
          <select className="adm-input" value={manual} onChange={(e) => setManual(e.target.value)}>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS[s].label}</option>
            ))}
          </select>
          {(manual === "cancelled" || manual === "returned") && !o.restocked && (
            <label className="adm-check">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
              Put items back in stock
            </label>
          )}
          <button className="adm-btn" disabled={busy || manual === o.status} onClick={() => move(manual, { restock })}>
            Apply
          </button>
        </div>
        <p className="adm-hint">
          For orders delivered by hand or merged into another parcel. Cancelling or returning puts the items back
          in stock (once) unless you untick it.
        </p>
      </details>

      {booking && (
        <BookingSheet
          ids={[o.id]}
          autoBook={booking.auto}
          onClose={() => setBooking(null)}
          onBooked={() => act(async () => {})}
        />
      )}
    </section>
  );
}

// ----------------------------------------------------------------- customer

function Customer({ order: o, busy, act }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const first = o.customer_name.split(" ")[0];
  const wa = `https://wa.me/92${o.phone.slice(1)}?text=${encodeURIComponent(
    `Assalam o Alaikum ${first}! Thank you for your order #${o.order_number} from Fanaar (${money(o.total)}, cash on delivery). ` +
      `Please reply YES to confirm delivery to: ${o.address}, ${o.city}.`
  )}`;

  if (editing) {
    return (
      <section className="adm-card">
        <h2>Edit customer details</h2>
        {[
          ["customer_name", "Name"],
          ["phone", "Phone"],
          ["email", "Email"],
          ["address", "Address"],
          ["city", "City"],
          ["postal_code", "Postal code"],
        ].map(([k, label]) => (
          <label className="adm-field" key={k}>
            <span>{label}</span>
            {k === "address" ? (
              <textarea rows={3} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            ) : (
              <input value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            )}
          </label>
        ))}
        <div className="adm-btns">
          <button
            className="adm-btn primary"
            disabled={busy || !form.customer_name?.trim() || !form.phone?.trim()}
            onClick={async () => {
              const patch = Object.fromEntries(EDITABLE.map((k) => [k, form[k]?.trim() || null]));
              if (await act(() => api.updateOrder(o.id, patch), "Customer details saved")) setEditing(false);
            }}
          >
            Save
          </button>
          <button className="adm-btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </section>
    );
  }

  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2>Customer</h2>
        <button
          className="adm-link"
          onClick={() => {
            setForm(Object.fromEntries(EDITABLE.map((k) => [k, o[k] || ""])));
            setEditing(true);
          }}
        >
          Edit
        </button>
      </div>
      <p className="adm-strong">{o.customer_name}</p>
      <p className="adm-address">
        {o.address}
        <br />
        {o.city}
        {o.postal_code ? ` ${o.postal_code}` : ""}
      </p>
      <p className="adm-contact">
        <a href={`tel:${o.phone}`}>{fmtPhone(o.phone)}</a>
        {o.email && <a href={`mailto:${o.email}`}>{o.email}</a>}
      </p>
      {o.customer_note && <p className="adm-callout">“{o.customer_note}”</p>}
      <div className="adm-btns">
        <a className="adm-btn wa" href={wa} target="_blank" rel="noreferrer">
          WhatsApp to confirm
        </a>
        <a className="adm-btn" href={`tel:${o.phone}`}>Call</a>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ source
// Where the order came from (saved at checkout by src/lib/attribution.js).

const ORGANIC = {
  Instagram: "Instagram — your bio link, a story, a post or a DM (not an ad)",
  Facebook: "Facebook — a post, your page or a message (not an ad)",
  Threads: "Threads (not an ad)",
  WhatsApp: "A link shared on WhatsApp",
  Google: "Google search",
  TikTok: "TikTok (not an ad)",
  Pinterest: "Pinterest",
  YouTube: "YouTube",
  "Facebook / Instagram": "Facebook or Instagram — a link without ad tags",
};

function OrderSource({ order: o }) {
  const src = o.source;
  if (!src) {
    return (
      <details className="adm-card adm-source-card">
        <summary>
          <h2>Where this order came from</h2>
          <span className="muted">Not recorded</span>
        </summary>
        <p className="adm-hint">Sources are saved for orders placed from 15 October 2026 onwards.</p>
      </details>
    );
  }

  const ad = src.kind === "ad";
  const meta = ad && isMetaPlatform(src.platform);
  const headline = ad
    ? `${meta ? "Meta ad" : "Ad"} · ${src.platform}`
    : src.kind === "organic"
      ? ORGANIC[src.platform] || `A link on ${src.platform}`
      : "Direct — typed the address, a bookmark, or a link with no trace";
  const when = (iso) => (iso ? fmtDate(iso) : null);
  const daysBefore = (iso) => {
    if (!iso) return null;
    const days = Math.floor((Date.parse(o.created_at) - Date.parse(iso)) / 864e5);
    return days <= 0 ? "same day as the order" : days === 1 ? "1 day before ordering" : `${days} days before ordering`;
  };
  const rows = [
    ad && ["Campaign", src.campaign || (meta ? "Not tagged — add {{campaign.name}} to the ad's URL parameters" : null)],
    ad && src.adset && ["Ad set", src.adset],
    ad && src.ad && ["Ad", src.ad],
    ["Landed on", src.landing],
    src.referrer && ["Came via", src.referrer],
    src.touched_at && ["Visit", `${when(src.touched_at)} · ${daysBefore(src.touched_at)}`],
    src.first_at && [
      "First found you",
      `${src.first_kind === "direct" || !src.first_platform ? "Direct" : `${src.first_platform}${src.first_kind === "ad" ? " ad" : ""}`}${src.first_campaign ? ` (${src.first_campaign})` : ""} · ${when(src.first_at)}`,
    ],
  ].filter((r) => r && r[1]);

  return (
    <details className="adm-card adm-source-card">
      <summary>
        <h2>Where this order came from</h2>
        <SourceTag source={src} />
      </summary>
      <p className="adm-strong">{headline}</p>
      <dl className="adm-source-rows">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ----------------------------------------------------------------- shipping

function Shipping({ order: o, busy, act }) {
  const toast = useToast();
  const [courier, setCourier] = useState(o.courier || "");
  const [tracking, setTracking] = useState(o.tracking_number || "");
  useEffect(() => {
    setCourier(o.courier || "");
    setTracking(o.tracking_number || "");
  }, [o.courier, o.tracking_number]);
  const dirty = courier !== (o.courier || "") || tracking !== (o.tracking_number || "");
  const withPostEx = o.courier === "PostEx" && o.tracking_number;

  if (withPostEx) {
    return (
      <section className="adm-card">
        <h2>Shipping</h2>
        <p className="adm-courier-head">
          <CourierStatus courier="PostEx" status={o.courier_status} />
        </p>
        <p className="adm-strong">{o.tracking_number}</p>
        <p className="adm-sub">
          {o.courier_city ? `To ${o.courier_city}` : "PostEx"}
          {o.courier_status_at ? ` · checked ${timeAgo(o.courier_status_at)}` : ""}
        </p>
        <div className="adm-btns">
          <button
            className="adm-btn"
            onClick={() =>
              openPdf(() => api.postexPdf("awb", [o.id]), `postex-${o.tracking_number}`).catch((e) => toast(e.message, "err"))
            }
          >
            Airway bill
          </button>
          {(o.status === "confirmed" || o.status === "packed") && (
            <ConfirmButton
              disabled={busy}
              confirmLabel="Yes, cancel at PostEx"
              onConfirm={() => act(() => api.postexCancel(o.id), "PostEx booking cancelled")}
            >
              Cancel booking
            </ConfirmButton>
          )}
        </div>
        <p className="adm-hint">Sync on the Orders page moves this order on as PostEx picks it up and delivers it.</p>
      </section>
    );
  }

  return (
    <section className="adm-card">
      <h2>Shipping</h2>
      <p className="adm-hint adm-or">
        Booked with PostEx from the status panel above. Sending it another way? Add that courier&apos;s tracking:
      </p>
      <label className="adm-field">
        <span>Courier</span>
        <input list="adm-couriers-side" value={courier} onChange={(e) => setCourier(e.target.value)} />
        <datalist id="adm-couriers-side">
          {COURIERS.map((c) => <option key={c} value={c} />)}
        </datalist>
      </label>
      <label className="adm-field">
        <span>Tracking number</span>
        <input value={tracking} onChange={(e) => setTracking(e.target.value)} />
      </label>
      {dirty && (
        <button
          className="adm-btn primary"
          disabled={busy}
          onClick={() =>
            act(
              () => api.updateOrder(o.id, { courier: courier.trim() || null, tracking_number: tracking.trim() || null }),
              "Shipping details saved"
            )
          }
        >
          Save shipping
        </button>
      )}
    </section>
  );
}

function InternalNote({ order: o, busy, act }) {
  const [text, setText] = useState(o.admin_note || "");
  useEffect(() => setText(o.admin_note || ""), [o.admin_note]);
  return (
    <section className="adm-card">
      <h2>Internal note</h2>
      <p className="adm-hint">Only visible to admins.</p>
      <textarea className="adm-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      {text !== (o.admin_note || "") && (
        <button
          className="adm-btn primary"
          disabled={busy}
          onClick={() => act(() => api.updateOrder(o.id, { admin_note: text.trim() || null }), "Note saved")}
        >
          Save note
        </button>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- timeline

const KIND_LABEL = { payment: "Payment", shipping: "Tracking added", note: "Note" };

function Timeline({ order, events, busy, act }) {
  const [note, setNote] = useState("");
  return (
    <section className="adm-card">
      <h2>Timeline</h2>
      <form
        className="adm-status-row adm-inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) return;
          if (await act(() => api.addOrderNote(order.id, note.trim()), "Note added")) setNote("");
        }}
      >
        <input
          className="adm-input grow"
          placeholder="Add a note — e.g. “Customer confirmed on WhatsApp”"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="adm-btn" disabled={busy || !note.trim()}>Add</button>
      </form>
      <ol className="adm-timeline">
        {[...events].reverse().map((e) => (
          <li key={e.id}>
            <span className="adm-timeline-what">
              {e.kind === "status" ? (
                <>Marked <StatusBadge status={e.status} /></>
              ) : (
                <strong>{KIND_LABEL[e.kind]}</strong>
              )}
              {e.message && <span className="adm-timeline-msg">{e.message}</span>}
            </span>
            <time dateTime={e.created_at}>{fmtDate(e.created_at)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------ packing slip

function PackingSlip({ order: o, items }) {
  return (
    <div className="adm-slip" aria-hidden="true">
      <div className="adm-slip-head">
        <img src="/logo.png" alt="" />
        <div>
          <strong>Order #{o.order_number}</strong>
          <span>{fmtDate(o.created_at, false)}</span>
        </div>
      </div>
      <div className="adm-slip-to">
        <span>Ship to</span>
        <strong>{o.customer_name}</strong>
        <p>
          {o.address}
          <br />
          {o.city} {o.postal_code || ""}
          <br />
          {fmtPhone(o.phone)}
        </p>
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th>Size</th><th>Qty</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}><td>{i.title}</td><td>{i.size}</td><td>{i.quantity}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="adm-slip-cod">
        Cash to collect: <strong>{money(o.total)}</strong>
      </p>
      {o.customer_note && <p>Note: {o.customer_note}</p>}
    </div>
  );
}
