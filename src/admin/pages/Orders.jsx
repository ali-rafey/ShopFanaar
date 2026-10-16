import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { ADMIN_STATUSES, ALL_STATUSES, STATUS } from "../../lib/orderStatus";
import { BookingSheet, openPdf } from "../PostEx";
import {
  ActionSheet, CourierStatus, ErrorBox, fmtDate, fmtPhone, money, PageHead, PayBadge, SourceTag, Spinner, SuspectTag,
  StatusBadge, timeAgo, useLoad, useToast,
} from "../ui";

const PAGE = 50;
const SYNC_KEY = "fanaar-postex-synced";
const AUTO_SYNC_MS = 10 * 60e3;
const PDF_MAX = 10;
// Statuses that put items back in stock — always confirmed first.
const RESTOCKS = new Set(["cancelled", "returned"]);
// Booked with PostEx: from here on the status comes from PostEx.
const withPostEx = (o) => Boolean(o.tracking_number);

// Phones: one list, newest first, with iOS patterns — Select / Done in the
// bar, pull down to refresh, a toolbar and action sheets while selecting.
// Computers: the table, with checkboxes, a status picker per row and the
// dark selection bar.
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
  const [confirm, setConfirm] = useState(null); // computer: { ids, status } awaiting "yes"
  const [sheet, setSheet] = useState(null); // phone: "status" | "print" | { restock: status }
  const [working, setWorking] = useState(null); // label while a bulk action runs
  const [booking, setBooking] = useState(null); // { ids, auto } for the PostEx sheet
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

  // While selecting on a phone the toolbar takes the tab bar's place.
  useEffect(() => {
    document.documentElement.classList.toggle("adm-selecting", selecting);
    return () => document.documentElement.classList.remove("adm-selecting");
  }, [selecting]);

  const list = useLoad(() => api.listOrders({ status, search: q, limit }), [status, q, limit, version]);
  const by = stats?.by_status || {};
  // "All" counts everything except cancelled orders, matching the list.
  const total = Object.entries(by).reduce((n, [s, x]) => (s === "cancelled" ? n : n + x), 0);
  const rows = useMemo(() => list.data?.rows || [], [list.data]);
  const chosen = rows.filter((o) => selected.has(o.id));
  const bookedChosen = chosen.filter((o) => o.courier === "PostEx" && o.tracking_number);

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
    setSheet(null);
  };

  const refresh = useCallback(() => {
    list.reload();
    refreshStats();
  }, [list, refreshStats]);

  // ---------------------------------------------------------- status change
  // The admin sets Pending, Confirmed or Cancelled. Confirming books the
  // orders with PostEx straight away; cancelling a booked parcel cancels it at
  // PostEx too (only possible before pickup). Everything else comes from PostEx.
  async function applyStatus(ids, next) {
    setConfirm(null);
    setSheet(null);
    setWorking(`Updating ${ids.length} ${ids.length === 1 ? "order" : "orders"}…`);
    const failed = [];
    const changed = [];
    for (const id of ids) {
      const o = rows.find((x) => x.id === id);
      if (!o || o.status === next) continue;
      try {
        if (withPostEx(o)) {
          if (next !== "cancelled" || o.status !== "packed") {
            throw new Error(
              o.status === "packed"
                ? "it's booked with PostEx — its status now comes from PostEx"
                : "it's already with PostEx, so it can't be changed here"
            );
          }
          await api.postexCancel(id); // not picked up yet: cancel the booking first
        }
        await api.setOrderStatus(id, next, ids.length > 1 ? "Changed in bulk" : null);
        changed.push(o);
      } catch (err) {
        failed.push(`#${o.order_number}: ${err.message}`);
      }
    }
    setWorking(null);
    if (failed.length) toast(`${changed.length} updated · ${failed.join(" · ")}`, "err");
    else if (changed.length) toast(`${changed.length} ${changed.length === 1 ? "order" : "orders"} marked ${STATUS[next].label.toLowerCase()}`);
    if (selecting) clearSelection();
    else if (ids.length > 1) setSelected(new Set());
    refresh();
    if (next === "confirmed" && changed.length) setBooking({ ids: changed.map((o) => o.id), auto: true });
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

  const pull = usePullToRefresh(async () => {
    await Promise.all([list.reload(), runSync(true)]);
    refreshStats();
  });

  async function pdf(kind) {
    setSheet(null);
    if (!bookedChosen.length) return toast("None of the selected orders is booked with PostEx yet.", "err");
    const max = kind === "awb" ? PDF_MAX : 50;
    if (bookedChosen.length > max) return toast(`Select at most ${max} booked orders at a time.`, "err");
    try {
      await openPdf(
        () => api.postexPdf(kind, bookedChosen.map((o) => o.id)),
        kind === "awb" ? "postex-airway-bills" : "postex-load-sheet"
      );
    } catch (err) {
      toast(err.message, "err");
    }
  }

  const ids = chosen.map((o) => o.id);
  const what = ids.length === 1 ? `#${chosen[0].order_number}` : `${ids.length} orders`;
  const title = selecting ? (chosen.length ? `${chosen.length} Selected` : "Select Orders") : "Orders";

  return (
    <>
      <div ref={pull.indicator} className={`adm-ptr ${pull.refreshing ? "is-refreshing" : ""}`} aria-hidden="true">
        <SyncIcon />
      </div>

      <PageHead
        title={title}
        sub={`${total} orders in total`}
        actions={
          <>
            <button className="adm-btn adm-only-desktop" onClick={() => runSync(false)} disabled={sync.busy}>
              {sync.busy ? "Syncing…" : "Sync PostEx"}
              {sync.at && !sync.busy && <small className="adm-btn-note">{timeAgo(new Date(sync.at).toISOString())}</small>}
            </button>
            {!selecting && (
              <button
                className={`adm-navbtn adm-only-mobile-inline ${sync.busy ? "is-busy" : ""}`}
                onClick={() => runSync(false)}
                disabled={sync.busy}
                aria-label="Sync with PostEx"
              >
                <SyncIcon />
              </button>
            )}
            {rows.length > 0 && (
              <button
                className="adm-navbtn adm-only-mobile-inline"
                onClick={() => (selecting ? clearSelection() : setSelecting(true))}
              >
                {selecting ? "Done" : "Select"}
              </button>
            )}
          </>
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
        {(status === "confirmed" || status === "packed") && rows.some((o) => !o.tracking_number) && !selecting && (
          <button
            className="adm-btn primary"
            onClick={() => setBooking({ ids: rows.filter((o) => !o.tracking_number).map((o) => o.id) })}
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
          {/* ---------------- phone: one list, newest first */}
          <div className="adm-only-mobile adm-phone-list">
            {selecting && (
              <button className="adm-select-all" onClick={toggleAll}>
                {allOnPage ? "Deselect All" : `Select All ${rows.length}`}
              </button>
            )}
            <ul className="adm-cells">
              {rows.map((o) => (
                <OrderCell
                  key={o.id}
                  order={o}
                  selecting={selecting}
                  selected={selected.has(o.id)}
                  onToggle={() => toggle(o.id)}
                />
              ))}
            </ul>
            {sync.at && (
              <p className="adm-list-foot">
                PostEx checked {timeAgo(new Date(sync.at).toISOString())} · pull down to refresh
              </p>
            )}
          </div>

          {/* ---------------- computer: the table */}
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
                  <th>Tracking</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className={selected.has(o.id) ? "is-selected" : ""} onClick={() => navigate(`/admin/orders/${o.id}`)}>
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
                      <SourceTag source={o.source} /> <SuspectTag order={o} />
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
                      {withPostEx(o) ? (
                        <CourierStatus courier={o.courier} status={o.courier_status} />
                      ) : (
                        <StatusSelect
                          status={o.status}
                          disabled={Boolean(working)}
                          onChange={(next) => requestStatus([o.id], next)}
                          label={`Status of order ${o.order_number}`}
                        />
                      )}
                    </td>
                    <td data-label="Tracking" className="adm-courier-cell">
                      {o.tracking_number || <span className="muted">—</span>}
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

      {/* ---------------- computer: dark selection bar */}
      {(chosen.length > 0 || confirm) && <div className="adm-bulk-spacer adm-only-desktop" aria-hidden="true" />}
      <div
        className={`adm-bulkbar adm-only-desktop ${chosen.length || confirm ? "show" : ""}`}
        role="region"
        aria-label="Selected orders"
      >
        {confirm ? (
          <>
            <span>
              Mark{" "}
              {confirm.ids.length === 1
                ? `#${rows.find((o) => o.id === confirm.ids[0])?.order_number}`
                : `${confirm.ids.length} orders`}{" "}
              {STATUS[confirm.status].label.toLowerCase()}?
              <small>
                Items go back in stock
                {rows.some((o) => confirm.ids.includes(o.id) && withPostEx(o)) ? "; booked parcels are cancelled at PostEx" : ""}.
              </small>
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
                onChange={(next) => requestStatus(ids, next)}
                label="Set status of the selected orders"
              />
              <button className="adm-btn primary" onClick={() => setBooking({ ids })}>
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

      {/* ---------------- phone: toolbar + action sheets while selecting */}
      {selecting && (
        <>
          <div className="adm-selbar-spacer adm-only-mobile" aria-hidden="true" />
          <div className="adm-selbar adm-only-mobile" role="toolbar" aria-label="Selected orders">
            {working ? (
              <span className="adm-selbar-note">{working}</span>
            ) : (
              <>
                <button disabled={!chosen.length} onClick={() => setSheet("status")}>
                  Status
                </button>
                <button disabled={!chosen.length} onClick={() => setBooking({ ids })}>
                  Book PostEx
                </button>
                <button disabled={!bookedChosen.length} onClick={() => setSheet("print")}>
                  Print
                </button>
              </>
            )}
          </div>
        </>
      )}

      {sheet === "status" && (
        <ActionSheet
          title={`Change status of ${what}`}
          message="After confirming, the status comes from PostEx."
          onClose={() => setSheet(null)}
          actions={ADMIN_STATUSES.map((s) => ({
            label:
              s === "confirmed"
                ? "Confirm & book with PostEx"
                : s === "cancelled"
                  ? ids.length === 1 ? "Cancel order" : "Cancel orders"
                  : `Back to ${STATUS[s].label.toLowerCase()}`,
            dot: `s-${s}`,
            destructive: RESTOCKS.has(s),
            onClick: () => (RESTOCKS.has(s) ? setSheet({ restock: s }) : applyStatus(ids, s)),
          }))}
        />
      )}
      {sheet?.restock && (
        <ActionSheet
          title={`Mark ${what} ${STATUS[sheet.restock].label.toLowerCase()}?`}
          message={
            chosen.some(withPostEx)
              ? "Their items go back in stock, and parcels not yet picked up are cancelled at PostEx."
              : "Their items go back in stock."
          }
          onClose={() => setSheet(null)}
          actions={[
            {
              label: `Mark ${STATUS[sheet.restock].label.toLowerCase()}`,
              destructive: true,
              onClick: () => applyStatus(ids, sheet.restock),
            },
          ]}
        />
      )}
      {sheet === "print" && (
        <ActionSheet
          title={`Print for ${bookedChosen.length} PostEx ${bookedChosen.length === 1 ? "parcel" : "parcels"}`}
          onClose={() => setSheet(null)}
          actions={[
            { label: "Airway bills", onClick: () => pdf("awb") },
            { label: "Load sheet", onClick: () => pdf("loadsheet") },
          ]}
        />
      )}

      {booking && (
        <BookingSheet
          ids={booking.ids}
          autoBook={booking.auto}
          onClose={() => setBooking(null)}
          onBooked={() => {
            clearSelection();
            refresh();
          }}
        />
      )}
    </>
  );
}

function OrderCell({ order: o, selecting, selected, onToggle }) {
  const units = o.order_items.reduce((n, i) => n + i.quantity, 0);
  const body = (
    <>
      {selecting && <span className={`adm-tick ${selected ? "on" : ""}`} aria-hidden="true" />}
      <span className="adm-cell-main">
        <span className="adm-cell-title">
          <strong>#{o.order_number}</strong> {o.customer_name}
        </span>
        <span className="adm-cell-sub">
          {o.city} · {units} {units === 1 ? "item" : "items"} · {timeAgo(o.created_at)}
        </span>
        <span className="adm-cell-tags">
          {withPostEx(o) ? <CourierStatus courier={o.courier} status={o.courier_status} /> : <StatusBadge status={o.status} />}
          <SourceTag source={o.source} />
          <SuspectTag order={o} />
        </span>
      </span>
      <span className="adm-cell-side">
        <span className="adm-cell-amount">{money(o.total)}</span>
      </span>
      {!selecting && <span className="adm-chevron" aria-hidden="true" />}
    </>
  );
  return (
    <li className={selected ? "is-selected" : ""}>
      {selecting ? (
        <button className="adm-cell" onClick={onToggle} aria-pressed={selected}>
          {body}
        </button>
      ) : (
        <Link to={`/admin/orders/${o.id}`} className="adm-cell">
          {body}
        </Link>
      )}
    </li>
  );
}

// Pull the list down from the top to refresh (phones). The indicator is moved
// directly rather than through state, so dragging doesn't re-render the list.
function usePullToRefresh(onRefresh) {
  const indicator = useRef(null);
  const latest = useRef(onRefresh);
  latest.current = onRefresh;
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!("ontouchstart" in window) || !window.matchMedia("(max-width: 860px)").matches) return undefined;
    const TRIGGER = 64;
    let startY = null;
    let pulled = 0;
    const show = (px) => {
      const el = indicator.current;
      if (!el) return;
      el.style.transform = `translate(-50%, ${px - 44}px)`;
      el.style.opacity = String(Math.min(1, px / TRIGGER));
      el.firstChild.style.transform = `rotate(${px * 4}deg)`;
    };
    const start = (e) => {
      startY = window.scrollY <= 0 && e.touches.length === 1 && !document.querySelector(".adm-sheet-open") ? e.touches[0].clientY : null;
      pulled = 0;
    };
    const move = (e) => {
      if (startY == null) return;
      if (window.scrollY > 0) {
        startY = null;
        show(0);
        return;
      }
      pulled = Math.min(96, Math.max(0, (e.touches[0].clientY - startY) * 0.5));
      show(pulled);
    };
    const end = async () => {
      if (startY == null) return;
      const go = pulled >= TRIGGER;
      startY = null;
      pulled = 0;
      show(0);
      if (!go) return;
      if (navigator.vibrate) navigator.vibrate(10);
      setRefreshing(true);
      try {
        await latest.current();
      } finally {
        setRefreshing(false);
      }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  return { indicator, refreshing };
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M20 11a8 8 0 0 0-14.3-4.9M4 5v4h4M4 13a8 8 0 0 0 14.3 4.9M20 19v-4h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function readSyncedAt() {
  try {
    return Number(localStorage.getItem(SYNC_KEY)) || null;
  } catch {
    return null;
  }
}

// A status picker that looks like the status badge (computers). Offers the
// admin's own statuses; choosing Confirmed books the order with PostEx.
function StatusSelect({ status, onChange, disabled, label, placeholder }) {
  const options = status && !ADMIN_STATUSES.includes(status) ? [status, ...ADMIN_STATUSES] : ADMIN_STATUSES;
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
      {options.map((s) => (
        <option key={s} value={s} disabled={!ADMIN_STATUSES.includes(s)}>
          {s === "confirmed" && status !== "confirmed" ? "Confirm & book" : STATUS[s].label}
        </option>
      ))}
    </select>
  );
}
