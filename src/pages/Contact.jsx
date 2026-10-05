import { useState } from "react";
import { Link } from "react-router-dom";
import { shop } from "../data/store";
import { sendContactMessage } from "../lib/api";
import { trackContact } from "../lib/pixel";
import InfoLayout from "../components/InfoLayout";
import { SOCIAL_LINKS } from "../components/SocialIcons";

const EMPTY = { name: "", email: "", phone: "", order_number: "", message: "" };

export default function Contact() {
  const c = shop.contact;
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Please leave an email or phone number so we can reply.");
      return;
    }
    setState("sending");
    try {
      await sendContactMessage(form);
      trackContact();
      setState("sent");
      setForm(EMPTY);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setState("idle");
    }
  }

  const handle = (url, site) => `@${url.split(`${site}.com/`)[1]?.replace(/[/?].*$/, "") || "fanaar"}`;
  const icon = (label) => SOCIAL_LINKS.find((s) => s.label === label)?.icon;
  const channels = [
    c.whatsapp && {
      label: "WhatsApp",
      value: c.phone || `+${c.whatsapp}`,
      href: `https://wa.me/${c.whatsapp}`,
      icon: icon("WhatsApp"),
    },
    c.phone && !c.whatsapp && { label: "Phone", value: c.phone, href: `tel:${c.phone.replace(/\s/g, "")}` },
    c.email && { label: "Email", value: c.email, href: `mailto:${c.email}` },
    { label: "Instagram", value: handle(shop.social.instagram, "instagram"), href: shop.social.instagram, icon: icon("Instagram") },
    { label: "Pinterest", value: handle(shop.social.pinterest, "pinterest"), href: shop.social.pinterest, icon: icon("Pinterest") },
    c.hours && { label: "Hours", value: c.hours },
    c.location && { label: "Studio", value: c.location },
  ].filter(Boolean);

  return (
    <InfoLayout
      eyebrow="Customer care"
      title="Contact"
      lead="Questions about sizing, an order or an exchange — we usually reply within one working day."
      wide
    >
      <div className="contact-grid">
        <div className="contact-channels">
          <dl>
            {channels.map((ch) => (
              <div key={ch.label}>
                <dt>{ch.label}</dt>
                <dd>
                  {ch.href ? (
                    <a
                      href={ch.href}
                      target={ch.href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className={ch.icon ? "with-icon" : undefined}
                    >
                      {ch.icon && <img src={ch.icon} alt="" width={26} height={26} />}
                      {ch.value}
                    </a>
                  ) : (
                    ch.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="contact-note">
            Already ordered? Your order page — linked from your confirmation — shows its status and
            tracking number. For exchanges, see our <Link to="/policies/refund-policy">returns policy</Link>.
          </p>
        </div>

        {state === "sent" ? (
          <div className="contact-sent" role="status">
            <h2>Message sent.</h2>
            <p>Thank you — we&apos;ll get back to you soon.</p>
            <button type="button" className="btn-outline" onClick={() => setState("idle")}>
              Send another
            </button>
          </div>
        ) : (
          <form className="checkout-form contact-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="ct-name">Name</label>
              <input id="ct-name" autoComplete="name" required minLength={2} value={form.name} onChange={set("name")} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="ct-phone">Phone / WhatsApp</label>
                <input id="ct-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
              </div>
              <div className="field">
                <label htmlFor="ct-email">Email</label>
                <input id="ct-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ct-order">
                Order number <span className="optional">(optional)</span>
              </label>
              <input id="ct-order" inputMode="numeric" placeholder="e.g. 1001" value={form.order_number} onChange={set("order_number")} />
            </div>
            <div className="field">
              <label htmlFor="ct-message">Message</label>
              <textarea id="ct-message" rows={5} required minLength={5} maxLength={2000} value={form.message} onChange={set("message")} />
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="btn-solid full" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </InfoLayout>
  );
}
