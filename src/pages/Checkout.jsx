import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useCatalog } from "../context/CatalogContext";
import { BACKEND, placeOrder } from "../lib/api";
import { formatPrice, shippingFor } from "../lib/catalog";
import { trackInitiateCheckout, trackPurchase } from "../lib/pixel";

const DETAILS_KEY = "fanaar-checkout-details";
const FIELDS = ["name", "phone", "email", "address", "city", "postal_code"];

// Suggestions only — any city can be typed.
const CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
  "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Hyderabad", "Bahawalpur",
  "Sargodha", "Sukkur", "Abbottabad", "Sahiwal", "Jhang", "Sheikhupura",
  "Rahim Yar Khan", "Gujrat", "Mardan", "Kasur", "Okara", "Dera Ghazi Khan",
  "Mirpur (AJK)", "Muzaffarabad", "Gilgit", "Larkana", "Nawabshah",
];

function loadDetails() {
  try {
    const d = JSON.parse(localStorage.getItem(DETAILS_KEY));
    if (d && typeof d === "object") return d;
  } catch {
    /* ignore */
  }
  return null;
}

// Same rules as place_order() in the database — checked here first so
// shoppers get instant, field-level feedback.
function validate(f) {
  const e = {};
  const digits = f.phone.replace(/\D/g, "").replace(/^(0092|92|0)/, "");
  if (f.name.trim().length < 2) e.name = "Please enter your full name.";
  if (!/^3\d{9}$/.test(digits)) e.phone = "Enter a mobile number like 0300 1234567.";
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()))
    e.email = "Please check your email address.";
  if (f.address.trim().length < 5) e.address = "Please enter your full delivery address.";
  if (f.city.trim().length < 2) e.city = "Please enter your city.";
  if (f.postal_code.trim().length > 12) e.postal_code = "Please check your postal code.";
  return e;
}

