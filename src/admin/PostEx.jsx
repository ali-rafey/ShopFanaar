import { useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { STATUS } from "../lib/orderStatus";
import { canonicalCity, cityIndex, resolveCity } from "../lib/courierCity";
import { ErrorBox, fmtPhone, money, Spinner, useLoad, useToast } from "./ui";

// Booking orders with PostEx: a review sheet that shows exactly what will be
// sent — the amount PostEx collects, and PostEx's own name for each city —
// then books in batches and reports each order's outcome. api/postex.js
// re-checks everything and never books an order twice.

const BATCH = 10;
const PDF_MAX = 10;
const isMobile = (phone) => /^03[0-9]{9}$/.test(String(phone || "").replace(/[^0-9]/g, "").replace(/^(0092|92)/, "0"));
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// Opens a PDF from PostEx: a new tab on computers, the share/preview sheet in
// the installed phone app. The tab is opened straight away, inside the tap,
// so browsers don't treat it as a pop-up.
export async function openPdf(load, name) {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  const tab = standalone ? null : window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await load());
    if (tab) tab.location.href = url;
    else {
      const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.pdf` });
      document.body.append(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120e3);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

export function Sheet({ title, onClose, children, footer, busy }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("adm-sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("adm-sheet-open");
    };
  }, [onClose, busy]);
  return (
    <div className="adm-sheet-wrap" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="adm-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="adm-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="adm-sheet-x" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="adm-sheet-body">{children}</div>
        {footer && <footer className="adm-sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function BookingSheet({ ids, onClose, onBooked }) {
  const toast = useToast();
  const res = useLoad(() => Promise.all([api.postexSetup(), api.ordersForBooking(ids)]), [ids.join(",")]);
  const [setup, orders] = res.data || [];
  const index = useMemo(() => (setup ? cityIndex(setup.cities) : null), [setup]);
  const [typed, setTyped] = useState({}); // id → city the admin typed or picked
  const [pickup, setPickup] = useState("");
  const [results, setResults] = useState({}); // id → result from api/postex.js
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (setup && !pickup) setPickup((setup.addresses.find((a) => a.isDefault) || setup.addresses[0])?.code || "");
  }, [setup, pickup]);

  const rows = useMemo(() => {
    if (!orders || !index) return [];
    return orders.map((o) => {
      const done = results[o.id];
      const auto = resolveCity(index, o.city, setup.learned);
      const own = typed[o.id];
      const city = own != null ? canonicalCity(index, own) : auto.sure ? auto.city : null;
      let blocked = null;
      if (done?.ok) blocked = null;
      else if (o.tracking_number) blocked = `Already booked · ${o.courier || "courier"} ${o.tracking_number}`;
      else if (o.status === "pending") blocked = "Not confirmed yet — confirm it first.";
      else if (!["confirmed", "packed"].includes(o.status)) blocked = `It's ${STATUS[o.status]?.label.toLowerCase() || o.status}.`;
      else if (!isMobile(o.phone)) blocked = `${o.phone} isn't a mobile number — fix it on the order.`;
      return {
        o,
        auto,
        city,
        own,
        done,
        blocked,
        units: o.order_items.reduce((n, i) => n + i.quantity, 0),
        collect: o.payment_status === "paid" ? 0 : o.total,
      };
    });
  }, [orders, index, setup, typed, results]);

  const todo = rows.filter((r) => !r.blocked && !r.done?.ok);
  const ready = todo.length > 0 && todo.every((r) => r.city);
  const booked = rows.filter((r) => r.done?.ok);
  const collect = todo.reduce((n, r) => n + r.collect, 0);

  async function book() {
    setBusy(true);
    const batches = chunks(todo, BATCH);
    let ok = 0;
    let failed = 0;
    try {
      for (const [i, batch] of batches.entries()) {
        setProgress({ done: i * BATCH, total: todo.length });
        const out = await api.postexBook(
          batch.map((r) => ({ id: r.o.id, ...(r.own != null && r.city ? { city: r.city } : {}) })),
          pickup || undefined
        );
        setResults((prev) => ({ ...prev, ...Object.fromEntries(out.results.map((x) => [x.id, x])) }));
        ok += out.results.filter((x) => x.ok).length;
        failed += out.results.filter((x) => !x.ok).length;
      }
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setBusy(false);
      setProgress(null);
      if (ok) onBooked();
      if (ok || failed) {
        toast(
          failed ? `${ok} booked · ${failed} need attention` : `${ok} ${ok === 1 ? "order" : "orders"} booked with PostEx`,
          failed ? "err" : undefined
        );
      }
    }
  }

  async function airwayBills(list) {
    try {
      await openPdf(() => api.postexPdf("awb", list.map((r) => r.o.id)), "postex-airway-bills");
    } catch (err) {
      toast(err.message, "err");
    }
  }

  const footer = res.data && (
    <>
      {setup.addresses.length > 1 ? (
        <label className="adm-sheet-pickup">
          <span>Pickup from</span>
          <select className="adm-input" value={pickup} onChange={(e) => setPickup(e.target.value)} disabled={busy}>
            {setup.addresses.map((a) => (
              <option key={a.code} value={a.code}>
                {a.city} — {a.address} ({a.code})
              </option>
            ))}
          </select>
        </label>
      ) : (
        setup.addresses[0] && (
          <p className="adm-hint adm-sheet-pickup">
            Pickup from {setup.addresses[0].city} ({setup.addresses[0].code})
          </p>
        )
      )}
      <div className="adm-btns">
        {booked.length > 0 &&
          chunks(booked, PDF_MAX).map((list, i, all) => (
            <button key={i} type="button" className="adm-btn" disabled={busy} onClick={() => airwayBills(list)}>
              Airway bills{all.length > 1 ? ` ${i * PDF_MAX + 1}–${i * PDF_MAX + list.length}` : ""}
            </button>
          ))}
        {todo.length > 0 ? (
          <button type="button" className="adm-btn primary" disabled={!ready || busy} onClick={book}>
            {busy
              ? progress
                ? `Booking ${Math.min(progress.done + BATCH, progress.total)} of ${progress.total}…`
                : "Booking…"
              : `Book ${todo.length} with PostEx · ${money(collect)} COD`}
          </button>
        ) : (
          <button type="button" className="adm-btn primary" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </>
  );

  return (
    <Sheet title="Book with PostEx" onClose={onClose} busy={busy} footer={footer}>
      {res.error ? (
        <ErrorBox error={res.error} onRetry={res.reload} />
      ) : !res.data ? (
        <Spinner label="Checking PostEx…" />
      ) : (
        <>
          {todo.length > 0 && !ready && (
            <p className="adm-callout">Choose the PostEx city for the orders marked below.</p>
          )}
          <datalist id="postex-cities">
            {setup.cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <ul className="adm-book-list">
            {rows.map((r) => (
              <BookingRow key={r.o.id} row={r} busy={busy} setCity={(v) => setTyped((t) => ({ ...t, [r.o.id]: v }))} />
            ))}
          </ul>
          <p className="adm-hint">
            Orders already booked in the PostEx portal are linked, not booked again. Booked orders move to Packed;
            Sync moves them on as PostEx picks them up and delivers.
          </p>
        </>
      )}
    </Sheet>
  );
}

function BookingRow({ row: r, busy, setCity }) {
  const { o, auto, city, own, done, blocked } = r;
  const [editing, setEditing] = useState(false);
  const needsCity = !blocked && !done?.ok && (!city || editing || (own != null && !city));

  return (
    <li className={`adm-book ${blocked ? "is-blocked" : ""} ${done?.ok ? "is-done" : ""} ${done && !done.ok ? "is-failed" : ""}`}>
      <div className="adm-book-top">
        <strong>#{o.order_number}</strong>
        <span className="adm-book-name">{o.customer_name}</span>
        <span className="adm-num">{r.collect ? money(r.collect) : "Paid"}</span>
      </div>
      <p className="adm-book-sub">
        {fmtPhone(o.phone)} · {r.units} {r.units === 1 ? "item" : "items"} · {o.address}, {o.city}
      </p>

      {done?.ok ? (
        <p className="adm-book-ok">
          {done.linked ? "Linked to existing booking" : "Booked"} · <strong>{done.tracking}</strong>
          {done.note && done.linked && <small>{done.note}</small>}
        </p>
      ) : blocked ? (
        <p className="adm-book-why">{blocked}</p>
      ) : (
        <>
          {needsCity ? (
            <div className="adm-book-city">
              <label>
                <span>PostEx city</span>
                <input
                  className={`adm-input ${own != null && own !== "" && !city ? "bad" : ""}`}
                  list="postex-cities"
                  value={own ?? ""}
                  placeholder={`Customer wrote “${o.city}”`}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={busy}
                />
              </label>
              {city && <span className="adm-book-tick">✓ {city}</span>}
              {!city && auto.suggestions.length > 0 && (
                <div className="adm-book-chips">
                  {auto.suggestions.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className="adm-chip"
                      onClick={() => {
                        setCity(s);
                        setEditing(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="adm-book-cityline">
              PostEx city <strong>{city}</strong>
              {own == null && auto.how !== "exact" && <small> (from “{o.city}”)</small>}
              <button type="button" className="adm-link" onClick={() => setEditing(true)} disabled={busy}>
                Change
              </button>
            </p>
          )}
          {done?.error && <p className="adm-book-why">{done.error}</p>}
        </>
      )}
    </li>
  );
}
