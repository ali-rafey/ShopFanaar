import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { STATUS } from "../lib/orderStatus";

export { formatPrice as money } from "../lib/catalog";

// --------------------------------------------------------------- formatting

export function compactMoney(n) {
  const v = Number(n || 0);
  if (v >= 1e7) return `Rs.${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1)}Cr`;
  if (v >= 1e5) return `Rs.${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L`;
  if (v >= 1e4) return `Rs.${(v / 1e3).toFixed(0)}K`;
  return `Rs.${v.toLocaleString("en-PK")}`;
}

export function fmtDate(iso, withTime = true) {
  return new Date(iso).toLocaleString("en-PK", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }),
  });
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso, false);
}

// 03001234567 → 0300 1234567
export const fmtPhone = (p) => (p && p.length === 11 ? `${p.slice(0, 4)} ${p.slice(4)}` : p);

// ------------------------------------------------------------------- badges

export function StatusBadge({ status }) {
  return <span className={`adm-badge s-${status}`}>{STATUS[status]?.label || status}</span>;
}

const PAY = { unpaid: "Unpaid", paid: "Paid", refunded: "Refunded" };
export function PayBadge({ status }) {
  return <span className={`adm-badge p-${status}`}>{PAY[status] || status}</span>;
}

// What a courier's own status means for the admin, by its wording (PostEx
// renames and adds statuses, so this matches patterns rather than a list):
//   delivered — done              attention — attempted, under review, returning
//   moving    — in PostEx's hands   out       — out for delivery today
//   waiting   — booked, not picked up yet     closed — cancelled / expired
export function courierTone(status) {
  const s = String(status || "").toLowerCase();
  if (!s) return "waiting";
  if (/^delivered$/.test(s)) return "delivered";
  if (/attempt|review|return|refused|un-?assigned/.test(s)) return "attention";
  if (/cancel|expire/.test(s)) return "closed";
  if (/out for delivery/.test(s)) return "out";
  if (/^(un)?booked$/.test(s)) return "waiting";
  return "moving";
}

export function CourierStatus({ courier, status }) {
  return (
    <span className={`adm-courier adm-tone-${courierTone(status)}`}>
      {courier}
      {status ? ` · ${status}` : " · Booked"}
    </span>
  );
}

// Where an order came from (orders.source, saved at checkout by
// src/lib/attribution.js), in a few words: "Instagram ad", "Google", "Direct".
const META = new Set(["Instagram", "Facebook", "Threads", "Messenger", "Audience Network", "Facebook / Instagram"]);
export const isMetaPlatform = (platform) => META.has(platform);
export function sourceShort(src) {
  if (!src) return null;
  if (src.kind === "direct" || !src.platform) return "Direct";
  return src.kind === "ad" ? `${src.platform} ad` : src.platform;
}
export function SourceTag({ source }) {
  const short = sourceShort(source);
  if (!short) return null;
  const tone = source.kind === "ad" ? (isMetaPlatform(source.platform) ? "meta" : "ad") : source.kind;
  return <span className={`adm-source adm-source-${tone}`}>{short}</span>;
}

// Flagged by Detection (same connection, different name, phone and address).
export function SuspectTag({ order }) {
  if (!order?.suspected) return null;
  return (
    <span className="adm-flag" title="Same connection as another order with a different name, phone and address — see Detection">
      Possible spam
    </span>
  );
}

const PRODUCT_STATUS = { active: "Active", draft: "Draft", archived: "Archived" };
export function ProductStatusBadge({ status }) {
  return <span className={`adm-badge ps-${status}`}>{PRODUCT_STATUS[status]}</span>;
}

// -------------------------------------------------------------------- bits

export function PageHead({ title, sub, actions, back }) {
  return (
    <header className={`adm-pagehead ${back ? "has-back" : ""}`}>
      <div>
        {back}
        <h1>{title}</h1>
        {sub && <p className="adm-sub">{sub}</p>}
      </div>
      {actions && <div className="adm-pagehead-actions">{actions}</div>}
    </header>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="adm-loading" role="status">
      <span className="adm-spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="adm-error" role="alert">
      {error.message || String(error)}
      {onRetry && (
        <button className="adm-link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// An iOS-style action sheet: a stack of choices rising from the bottom, with
// Cancel set apart. actions: [{ label, onClick, destructive?, dot? }] — dot is
// a badge class (e.g. "s-packed") shown as a coloured dot.
export function ActionSheet({ title, message, actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("adm-sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("adm-sheet-open");
    };
  }, [onClose]);
  return (
    <div className="adm-action-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adm-action" role="dialog" aria-modal="true" aria-label={title || "Actions"}>
        <div className="adm-action-group">
          {(title || message) && (
            <div className="adm-action-head">
              {title && <strong>{title}</strong>}
              {message && <span>{message}</span>}
            </div>
          )}
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`adm-action-btn ${a.destructive ? "is-destructive" : ""}`}
              onClick={a.onClick}
              disabled={a.disabled}
            >
              {a.dot && <span className={`adm-action-dot ${a.dot}`} aria-hidden="true" />}
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" className="adm-action-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// Two-step destructive button — no blocking browser dialogs.
export function ConfirmButton({ children, confirmLabel = "Click again to confirm", onConfirm, className = "adm-btn danger", disabled }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`${className} ${armed ? "armed" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

// Loads data with loading / error state; `reload` refetches without
// blanking what's on screen.
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve()
      .then(fn)
      .then(
        (data) => n === seq.current && setState({ data, error: null, loading: false }),
        (error) => n === seq.current && setState((s) => ({ ...s, error, loading: false }))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

// ------------------------------------------------------------------- toasts

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((message, kind = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="adm-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`adm-toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
