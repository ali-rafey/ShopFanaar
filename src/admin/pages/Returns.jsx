import { useState } from "react";
import { Link } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { thumb } from "../../lib/catalog";
import { ConfirmButton, ErrorBox, fmtDate, money, Spinner, useLoad, useToast } from "../ui";

// Orders → Returned. Parcels PostEx has returned to us (the PostEx sync marks
// them returned once PostEx records "Returned at Merchant Warehouse"). Nothing
// goes back in stock until the admin has opened the parcel and checked the
// articles: "put back in stock", or not when something is missing or damaged.
export default function Returns({ version }) {
  const list = useLoad(() => api.listReturns(), [version]);
  const rows = list.data || [];
  const toCheck = rows.filter(needsCheck);
  const checked = rows.filter((o) => !needsCheck(o));

  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Spinner />;
  if (!rows.length) {
    return (
      <p className="adm-empty">
        No returns yet. When PostEx brings a parcel back, it shows up here so you can check it before restocking.
      </p>
    );
  }

  return (
    <>
      {toCheck.length > 0 && (
        <section aria-label="Returns to check">
          <h2 className="adm-returns-title">
            To check <span>{toCheck.length}</span>
          </h2>
          <p className="adm-hint adm-returns-hint">
            Open each parcel and check the articles, then put them back in stock.
          </p>
          {toCheck.map((o) => (
            <section key={o.id} className="adm-card adm-return">
              <ReturnHead order={o} />
              <Articles items={o.order_items} />
              <ReceiveReturn order={o} onDone={list.reload} />
            </section>
          ))}
        </section>
      )}

      {checked.length > 0 && (
        <section aria-label="Checked returns">
          <h2 className="adm-returns-title">
            Checked <span>{checked.length}</span>
          </h2>
          <ul className="adm-card flush adm-returns-done">
            {checked.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`}>
                  <span>
                    <strong>#{o.order_number}</strong> {o.customer_name}
                    <small>{o.order_items.map((i) => `${i.title} (${i.size}) × ${i.quantity}`).join(", ")}</small>
                  </span>
                  <span className={`adm-return-tag ${o.restocked ? "is-in" : ""}`}>
                    {o.restocked ? "Back in stock" : "Not restocked"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const needsCheck = (o) => !o.restocked && !o.return_received_at;

function ReturnHead({ order: o }) {
  return (
    <div className="adm-return-head">
      <div>
        <Link to={`/admin/orders/${o.id}`}>
          <strong>#{o.order_number}</strong>
        </Link>{" "}
        {o.customer_name} · {o.city}
        <small>
          {o.courier_returned_at ? `Back with you ${fmtDate(o.courier_returned_at, false)}` : "Returned"}
          {o.tracking_number ? ` · ${o.courier || "Courier"} ${o.tracking_number}` : ""}
        </small>
      </div>
      <span className="adm-num">{money(o.courier_amount ?? o.total)}</span>
    </div>
  );
}

function Articles({ items }) {
  return (
    <ul className="adm-items adm-return-items" aria-label="Articles in this parcel">
      {items.map((i) => (
        <li key={i.id}>
          <div className="adm-thumb">{i.image && <img src={thumb(i.image)} alt="" />}</div>
          <div className="adm-items-info">
            {i.title}
            <small>
              Size {i.size}
              {!i.variant_id && " · no longer in your products, so it can't be restocked"}
            </small>
          </div>
          <span className="adm-num">× {i.quantity}</span>
        </li>
      ))}
    </ul>
  );
}

// "Received — put back in stock" / "Received — don't restock", with an
// optional note. Also on the order page of a returned order.
export function ReceiveReturn({ order: o, onDone }) {
  const { refreshStats } = useFeed();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const units = (o.order_items || []).reduce((n, i) => n + i.quantity, 0);

  async function receive(restock) {
    setBusy(true);
    try {
      await api.receiveReturn(o.id, restock, note);
      toast(
        restock
          ? `#${o.order_number}: ${units} ${units === 1 ? "article" : "articles"} back in stock`
          : `#${o.order_number}: checked, not restocked`
      );
      refreshStats();
      await onDone?.();
    } catch (err) {
      toast(err.message || "Something went wrong.", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-return-actions">
      <input
        className="adm-input"
        placeholder="Anything missing or damaged?"
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
      />
      <div className="adm-btns">
        <button type="button" className="adm-btn primary" disabled={busy} onClick={() => receive(true)}>
          {busy ? "Saving…" : "Received — put back in stock"}
        </button>
        <ConfirmButton
          className="adm-btn"
          disabled={busy}
          confirmLabel="Yes, don't restock"
          onConfirm={() => receive(false)}
        >
          Received — don&apos;t restock
        </ConfirmButton>
      </div>
    </div>
  );
}
