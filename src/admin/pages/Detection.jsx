import { useState } from "react";
import { Link } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { STATUS } from "../../lib/orderStatus";
import { ConfirmButton, CourierStatus, ErrorBox, fmtPhone, money, PageHead, Spinner, StatusBadge, timeAgo, useLoad, useToast } from "../ui";

// Orders that look fake or spam. The rule (supabase/migrations/*_order_detection.sql):
// the same internet connection placed two or more orders within 7 days, each
// with a different name, phone number and address. The admin decides:
// "Cancel as spam" or "Looks genuine".
// Statuses an order can still be cancelled from (booked parcels are cancelled
// at PostEx first).
const CANCELLABLE = ["pending", "confirmed", "packed"];
const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
// Same comparison as the database (norm_text): letters and digits only.
const norm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const differs = (a, b) =>
  norm(a.customer_name) !== norm(b.customer_name) && a.phone !== b.phone && norm(a.address) !== norm(b.address);

export default function Detection() {
  const { version, refreshStats } = useFeed();
  const toast = useToast();
  const res = useLoad(() => api.detectionGroups(), [version]);
  const [busy, setBusy] = useState(null); // group key while acting

  // Settles a whole group: `spam` orders are cancelled (items back in stock)
  // and marked spam; `genuine` ones are kept and their flag cleared.
  async function settle(group, spam, genuine) {
    const cancels = spam.filter((o) => CANCELLABLE.includes(o.status)).length;
    setBusy(group.key);
    try {
      // Parcels booked with PostEx but not picked up are cancelled there first.
      for (const o of spam.filter((x) => x.tracking_number && x.status === "packed")) {
        await api.postexCancel(o.id);
      }
      if (spam.length) await api.reviewOrders(spam.map((o) => o.id), "spam");
      if (genuine.length) await api.reviewOrders(genuine.map((o) => o.id), "genuine");
      const kept = genuine.length ? ` · ${plural(genuine.length, "order")} kept as real` : "";
      toast(
        !spam.length
          ? "Marked as genuine — the flags are cleared"
          : cancels
            ? `${plural(cancels, "order")} cancelled as spam, items back in stock${kept}`
            : `${plural(spam.length, "order")} marked as spam${kept}`
      );
      res.reload();
      refreshStats();
    } catch (err) {
      toast(err.message || "Something went wrong.", "err");
    } finally {
      setBusy(null);
    }
  }

  const groups = res.data || [];

  return (
    <>
      <PageHead title="Detection" sub="Orders that look fake or spam" />

      <section className="adm-card adm-detect-rule">
        <h2>How orders are flagged</h2>
        <p>
          The <strong>same internet connection</strong> placed two or more orders within <strong>7 days</strong>, and each
          one has a <strong>different name, phone number and address</strong>. Every new order is checked automatically.
        </p>
        <p className="adm-hint">
          Mobile networks sometimes share one connection between several people, so check the device line on each
          group: the same phone and browser is a strong sign it&apos;s one person.
        </p>
      </section>

      <ErrorBox error={res.error} onRetry={res.reload} />
      {res.error ? null : res.data === undefined ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <p className="adm-empty">Nothing suspicious right now. New orders are checked the moment they come in.</p>
      ) : (
        groups.map((g) => (
          <Group key={g.key} group={g} busy={busy === g.key} onSettle={(spam, genuine) => settle(g, spam, genuine)} />
        ))
      )}
    </>
  );
}

