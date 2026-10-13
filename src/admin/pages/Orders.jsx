import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { ALL_STATUSES, STATUS } from "../../lib/orderStatus";
import { BookingSheet, openPdf } from "../PostEx";
import { ErrorBox, fmtDate, fmtPhone, money, PageHead, PayBadge, Spinner, StatusBadge, timeAgo, useLoad, useToast } from "../ui";

const PAGE = 50;
const SYNC_KEY = "fanaar-postex-synced";
const AUTO_SYNC_MS = 10 * 60e3;
const PDF_MAX = 10;
// Statuses that put items back in stock — always confirmed first.
const RESTOCKS = new Set(["cancelled", "returned"]);

export default function Orders() {
  const { stats, version, refreshStats } = useFeed();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const [search, setSearch] = useState(q);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false); // phone: tap to select instead of open
  const [confirm, setConfirm] = useState(null); // { ids, status } awaiting "yes"
  const [working, setWorking] = useState(null); // label while a bulk action runs
  const [booking, setBooking] = useState(null); // order ids in the PostEx sheet
  const [sync, setSync] = useState({ busy: false, at: readSyncedAt(), attention: [] });

  // Debounce the search box into the URL (so Back keeps the filter).
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) {
        const next = new URLSearchParams(params);
        if (search) next.set("q", search);
        else next.delete("q");
        setParams(next, { replace: true });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, params, setParams]);

  useEffect(() => {
    setLimit(PAGE);
    setSelected(new Set());
  }, [status, q]);

  const list = useLoad(() => api.listOrders({ status, search: q, limit }), [status, q, limit, version]);
  const by = stats?.by_status || {};
  const total = Object.values(by).reduce((n, x) => n + x, 0);
  const rows = useMemo(() => list.data?.rows || [], [list.data]);
  const chosen = rows.filter((o) => selected.has(o.id));

  const setStatus = (s) => {
    const next = new URLSearchParams(params);
    if (s) next.set("status", s);
    else next.delete("status");
    setParams(next);
  };
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOnPage = rows.length > 0 && rows.every((o) => selected.has(o.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((o) => o.id)));
  const clearSelection = () => {
    setSelected(new Set());
    setSelecting(false);
    setConfirm(null);
  };

  const refresh = useCallback(() => {
    list.reload();
    refreshStats();
  }, [list, refreshStats]);

  // ---------------------------------------------------------- status change
  async function applyStatus(ids, next) {
    setConfirm(null);
    setWorking(`Updating ${ids.length} ${ids.length === 1 ? "order" : "orders"}…`);
    const failed = [];
    for (const id of ids) {
      const o = rows.find((x) => x.id === id);
      if (!o || o.status === next) continue;
      try {
        await api.setOrderStatus(id, next, ids.length > 1 ? "Changed in bulk" : null);
      } catch (err) {
        failed.push(`#${o.order_number}: ${err.message}`);
      }
    }
    setWorking(null);
    const done = ids.length - failed.length;
    if (failed.length) toast(`${done} updated · ${failed.join(" · ")}`, "err");
    else toast(`${done} ${done === 1 ? "order" : "orders"} marked ${STATUS[next].label.toLowerCase()}`);
    if (ids.length > 1) setSelected(new Set());
    refresh();
  }
  const requestStatus = (ids, next) => {
    if (!next || !ids.length) return;
    if (RESTOCKS.has(next)) setConfirm({ ids, status: next });
    else applyStatus(ids, next);
  };

  // ------------------------------------------------------------------ PostEx
  const runSync = useCallback(
    async (quiet) => {
      setSync((s) => ({ ...s, busy: true }));
      try {
        const out = await api.postexSync();
        const at = Date.now();
        try {
          localStorage.setItem(SYNC_KEY, String(at));
        } catch {
          /* fine */
        }
        setSync({ busy: false, at, attention: out.attention });
        const bits = [
          out.linked.length && `${out.linked.length} linked`,
          out.moved.length && `${out.moved.length} updated`,
          out.attention.length && `${out.attention.length} need a look`,
        ].filter(Boolean);
        if (bits.length || !quiet) toast(`PostEx: ${bits.length ? bits.join(" · ") : "everything up to date"}`);
        if (out.linked.length || out.moved.length) refresh();
      } catch (err) {
        setSync((s) => ({ ...s, busy: false }));
        if (!quiet) toast(err.message, "err");
      }
    },
    [toast, refresh]
  );

  // Catch up with PostEx when the orders open, at most every ten minutes.
  useEffect(() => {
    if (api.BACKEND === "supabase" && Date.now() - (readSyncedAt() || 0) > AUTO_SYNC_MS) runSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bookedChosen = chosen.filter((o) => o.courier === "PostEx" && o.tracking_number);
  async function pdf(kind) {
    if (!bookedChosen.length) return toast("None of the selected orders is booked with PostEx yet.", "err");
    const max = kind === "awb" ? PDF_MAX : 50;
    if (bookedChosen.length > max) return toast(`Select at most ${max} booked orders at a time.`, "err");
    try {
      await openPdf(() => api.postexPdf(kind, bookedChosen.map((o) => o.id)), kind === "awb" ? "postex-airway-bills" : "postex-load-sheet");
    } catch (err) {
      toast(err.message, "err");
    }
  }

  const onRow = (o) => (selecting ? toggle(o.id) : navigate(`/admin/orders/${o.id}`));

  return (
    <>
      <PageHead
        title="Orders"
        sub={`${total} orders in total`}
        actions={
          <button className="adm-btn" onClick={() => runSync(false)} disabled={sync.busy}>
            {sync.busy ? "Syncing…" : "Sync PostEx"}
            {sync.at && !sync.busy && <small className="adm-btn-note">{timeAgo(new Date(sync.at).toISOString())}</small>}
          </button>
        }
      />

      {sync.attention.length > 0 && (
        <section className="adm-card adm-attention" aria-label="PostEx needs a look">
          <div className="adm-card-head">
            <h2>PostEx needs a look</h2>
            <button className="adm-link" onClick={() => setSync((s) => ({ ...s, attention: [] }))}>
              Dismiss
            </button>
          </div>
          <ul>
            {sync.attention.map((a, i) => (
              <li key={i}>
                <Link to={`/admin/orders/${a.id}`}>#{a.order_number}</Link> {a.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="adm-tabs" role="tablist" aria-label="Filter by status">
        <button role="tab" aria-selected={!status} className={!status ? "on" : ""} onClick={() => setStatus("")}>
          All <span>{total}</span>
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            className={status === s ? "on" : ""}
            onClick={() => setStatus(s)}
          >
            {STATUS[s].label} <span>{by[s] || 0}</span>
          </button>
        ))}
      </div>

      <div className="adm-toolbar">
        <input
          type="search"
          className="adm-search"
          placeholder="Search order #, name, phone or city"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search orders"
        />
        {rows.length > 0 && (
          <button
            className={`adm-btn adm-only-mobile-inline ${selecting ? "primary" : ""}`}
            onClick={() => (selecting ? clearSelection() : setSelecting(true))}
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
        {(status === "confirmed" || status === "packed") && rows.some((o) => !o.tracking_number) && (
          <button
            className="adm-btn primary"
            onClick={() => setBooking(rows.filter((o) => !o.tracking_number).map((o) => o.id))}
          >
            Book all with PostEx
          </button>
        )}
      </div>

      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.data === undefined ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="adm-empty">
          {q || status ? "No orders match this filter." : "No orders yet. They'll show up here the moment someone checks out."}
        </p>
      ) : (
        <>
          <ul className={`adm-cells adm-only-mobile ${selecting ? "is-selecting" : ""}`}>
            {selecting && (
              <li>
                <button className="adm-cell adm-cell-all" onClick={toggleAll}>
                  <span className={`adm-tick ${allOnPage ? "on" : ""}`} aria-hidden="true" />
                  {allOnPage ? "Deselect all" : `Select all ${rows.length}`}
                </button>
              </li>
            )}
            {rows.map((o) => {
              const units = o.order_items.reduce((n, i) => n + i.quantity, 0);
              const body = (
                <>
                  {selecting && <span className={`adm-tick ${selected.has(o.id) ? "on" : ""}`} aria-hidden="true" />}
                  <span className="adm-cell-main">
                    <span className="adm-cell-title">
                      <strong>#{o.order_number}</strong> {o.customer_name}
                    </span>
                    <span className="adm-cell-sub">
                      {o.city} · {units} {units === 1 ? "item" : "items"} · {timeAgo(o.created_at)}
                    </span>
                    {o.tracking_number && (
                      <span className="adm-cell-sub adm-courier-line">
                        {o.courier}
                        {o.courier_status ? ` · ${o.courier_status}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="adm-cell-side">
                    <span className="adm-cell-amount">{money(o.total)}</span>
                    <StatusBadge status={o.status} />
                  </span>
                  {!selecting && <span className="adm-chevron" aria-hidden="true" />}
                </>
              );
              return (
                <li key={o.id} className={selected.has(o.id) ? "is-selected" : ""}>
                  {selecting ? (
                    <button className="adm-cell" onClick={() => toggle(o.id)} aria-pressed={selected.has(o.id)}>
                      {body}
                    </button>
                  ) : (
                    <Link to={`/admin/orders/${o.id}`} className="adm-cell">
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="adm-card flush adm-only-desktop adm-scroll-x">
            <table className="adm-table adm-orders">
              <thead>
                <tr>
                  <th className="adm-check-col">
                    <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all orders on this page" />
                  </th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>City</th>
                  <th className="num adm-wide-only">Items</th>
                  <th className="num">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Shipping</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className={selected.has(o.id) ? "is-selected" : ""} onClick={() => onRow(o)}>
                    <td className="adm-check-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                        aria-label={`Select order ${o.order_number}`}
                      />
                    </td>
                    <td data-label="Order">
                      <Link to={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>
                        <strong>#{o.order_number}</strong>
                      </Link>
                      <small className="muted block">{fmtDate(o.created_at)}</small>
                    </td>
                    <td data-label="Customer">
                      {o.customer_name}
                      <small className="muted block">{fmtPhone(o.phone)}</small>
                    </td>
                    <td data-label="City">{o.city}</td>
                    <td data-label="Items" className="num adm-wide-only">
                      {o.order_items.reduce((n, i) => n + i.quantity, 0)}
                    </td>
                    <td data-label="Total" className="num">{money(o.total)}</td>
                    <td data-label="Payment"><PayBadge status={o.payment_status} /></td>
                    <td data-label="Status" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect
                        status={o.status}
                        disabled={Boolean(working)}
                        onChange={(next) => requestStatus([o.id], next)}
                        label={`Status of order ${o.order_number}`}
                      />
                    </td>
                    <td data-label="Shipping" className="adm-courier-cell">
                      {o.tracking_number ? courierLine(o) : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {list.data && list.data.count > rows.length && (
        <div className="adm-more">
          <button className="adm-btn" onClick={() => setLimit((l) => l + PAGE)} disabled={list.loading}>
            {list.loading ? "Loading…" : `Show more (${list.data.count - rows.length} more)`}
          </button>
        </div>
      )}

      {(chosen.length > 0 || confirm) && <div className="adm-bulk-spacer" aria-hidden="true" />}
      <div className={`adm-bulkbar ${chosen.length || confirm ? "show" : ""}`} role="region" aria-label="Selected orders">
        {confirm ? (
          <>
            <span>
              Mark{" "}
              {confirm.ids.length === 1
                ? `#${rows.find((o) => o.id === confirm.ids[0])?.order_number}`
                : `${confirm.ids.length} orders`}{" "}
              {STATUS[confirm.status].label.toLowerCase()}?
              <small>Items go back in stock.</small>
            </span>
            <div className="adm-btns">
              <button className="adm-btn" onClick={() => setConfirm(null)}>
                Keep
              </button>
              <button className="adm-btn danger armed" onClick={() => applyStatus(confirm.ids, confirm.status)}>
                Yes, mark {STATUS[confirm.status].label.toLowerCase()}
              </button>
            </div>
          </>
        ) : working ? (
          <span>{working}</span>
        ) : (
          <>
            <span className="adm-bulk-count">
              {chosen.length} selected
              <button className="adm-link" onClick={clearSelection}>
                Clear
              </button>
            </span>
            <div className="adm-btns">
              <StatusSelect
                placeholder="Set status…"
                onChange={(next) => requestStatus(chosen.map((o) => o.id), next)}
                label="Set status of the selected orders"
              />
              <button className="adm-btn primary" onClick={() => setBooking(chosen.map((o) => o.id))}>
                Book with PostEx
              </button>
              {bookedChosen.length > 0 && (
                <>
                  <button className="adm-btn" onClick={() => pdf("awb")}>
                    Airway bills
                  </button>
                  <button className="adm-btn" onClick={() => pdf("loadsheet")}>
                    Load sheet
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {booking && (
        <BookingSheet
          ids={booking}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setSelected(new Set());
            refresh();
          }}
        />
      )}
    </>
  );
}

function readSyncedAt() {
  try {
    return Number(localStorage.getItem(SYNC_KEY)) || null;
  } catch {
    return null;
  }
}

const courierLine = (o) => (
  <>
    {o.courier} {o.courier_status && <span className="adm-courier-status">{o.courier_status}</span>}
    <small className="muted block">{o.tracking_number}</small>
  </>
);

// A status picker that looks like the status badge.
function StatusSelect({ status, onChange, disabled, label, placeholder }) {
  return (
    <select
      className={`adm-status-select ${status ? `adm-badge s-${status}` : "adm-input"}`}
      value={status || ""}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS[s].label}
        </option>
      ))}
    </select>
  );
}
