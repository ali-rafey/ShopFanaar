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

const PRODUCT_STATUS = { active: "Active", draft: "Draft", archived: "Archived" };
export function ProductStatusBadge({ status }) {
  return <span className={`adm-badge ps-${status}`}>{PRODUCT_STATUS[status]}</span>;
}

// -------------------------------------------------------------------- bits

export function PageHead({ title, sub, actions, back }) {
  return (
    <header className="adm-pagehead">
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
