import { Link } from "react-router-dom";
import { compactMoney, fmtDate } from "./ui";

// The steps shoppers took in the last 30 days (api.getShopperFunnel), each as
// a share of every browser seen in that time. Shared by the Overview card and
// the Shoppers page; each step opens the journeys of the browsers behind it.

// "Completed checkout" = pressed Place order; "Purchases" = the website
// orders from that time that weren't cancelled or returned.
const STEPS = [
  { key: "home", label: "Viewed the homepage", to: "/admin/shoppers" },
  { key: "cart", label: "Added to cart", to: "/admin/shoppers?stage=cart" },
  { key: "checkout", label: "Started checkout", to: "/admin/shoppers?stage=checkout" },
  { key: "ordered", label: "Completed checkout", to: "/admin/shoppers?stage=order" },
];

export default function Funnel({ data }) {
  const total = data.visitors || 0;
  const pct = (n) => (total ? `${Math.round((n / total) * 100)}%` : "—");
  const width = (n) => (total ? `${Math.min(100, Math.round((n / total) * 100))}%` : "0%");
  // Steps are only known from the day this was switched on.
  const since = new Date(data.since || 0);
  const counting = data.since && since > Date.now() - data.days * 864e5 ? fmtDate(data.since, false) : null;
  const bought = data.purchases || {};

  return (
    <>
      <p className="adm-funnel-base">
        <strong>{total}</strong> {total === 1 ? "visitor" : "visitors"} in the last {data.days} days
        {counting && <> · steps counted since {counting}</>}
      </p>
      <ol className="adm-funnel">
        {STEPS.map((s) => {
          const n = data[s.key]?.browsers || 0;
          return (
            <li key={s.key} style={{ "--w": width(n) }}>
              <Link to={s.to}>
                <span className="adm-funnel-label">{s.label}</span>
                <b>{n}</b>
                <small>{pct(n)}</small>
              </Link>
            </li>
          );
        })}
        <li style={{ "--w": width(bought.orders || 0) }}>
          <Link to="/admin/orders">
            <span className="adm-funnel-label">
              Purchases
              <small>
                {compactMoney(bought.amount || 0)}
                {bought.cancelled > 0 && ` · ${bought.cancelled} cancelled or returned, not counted`}
              </small>
            </span>
            <b>{bought.orders || 0}</b>
            <small>{pct(bought.orders || 0)}</small>
          </Link>
        </li>
      </ol>
    </>
  );
}
