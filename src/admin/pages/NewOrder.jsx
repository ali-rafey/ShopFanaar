import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { thumb } from "../../lib/catalog";
import { BookingSheet } from "../PostEx";
import { ErrorBox, money, PageHead, Spinner, useLoad, useToast } from "../ui";

// An order the admin makes for a sale outside the website (create_manual_order):
// someone at the shop, or someone who phoned or messaged. Either handed over
// in person — delivered and paid straight away, full price in the earnings —
// or sent with PostEx: booked right after, like a website order, and Rs 300
// PostEx fee comes off the earnings.
const CHANNELS = ["Walk-in", "Phone call", "WhatsApp", "Instagram", "Facebook", "Other"];
const DEFAULT_CHANNEL = { handover: "Walk-in", postex: "Phone call" };

let nextKey = 1;
const newLine = () => ({ key: nextKey++, productId: "", size: "", qty: 1, price: "" });

export default function NewOrder() {
  const navigate = useNavigate();
  const { stats, refreshStats } = useFeed();
  const toast = useToast();
  const res = useLoad(() => Promise.all([api.listProducts(), api.getSettings()]), []);
  const [products, settings] = res.data || [];

  const [delivery, setDelivery] = useState("handover");
  const [channel, setChannel] = useState(null); // null: the usual one for this delivery
  const [lines, setLines] = useState(() => [newLine()]);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", city: "" });
  const [fee, setFee] = useState(null); // null: the store's delivery charge
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // PostEx: the new order, while booking

  const byId = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);
  const postex = delivery === "postex";
  const chosenChannel = channel ?? DEFAULT_CHANNEL[delivery];
  const courierFee = stats?.courier_fee ?? 300;

  const subtotal = lines.reduce((n, l) => n + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const storeFee = settings
    ? settings.freeShippingThreshold != null && subtotal >= settings.freeShippingThreshold
      ? 0
      : settings.shippingFee
    : 0;
  const shipping = postex ? (fee ?? storeFee) : 0;
  const total = subtotal + (Number(shipping) || 0);

  const lineProblem = (l) => {
    const p = byId.get(l.productId);
    if (!p || !l.size) return "Choose the article and size";
    const s = p.sizes.find((x) => x.size === l.size);
    const taken = lines.filter((x) => x.productId === l.productId && x.size === l.size).reduce((n, x) => n + (Number(x.qty) || 0), 0);
    if (!(Number(l.qty) >= 1)) return "How many?";
    if (!s || taken > s.qty) return s?.qty ? `Only ${s.qty} in stock` : "Out of stock — update the stock in Products";
    if (l.price === "" || !(Number(l.price) >= 0)) return "Enter the price";
    return null;
  };
  const customerProblem = postex
    ? !customer.name.trim()
      ? "Enter the customer's name"
      : !/^(\+?92|0)?3\d{9}$/.test(customer.phone.replace(/[\s-]/g, ""))
        ? "Enter a mobile number, e.g. 0300 1234567"
        : customer.address.trim().length < 5
          ? "Enter the full address"
          : customer.city.trim().length < 2
            ? "Enter the city"
            : null
    : customer.phone.trim() && !/^(\+?92|0)?3\d{9}$/.test(customer.phone.replace(/[\s-]/g, ""))
      ? "Check the mobile number"
      : null;
  const problem = lines.map(lineProblem).find(Boolean) || customerProblem;

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickProduct = (key, productId) => {
    const p = byId.get(productId);
    const size = p?.sizes.find((s) => s.qty > 0)?.size || "";
    setLine(key, { productId, size, price: p ? String(p.price) : "" });
  };

  async function submit() {
    setBusy(true);
    try {
      const out = await api.createManualOrder({
        delivery,
        channel: chosenChannel,
        customer: postex ? customer : { name: customer.name, phone: customer.phone },
        items: lines.map((l) => ({ product_id: l.productId, size: l.size, qty: Number(l.qty), price: Math.round(Number(l.price)) })),
        shipping_fee: postex ? Math.round(Number(shipping) || 0) : 0,
        note,
      });
      refreshStats();
      if (postex) {
        setCreated(out);
      } else {
        toast(`Order #${out.order_number} saved — handed over, ${money(out.total)} in earnings`);
        navigate(`/admin/orders/${out.id}`, { replace: true });
      }
    } catch (err) {
      toast(err.message || "Something went wrong.", "err");
    } finally {
      setBusy(false);
    }
  }

  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Spinner />;

  return (
    <>
      <PageHead
        back={<Link to="/admin/orders" className="adm-back">Orders</Link>}
        title="New order"
        sub="For a sale outside the website — at the shop, or by phone or message."
      />

      <section className="adm-card">
        <h2>How does it reach the customer?</h2>
        <div className="adm-choices" role="radiogroup" aria-label="Delivery">
          {[
            ["handover", "Handed over in person", "At the shop, or you deliver it yourself. Saved as delivered and paid — no courier fee."],
            ["postex", "Send with PostEx", `Booked with PostEx straight after. Rs ${courierFee} PostEx fee comes off your earnings.`],
          ].map(([value, label, hint]) => (
            <label key={value} className={`adm-choice ${delivery === value ? "is-on" : ""}`}>
              <input type="radio" name="delivery" value={value} checked={delivery === value} onChange={() => setDelivery(value)} />
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </label>
          ))}
        </div>

        <h2 className="adm-subhead">Where did the order come from?</h2>
        <div className="adm-pillset" role="radiogroup" aria-label="Where the order came from">
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={chosenChannel === c}
              className={chosenChannel === c ? "is-on" : ""}
              onClick={() => setChannel(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="adm-card">
        <h2>Articles</h2>
        <ul className="adm-new-lines">
          {lines.map((l) => {
            const p = byId.get(l.productId);
            const issue = l.productId ? lineProblem(l) : null;
            return (
              <li key={l.key}>
                <div className="adm-thumb">{p?.images[0] && <img src={thumb(p.images[0])} alt="" />}</div>
                <div className="adm-new-line">
                  <select
                    className="adm-input"
                    value={l.productId}
                    onChange={(e) => pickProduct(l.key, e.target.value)}
                    aria-label="Article"
                  >
                    <option value="">Choose an article…</option>
                    {products.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                        {x.status !== "active" ? ` (${x.status})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="adm-new-line-row">
                    <label>
                      <span>Size</span>
                      <select className="adm-input" value={l.size} disabled={!p} onChange={(e) => setLine(l.key, { size: e.target.value })}>
                        {!p && <option value="">—</option>}
                        {p?.sizes.map((s) => (
                          <option key={s.size} value={s.size} disabled={s.qty < 1}>
                            {s.size} · {s.qty < 1 ? "sold out" : `${s.qty} in stock`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Qty</span>
                      <input
                        className="adm-input"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="50"
                        value={l.qty}
                        onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Price (Rs)</span>
                      <input
                        className="adm-input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={l.price}
                        onChange={(e) => setLine(l.key, { price: e.target.value })}
                      />
                    </label>
                  </div>
                  {issue && <p className="adm-field-error">{issue}</p>}
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="adm-link danger adm-new-remove"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    aria-label="Remove this article"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="adm-btn" onClick={() => setLines((ls) => [...ls, newLine()])}>
          + Add another article
        </button>
      </section>

      <section className="adm-card">
        <h2>{postex ? "Customer" : "Customer (optional)"}</h2>
        {!postex && <p className="adm-hint adm-new-hint">Leave empty for someone at the shop.</p>}
        <div className="adm-new-grid">
          <label className="adm-field">
            <span>Name</span>
            <input value={customer.name} autoComplete="off" onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          </label>
          <label className="adm-field">
            <span>Mobile</span>
            <input
              value={customer.phone}
              inputMode="tel"
              autoComplete="off"
              placeholder="0300 1234567"
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
            />
          </label>
        </div>
        {postex && (
          <>
            <label className="adm-field">
              <span>Address</span>
              <textarea rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
            </label>
            <label className="adm-field">
              <span>City</span>
              <input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} />
            </label>
          </>
        )}
        <label className="adm-field">
          <span>Note for yourself (optional)</span>
          <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      <section className="adm-card">
        <h2>Total</h2>
        {postex && (
          <label className="adm-field adm-new-fee">
            <span>Delivery charge the customer pays (Rs)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={fee ?? storeFee}
              onChange={(e) => setFee(e.target.value)}
            />
          </label>
        )}
        <dl className="adm-totals">
          <div><dt>Articles</dt><dd>{money(subtotal)}</dd></div>
          {postex && <div><dt>Delivery</dt><dd>{Number(shipping) ? money(Number(shipping)) : "Free"}</dd></div>}
          <div className="grand">
            <dt>{postex ? "Customer pays PostEx" : "Paid in person"}</dt>
            <dd>{money(total)}</dd>
          </div>
          {postex && <div className="muted"><dt>PostEx fee (estimate)</dt><dd>−{money(courierFee)}</dd></div>}
          <div className="adm-earn">
            <dt>You earn</dt>
            <dd>{money(postex ? total - courierFee : total)}</dd>
          </div>
        </dl>
        <button type="button" className="adm-btn primary block adm-new-submit" disabled={busy || Boolean(problem)} onClick={submit}>
          {busy ? "Saving…" : postex ? "Create & book with PostEx" : "Create order — handed over"}
        </button>
        {problem && <p className="adm-hint adm-new-problem">{problem}</p>}
      </section>

      {created && (
        <BookingSheet
          ids={[created.id]}
          autoBook
          onBooked={() => refreshStats()}
          onClose={() => {
            toast(`Order #${created.order_number} created`);
            navigate(`/admin/orders/${created.id}`, { replace: true });
          }}
        />
      )}
    </>
  );
}
