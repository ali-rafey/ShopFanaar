import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { ALL_STATUSES, nextStatus, STATUS } from "../../lib/orderStatus";
import {
  ConfirmButton, ErrorBox, fmtDate, fmtPhone, money, PageHead, PayBadge, Spinner,
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

      <StatusPanel order={o} busy={busy} act={act} onDeleted={() => navigate("/admin/orders")} />

      <div className="adm-detail">
        <div className="adm-detail-main">
          <section className="adm-card">
            <h2>Items</h2>
            <ul className="adm-items">
              {items.map((i) => (
                <li key={i.id}>
                  <div className="adm-thumb">{i.image && <img src={i.image} alt="" />}</div>
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
  const next = nextStatus(o.status);
  const closed = o.status === "cancelled" || o.status === "returned";
  const [note, setNote] = useState("");
  const [courier, setCourier] = useState(o.courier || "");
  const [tracking, setTracking] = useState(o.tracking_number || "");
  const [manual, setManual] = useState(o.status);
  const [restock, setRestock] = useState(true);

  useEffect(() => {
    setManual(o.status);
    setCourier(o.courier || "");
    setTracking(o.tracking_number || "");
  }, [o.status, o.courier, o.tracking_number]);

  const move = (status, opts = {}) =>
    act(async () => {
      if (status === "shipped" && (courier !== (o.courier || "") || tracking !== (o.tracking_number || ""))) {
        await api.updateOrder(o.id, { courier: courier || null, tracking_number: tracking.trim() || null });
      }
      await api.setOrderStatus(o.id, status, note, opts.restock ?? true);
      setNote("");
    }, `Order marked ${STATUS[status].label.toLowerCase()}`);

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
            {["pending", "confirmed", "packed", "shipped", "delivered"].map((s, i, all) => (
              <span key={s} className={all.indexOf(o.status) >= i ? "done" : ""}>
                {STATUS[s].label}
              </span>
            ))}
          </div>

          {next === "shipped" && (
            <div className="adm-row">
              <label className="adm-field">
                <span>Courier</span>
                <input list="adm-couriers" value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. TCS" />
                <datalist id="adm-couriers">
                  {COURIERS.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label className="adm-field">
                <span>Tracking number</span>
                <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Consignment / CN" />
              </label>
            </div>
          )}

          {next && (
            <div className="adm-status-row">
              <input
                className="adm-input grow"
                placeholder="Note for the timeline (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="adm-btns">
                <button className="adm-btn primary" disabled={busy} onClick={() => move(next)}>
                  Mark as {STATUS[next].label.toLowerCase()}
                </button>
                {o.status === "pending" || o.status === "confirmed" || o.status === "packed" ? (
                  <ConfirmButton disabled={busy} confirmLabel="Yes, cancel & restock" onConfirm={() => move("cancelled")}>
                    Cancel order
                  </ConfirmButton>
                ) : null}
              </div>
            </div>
          )}

          {o.status === "delivered" && (
            <div className="adm-status-row">
              <p>Delivered. Mark as paid once the courier remits the cash.</p>
              <ConfirmButton className="adm-btn" disabled={busy} confirmLabel="Confirm return" onConfirm={() => move("returned", { restock })}>
                Mark returned
              </ConfirmButton>
            </div>
          )}
        </>
      )}

      <details className="adm-manual">
        <summary>Change status manually</summary>
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
          Cancelling or returning puts the items back in stock (once). Reopening a cancelled order takes them out again.
        </p>
      </details>
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

// ----------------------------------------------------------------- shipping

function Shipping({ order: o, busy, act }) {
  const [courier, setCourier] = useState(o.courier || "");
  const [tracking, setTracking] = useState(o.tracking_number || "");
  useEffect(() => {
    setCourier(o.courier || "");
    setTracking(o.tracking_number || "");
  }, [o.courier, o.tracking_number]);
  const dirty = courier !== (o.courier || "") || tracking !== (o.tracking_number || "");

  return (
    <section className="adm-card">
      <h2>Shipping</h2>
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
