import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { shop } from "../data/store";
import { trackOrders } from "../lib/api";
import { formatPrice, thumb } from "../lib/catalog";
import { FLOW, STATUS } from "../lib/orderStatus";

// "Track your order": the shopper enters the mobile number they ordered with
// and sees their recent orders — status, items and the courier's tracking
// number. Deliberately no name or address (anyone can type any number); the
// database also rate-limits lookups. See supabase/migrations/*_track_orders.sql.

const DETAILS_KEY = "fanaar-checkout-details"; // saved at checkout, if the shopper chose to
const POSTEX_TRACKING = "https://postex.pk/tracking";

// One line under each status heading — what happens next.
const NEXT = {
  pending: "We'll call or WhatsApp you to confirm it before we send it.",
  confirmed: "We're getting it ready to send.",
  packed: "Ready and waiting for the courier to collect it.",
  shipped: "With the courier now — keep the cash ready for delivery.",
  delivered: "We hope you love it.",
  cancelled: "If you didn't expect this, message us.",
  returned: "If you have any questions about it, message us.",
};

function savedPhone() {
  try {
    return JSON.parse(localStorage.getItem(DETAILS_KEY))?.phone || "";
  } catch {
    return "";
  }
}

const day = (iso) => new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

export default function TrackOrder() {
  const [phone, setPhone] = useState(savedPhone);
  const [result, setResult] = useState({ state: "idle" }); // idle | loading | done | error

  useEffect(() => {
    const previous = document.title;
    document.title = "Track your order — Fanaar";
    return () => {
      document.title = previous;
    };
  }, []);

  async function lookUp(e) {
    e.preventDefault();
    setResult({ state: "loading" });
    try {
      const orders = await trackOrders(phone);
      setResult({ state: "done", orders, phone: phone.trim() });
    } catch (err) {
      setResult({ state: "error", message: err.message });
    }
  }

  return (
    <div className="wrap order-page track-page">
      <span className="eyebrow">Order tracking</span>
      <h1 className="order-title">Track your order</h1>
      <p className="order-lead">Enter the mobile number you ordered with to see where your orders are.</p>

      <form className="track-form" onSubmit={lookUp} noValidate>
        <div className={`field ${result.state === "error" ? "has-error" : ""}`}>
          <label htmlFor="track-phone">Mobile number</label>
          <input
            id="track-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0300 1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          {result.state === "error" && <span className="field-error">{result.message}</span>}
        </div>
        <button className="btn-solid" type="submit" disabled={result.state === "loading" || !phone.trim()}>
          {result.state === "loading" ? "Looking…" : "Track"}
        </button>
      </form>

      {result.state === "done" &&
        (result.orders.length === 0 ? (
          <div className="track-empty">
            <p>
              No orders found for <strong>{result.phone}</strong> in the last six months.
            </p>
            <p>
              Ordered with a different number? Try that one, or{" "}
              <a href={`https://wa.me/${shop.contact.whatsapp}`} target="_blank" rel="noopener noreferrer">
                message us on WhatsApp
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="track-list">
            {result.orders.map((o) => (
              <TrackedOrder key={o.order_number} order={o} />
            ))}
            <p className="track-help">
              Questions about an order?{" "}
              <a href={`https://wa.me/${shop.contact.whatsapp}`} target="_blank" rel="noopener noreferrer">
                WhatsApp us
              </a>{" "}
              with your order number.
            </p>
          </div>
        ))}
    </div>
  );
}

function TrackedOrder({ order: o }) {
  const [copied, setCopied] = useState(false);
  const stopped = o.status === "cancelled" || o.status === "returned";
  const reached = FLOW.indexOf(o.status);
  const next = o.status === "shipped" && o.payment_status === "paid" ? "With the courier now." : NEXT[o.status];

  async function copy() {
    try {
      await navigator.clipboard.writeText(o.tracking_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the number is on screen to copy by hand */
    }
  }

  return (
    <article className="track-order">
      <header className="track-head">
        <div>
          <span className="eyebrow">
            Order #{o.order_number} · {day(o.created_at)}
          </span>
          <h2>{STATUS[o.status]?.customer || o.status}</h2>
          <p>{next}</p>
        </div>
        <div className="track-total">
          {formatPrice(o.total)}
          <small>{o.payment_status === "paid" ? "Paid" : "Cash on delivery"}</small>
        </div>
      </header>

      {!stopped && (
        <ol className="order-steps">
          {FLOW.map((s, i) => (
            <li key={s} className={i <= reached ? "done" : ""} aria-current={i === reached ? "step" : undefined}>
              <span className="dot" />
              {STATUS[s].customer}
            </li>
          ))}
        </ol>
      )}

      {o.tracking_number && (
        <div className="track-courier">
          <span>{o.courier || "Courier"} tracking number</span>
          <strong>{o.tracking_number}</strong>
          <span className="track-courier-actions">
            <button type="button" className="link-underline" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            {o.courier === "PostEx" && (
              <a className="link-underline" href={POSTEX_TRACKING} target="_blank" rel="noopener noreferrer">
                Track on PostEx ↗
              </a>
            )}
          </span>
        </div>
      )}

      <ul className="track-items">
        {o.items.map((i) => (
          <li key={`${i.title}-${i.size}`}>
            <span className="co-line-img">{i.image && <img src={thumb(i.image)} alt="" loading="lazy" />}</span>
            <span className="track-item-info">
              {i.handle ? <Link to={`/products/${i.handle}`}>{i.title}</Link> : i.title}
              <small>
                Size {i.size}
                {i.quantity > 1 ? ` · ${i.quantity} pieces` : ""}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