function Group({ group: g, busy, onSettle }) {
  const flagged = g.orders.filter((o) => o.suspected);
  // Ticked = spam. Every flagged order starts ticked; the admin unticks the real ones.
  const [unticked, setUnticked] = useState(() => new Set());
  const chosen = flagged.filter((o) => !unticked.has(o.id));
  const real = flagged.filter((o) => unticked.has(o.id));
  const toggle = (id) =>
    setUnticked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  // Strong evidence: a flagged order and one with completely different details
  // came from the same phone model and browser.
  const sameDevice = flagged.some((o) =>
    g.orders.some((x) => x.id !== o.id && o.device && x.device === o.device && differs(o, x))
  );
  const span = Date.parse(g.last_at) - Date.parse(g.first_at);
  const days = Math.round(span / 864e5);
  const cancellable = chosen.filter((o) => CANCELLABLE.includes(o.status));
  const withCourier = chosen.filter((o) => ["shipped", "delivered", "returned"].includes(o.status));
  // The same customer ordering again from this connection (same phone).
  const firstByPhone = new Map();
  for (const o of g.orders) if (!firstByPhone.has(o.phone)) firstByPhone.set(o.phone, o);

  return (
    <section className="adm-card adm-detect-group">
      <div className="adm-detect-head">
        <div>
          <h2>
            {plural(g.orders.length, "order")} from one connection
            <small> · {days < 1 ? "within a day" : `over ${days} ${days === 1 ? "day" : "days"}`}</small>
          </h2>
          <p className="adm-hint">
            Connection {g.key} · {flagged.length} to review · latest {timeAgo(g.last_at)}
          </p>
        </div>
        <span className={`adm-evidence ${sameDevice ? "is-strong" : ""}`}>
          {sameDevice ? "Same phone & browser" : "Different phones / browsers"}
        </span>
      </div>
      <p className="adm-detect-why">
        {sameDevice
          ? "Different names, phone numbers and addresses from the same phone and browser — very likely one person."
          : "Different names, phone numbers and addresses. The devices differ, so this could be different people on the same mobile network — call before sending."}{" "}
        Untick the orders you know are real.
      </p>

      <ul className="adm-detect-orders">
        {g.orders.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            repeatOf={firstByPhone.get(o.phone)}
            ticked={!unticked.has(o.id)}
            busy={busy}
            onToggle={() => toggle(o.id)}
          />
        ))}
      </ul>

      <div className="adm-btns adm-detect-actions">
        <button type="button" className="adm-btn" disabled={busy} onClick={() => onSettle([], flagged)}>
          {flagged.length === 1 ? "Looks genuine" : "All look genuine"}
        </button>
        <ConfirmButton
          disabled={busy || !chosen.length}
          confirmLabel={cancellable.length ? `Yes, cancel ${cancellable.length} & restock` : "Yes, mark as spam"}
          onConfirm={() => onSettle(chosen, real)}
        >
          {busy
            ? "Working…"
            : !chosen.length
              ? "Tick the fake ones"
              : cancellable.length
                ? `Cancel ${plural(cancellable.length, "ticked order")} as spam`
                : `Mark ${plural(chosen.length, "ticked order")} as spam`}
        </ConfirmButton>
      </div>
      {chosen.length > 0 && real.length > 0 && (
        <p className="adm-hint adm-detect-note">
          {real.map((o) => `#${o.order_number}`).join(", ")} will be kept and marked as real.
        </p>
      )}
      {withCourier.length > 0 && (
        <p className="adm-hint">
          Already picked up by PostEx, so only marked as spam:{" "}
          {withCourier.map((o) => `#${o.order_number} (${STATUS[o.status]?.label.toLowerCase() || o.status})`).join(", ")}.
        </p>
      )}
    </section>
  );
}

function OrderRow({ order: o, repeatOf, ticked, busy, onToggle }) {
  return (
    <li className={o.suspected ? "is-flagged" : ""}>
      {o.suspected ? (
        <label className="adm-detect-tick">
          <input
            type="checkbox"
            checked={ticked}
            disabled={busy}
            onChange={onToggle}
            aria-label={`Include order ${o.order_number}`}
          />
        </label>
      ) : (
        <span className="adm-detect-tick" />
      )}
      <Link to={`/admin/orders/${o.id}`} className="adm-detect-order">
        <span className="adm-detect-main">
          <strong>#{o.order_number}</strong> {o.customer_name}
          <small>
            {fmtPhone(o.phone)} · {o.address}, {o.city}
          </small>
          <small>
            {timeAgo(o.created_at)} · device {o.device || "unknown"}
            {o.fraud_review ? ` · marked ${o.fraud_review}` : ""}
          </small>
          {repeatOf && repeatOf !== o && (
            <small className="adm-detect-repeat">Same customer as #{repeatOf.order_number}</small>
          )}
        </span>
        <span className="adm-detect-side">
          <span className="adm-num">{money(o.total)}</span>
          {o.tracking_number ? (
            <CourierStatus courier={o.courier} status={o.courier_status} />
          ) : (
            <StatusBadge status={o.status} />
          )}
        </span>
      </Link>
    </li>
  );
}
