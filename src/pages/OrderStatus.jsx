import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchOrder } from "../lib/api";
import { formatPrice } from "../lib/catalog";
import { FLOW, STATUS } from "../lib/orderStatus";

// Order confirmation + status page. The URL holds the order's private id,
// so shoppers can bookmark it to check progress later.
export default function OrderStatus() {
  const { id } = useParams();
  const { state } = useLocation();
  const justPlaced = Boolean(state?.placed);
  const [order, setOrder] = useState(undefined); // undefined = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setOrder(undefined);
    setFailed(false);
    fetchOrder(id)
      .then((o) => live && setOrder(o))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  if (failed) {
    return (
      <div className="wrap empty-state" style={{ padding: "120px 0" }}>
        <h1 className="empty-lead">We couldn&apos;t load this order.</h1>
        <p className="empty-sub">Check your connection and refresh the page.</p>
      </div>
    );
  }

  if (order === undefined) {
    return (
      <div className="wrap order-page" aria-busy="true">
        <div className="card-skel-line short" />
        <div className="card-skel-line" style={{ height: 40, maxWidth: 420, margin: "18px 0" }} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="wrap empty-state" style={{ padding: "120px 0" }}>
        <span className="eyebrow">Order</span>
        <h1 className="empty-lead">Order not found.</h1>
        <p className="empty-sub">The link may be incomplete. Message us and we&apos;ll look it up.</p>
        <Link to="/" className="btn-solid">
          Return home
        </Link>
      </div>
    );
  }

  const firstName = order.customer_name.split(" ")[0];
  const stopped = order.status === "cancelled" || order.status === "returned";
  const reached = FLOW.indexOf(order.status);
  const placedOn = new Date(order.created_at).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="wrap order-page">
      <span className="eyebrow">
        Order #{order.order_number} · {placedOn}
      </span>
      <h1 className="order-title">
        {justPlaced ? `Thank you, ${firstName}.` : STATUS[order.status].customer}
      </h1>
      <p className="order-lead">
        {justPlaced
          ? `Your order is in. We'll call or WhatsApp you on ${order.phone} to confirm before dispatch.`
          : stopped
          ? "This order is closed. Message us if you have any questions."
          : "Here's where your order is. Bookmark this page to check back any time."}
      </p>

      {stopped ? (
        <div className="order-stopped">{STATUS[order.status].customer}</div>
      ) : (
        <ol className="order-steps">
          {FLOW.map((s, i) => (
            <li key={s} className={i <= reached ? "done" : ""} aria-current={i === reached ? "step" : undefined}>
              <span className="dot" />
              {STATUS[s].customer}
            </li>
          ))}
        </ol>
      )}

      {order.tracking_number && (
        <p className="order-tracking">
          Tracking: <strong>{[order.courier, order.tracking_number].filter(Boolean).join(" · ")}</strong>
        </p>
      )}

      <div className="order-grid">
        <section className="order-box">
          <h2>Items</h2>
          <ul className="co-lines">
            {order.items.map((i) => (
              <li key={`${i.title}-${i.size}`} className="co-line">
                <div className="co-line-img">
                  {i.image && <img src={i.image} alt="" />}
                  <span className="co-line-qty">{i.quantity}</span>
                </div>
                <div className="co-line-info">
                  {i.handle ? <Link to={`/products/${i.handle}`}>{i.title}</Link> : <span>{i.title}</span>}
                  <span>Size {i.size}</span>
                </div>
                <span className="co-line-price">{formatPrice(i.unit_price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="co-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(order.subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{order.shipping_fee === 0 ? "Free" : formatPrice(order.shipping_fee)}</dd>
            </div>
            <div className="co-total">
              <dt>Total</dt>
              <dd>{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </section>

        <section className="order-box">
          <h2>Delivery</h2>
          <p className="order-address">
            {order.customer_name}
            <br />
            {order.address}
            <br />
            {order.city}
            <br />
            {order.phone}
          </p>
          <h2>Payment</h2>
          <p className="order-address">
            Cash on delivery — please keep {formatPrice(order.total)} ready.
          </p>
        </section>
      </div>

      <div className="order-actions">
        <Link to="/collections/all-top" className="btn-solid">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