export default function Checkout() {
  const { items, subtotal, updateQty, remove, clear } = useCart();
  const catalog = useCatalog();
  const navigate = useNavigate();

  const saved = useRef(loadDetails());
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(FIELDS.map((k) => [k, saved.current?.[k] || ""])),
    note: "",
  }));
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fresh prices + stock before the shopper commits.
  useEffect(() => {
    catalog.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tracked = useRef(false);
  useEffect(() => {
    if (!tracked.current && items.length) {
      tracked.current = true;
      trackInitiateCheckout(items, subtotal);
    }
  }, [items, subtotal]);

  const settings = catalog.settings;
  const shipping = shippingFor(subtotal, settings);
  const total = subtotal + (shipping || 0);
  const problems = items.filter((i) => i.available != null && i.qty > i.available);
  const closed = BACKEND === "static" || settings?.acceptingOrders === false;
  const freeLeft =
    settings?.freeShippingThreshold != null && shipping > 0
      ? settings.freeShippingThreshold - subtotal
      : null;

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError("");
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) {
      document.getElementById(`co-${Object.keys(v)[0]}`)?.focus();
      return;
    }
    if (problems.length) {
      setSubmitError("Some pieces in your bag have changed — please review them below.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await placeOrder({
        customer: { ...form },
        items: items.map((i) => ({ product_id: i.id, size: i.size, qty: i.qty })),
      });
      trackPurchase(order, form);
      try {
        if (remember) {
          localStorage.setItem(
            DETAILS_KEY,
            JSON.stringify(Object.fromEntries(FIELDS.map((k) => [k, form[k].trim()])))
          );
        } else localStorage.removeItem(DETAILS_KEY);
      } catch {
        /* ignore */
      }
      navigate(`/order/${order.id}`, { replace: true, state: { placed: true } });
      clear();
      catalog.refresh();
    } catch (err) {
      setSubmitError(err.message || "Something went wrong. Please try again.");
      catalog.refresh(); // stock may have moved under us
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="wrap empty-state" style={{ padding: "120px 0" }}>
        <span className="eyebrow">Checkout</span>
        <h1 className="empty-lead">Your bag is empty.</h1>
        <p className="empty-sub">Add a piece or two and come back here to place your order.</p>
        <Link to="/collections/all-top" className="btn-solid">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="wrap checkout">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span className="current">Checkout</span>
      </nav>

      <h1 className="checkout-title">Checkout</h1>

      <div className="checkout-grid">
        <form className="checkout-form" onSubmit={onSubmit} noValidate>
          <fieldset>
            <legend>Contact</legend>
            <Field id="name" label="Full name" error={errors.name}>
              <input id="co-name" autoComplete="name" value={form.name} onChange={set("name")} />
            </Field>
            <div className="field-row">
              <Field id="phone" label="Mobile number" error={errors.phone}>
                <input
                  id="co-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="03XX XXXXXXX"
                  value={form.phone}
                  onChange={set("phone")}
                />
              </Field>
              <Field id="email" label="Email" optional error={errors.email}>
                <input
                  id="co-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={set("email")}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Delivery</legend>
            <Field id="address" label="Address" error={errors.address}>
              <textarea
                id="co-address"
                rows={2}
                autoComplete="street-address"
                placeholder="House, street, area"
                value={form.address}
                onChange={set("address")}
              />
            </Field>
            <div className="field-row">
              <Field id="city" label="City" error={errors.city}>
                <input
                  id="co-city"
                  list="co-cities"
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={set("city")}
                />
                <datalist id="co-cities">
                  {CITIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field id="postal_code" label="Postal code" optional error={errors.postal_code}>
                <input
                  id="co-postal_code"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={form.postal_code}
                  onChange={set("postal_code")}
                />
              </Field>
            </div>
            <Field id="note" label="Delivery note" optional>
              <input
                id="co-note"
                maxLength={500}
                placeholder="Landmark, preferred time…"
                value={form.note}
                onChange={set("note")}
              />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Payment</legend>
            <label className="pay-option is-selected">
              <input type="radio" name="payment" defaultChecked readOnly />
              <span>
                <strong>Cash on delivery</strong>
                <small>Pay in cash when your order arrives.</small>
              </span>
            </label>
          </fieldset>

          <label className="remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Save my details on this device for next time
          </label>

          {closed && (
            <div className="form-notice" role="status">
              {BACKEND === "static"
                ? "Online ordering is being set up. Please message us on Instagram to order."
                : "We're not taking orders right now. Please check back soon."}
            </div>
          )}
          {submitError && (
            <div className="form-error" role="alert">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            className="btn-solid full checkout-submit"
            disabled={submitting || closed}
          >
            {submitting ? "Placing order…" : `Place order · ${formatPrice(total)}`}
          </button>
          <p className="checkout-fine">
            We&apos;ll call or WhatsApp you to confirm before dispatch. Delivery
            across Pakistan in 3–5 working days.
          </p>
        </form>

        <aside className="checkout-summary" aria-label="Order summary">
          <h2>Your order</h2>
          <ul className="co-lines">
            {items.map((i) => (
              <li key={i.key} className="co-line">
                <div className="co-line-img">
                  <img src={i.image} alt="" />
                  <span className="co-line-qty">{i.qty}</span>
                </div>
                <div className="co-line-info">
                  <Link to={`/products/${i.handle}`}>{i.title}</Link>
                  <span>Size {i.size}</span>
                  {i.available === 0 ? (
                    <span className="co-line-warn">
                      Sold out —{" "}
                      <button type="button" onClick={() => remove(i.key)}>
                        remove
                      </button>
                    </span>
                  ) : (
                    i.available != null &&
                    i.qty > i.available && (
                      <span className="co-line-warn">
                        Only {i.available} left —{" "}
                        <button type="button" onClick={() => updateQty(i.key, i.available)}>
                          update to {i.available}
                        </button>
                      </span>
                    )
                  )}
                </div>
                <span className="co-line-price">{formatPrice(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>

          <dl className="co-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{shipping == null ? "—" : shipping === 0 ? "Free" : formatPrice(shipping)}</dd>
            </div>
            <div className="co-total">
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>
          {freeLeft > 0 && (
            <p className="co-hint">
              Add {formatPrice(freeLeft)} more for free shipping.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ id, label, optional, error, children }) {
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor={`co-${id}`}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
