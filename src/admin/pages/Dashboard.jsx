import { Link } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { useEffect, useState } from "react";
import { compactMoney, money, PageHead, StatusBadge, timeAgo, useLoad, ErrorBox, Spinner } from "../ui";
import { currentSubscription, pushEnvironment } from "../push";
import LiveGlobe from "../LiveGlobe";

export default function Dashboard() {
  const { stats, version } = useFeed();
  const toDo = useLoad(
    () => Promise.all(["pending", "confirmed", "packed"].map((status) => api.listOrders({ status, limit: 8 }))),
    [version]
  );

  // Nudge towards phone notifications until this device has them.
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    const env = pushEnvironment();
    if (api.BACKEND !== "supabase" || !(env.supported || env.needsInstall)) return;
    currentSubscription().then((s) => setNudge(!s), () => {});
  }, []);

  if (!stats) return <Spinner />;
  const by = stats.by_status || {};
  const open = toDo.data
    ? toDo.data.flatMap((r) => r.rows).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <>
      <PageHead title="Overview" sub="What needs doing today, and how the store is selling." />

      {nudge && (
        <Link to="/admin/settings#notifications" className="adm-nudge">
          <img src="/icons/app-192.png" alt="" />
          <span>
            <strong>Get a notification for every order</strong>
            Turn on order notifications for this phone or computer.
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <section className="adm-tiles" aria-label="Key numbers">
        <Tile label="Orders to confirm" value={by.pending || 0} to="/admin/orders?status=pending" />
        <Tile
          label="Ready to ship"
          value={(by.confirmed || 0) + (by.packed || 0)}
          note="Confirmed + packed"
          to="/admin/orders?status=confirmed"
        />
        <Tile label="Orders today" value={stats.orders_today} note={`${compactMoney(stats.revenue_today)} in sales`} />
        <Tile
          label="Sales, last 30 days"
          value={compactMoney(stats.revenue_30d)}
          note={`${stats.orders_30d} ${stats.orders_30d === 1 ? "order" : "orders"} · excl. cancelled & returned`}
        />
      </section>

      <LiveView />

      <div className="adm-cols">
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>To process</h2>
            <Link to="/admin/orders" className="adm-link">
              All orders
            </Link>
          </div>
          <ErrorBox error={toDo.error} onRetry={toDo.reload} />
          {toDo.data && open.length === 0 && (
            <p className="adm-empty">Nothing waiting. New orders will appear here instantly.</p>
          )}
          <ul className="adm-list">
            {open.slice(0, 10).map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`} className="adm-list-row">
                  <span className="adm-list-main">
                    <strong>#{o.order_number}</strong> {o.customer_name}
                    <small>
                      {o.city} · {timeAgo(o.created_at)}
                    </small>
                  </span>
                  <span className="adm-num">{money(o.total)}</span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Low stock</h2>
            <Link to="/admin/products" className="adm-link">
              Products
            </Link>
          </div>
          {stats.low_stock.length === 0 ? (
            <p className="adm-empty">Every active size has more than 3 in stock.</p>
          ) : (
            <ul className="adm-list">
              {stats.low_stock.map((v) => (
                <li key={`${v.id}-${v.size}`}>
                  <Link to={`/admin/products/${v.id}`} className="adm-list-row">
                    <span className="adm-list-main">
                      {v.title}
                      <small>Size {v.size}</small>
                    </span>
                    <span className={`adm-stock ${v.stock === 0 ? "out" : "low"}`}>
                      {v.stock === 0 ? "Sold out" : `${v.stock} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------- live view
// Fanaar's own visitor count (lib/visitors.js → live_visitors), separate from
// the Meta Pixel / Conversions API. Refreshes every 10 s while on screen.

const LIVE_REFRESH_MS = 10_000;

function useLiveVisitors() {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    // The first load always runs; refreshes skip while the admin is hidden.
    const load = async (first) => {
      if (first !== true && document.visibilityState !== "visible") return;
      try {
        const data = await api.getLiveVisitors();
        if (alive) setState({ data, error: null });
      } catch (error) {
        if (alive) setState((s) => ({ ...s, error }));
      }
    };
    load(true);
    const timer = setInterval(load, LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return state;
}

const PAGE_NAMES = {
  "/": "Home",
  "/checkout": "Checkout",
  "/order": "Order confirmation",
  "/about": "About",
  "/saved": "Saved pieces",
  "/pages/contact": "Contact",
};
const tidy = (handle) => handle.charAt(0).toUpperCase() + handle.slice(1).replace(/-/g, " ");

const regionNames =
  typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
function countryName(code) {
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}
const flag = (code) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
const placeName = (p) => p.city || countryName(p.country);

function pageName({ path, title }) {
  if (title) return title;
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const [, kind, handle] = path.split("/");
  if (kind === "products" && handle) return tidy(handle);
  if (kind === "collections" && handle) return `Collection · ${tidy(handle)}`;
  if (kind === "policies") return "Policies";
  return path;
}

function LiveView() {
  const { data, error } = useLiveVisitors();

  if (!data) {
    return (
      <section className="adm-card adm-live">
        <LiveHead />
        {error ? <ErrorBox error={error} /> : <p className="adm-empty">Loading…</p>}
      </section>
    );
  }

  const browsing = Math.max(0, data.now - data.with_cart - data.checking_out - data.ordered);
  const places = data.places || [];
  const unplaced = data.now - places.reduce((n, p) => n + p.n, 0);
  const dots = places.filter((p) => p.lat != null && p.lng != null);
  // One globe label per country, on its busiest city: cities within a country
  // sit too close together at globe scale to label one by one.
  const labels = Object.values(
    dots.reduce((m, p, i) => {
      const g = (m[p.country] ||= { dot: i, place: p, n: 0, cities: 0 });
      g.n += p.n;
      g.cities += 1;
      return m;
    }, {})
  )
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((g) => ({
      dot: g.dot,
      text: `${g.cities > 1 ? countryName(g.place.country) : placeName(g.place)} · ${g.n}`,
    }));
  const d = data.devices || {};
  const devices = [
    d.mobile && `${d.mobile} on phones`,
    d.desktop && `${d.desktop} on computers`,
    d.tablet && `${d.tablet} on tablets`,
  ].filter(Boolean);

  return (
    <section className="adm-card adm-live" aria-label="Live view">
      <LiveHead />
      <div className="adm-live-top">
        <div>
          <div className="adm-live-now">
            <strong>{data.now}</strong>
            <span>
              {data.now === 1 ? "visitor" : "visitors"} right now
              <small>
                {data.last_30m} in the last 30 min · {data.today} today
              </small>
            </span>
          </div>

          <ul className="adm-live-stages" aria-label="What they're doing">
            <li>
              <strong>{browsing}</strong>
              <span>Browsing</span>
            </li>
            <li>
              <strong>{data.with_cart}</strong>
              <span>Items in cart</span>
            </li>
            <li>
              <strong>{data.checking_out}</strong>
              <span>Checking out</span>
            </li>
            <li>
              <strong>{data.ordered}</strong>
              <span>Just ordered</span>
            </li>
          </ul>
        </div>
        <LiveGlobe dots={dots} labels={labels} />
      </div>

      {data.now > 0 ? (
        <>
          <div className="adm-live-lists">
            <Bars
              title="Viewing now"
              total={data.now}
              rows={data.pages.map((p) => ({
                key: p.path,
                label: pageName(p),
                n: p.n,
              }))}
            />
            <Bars
              title="Came from"
              total={data.now}
              rows={data.sources.map((s) => ({
                key: s.source,
                label: s.source,
                n: s.n,
              }))}
            />
            <Bars
              title="Where they are"
              total={data.now}
              rows={[
                ...places.slice(0, 8).map((p) => ({
                  key: `${p.country}|${p.city}`,
                  label: `${flag(p.country)} ${placeName(p)}`,
                  title: p.city ? `${p.city}, ${countryName(p.country)}` : countryName(p.country),
                  n: p.n,
                })),
                ...(unplaced > 0 ? [{ key: "unknown", label: "Location unknown", n: unplaced }] : []),
              ]}
            />
          </div>
          {devices.length > 0 && <p className="adm-hint adm-live-devices">{devices.join(" · ")}</p>}
        </>
      ) : (
        <p className="adm-hint">Nobody on the store this minute. Visitors appear here within seconds.</p>
      )}
    </section>
  );
}

function LiveHead() {
  return (
    <div className="adm-card-head">
      <h2>Live view</h2>
      <span className="adm-live-badge">
        <span className="adm-live-dot" aria-hidden="true" />
        Live
      </span>
    </div>
  );
}

function Bars({ title, rows, total }) {
  return (
    <div>
      <h3 className="adm-live-sub">{title}</h3>
      <ul className="adm-bars">
        {rows.map((r) => (
          <li key={r.key} className="adm-bar" style={{ "--w": `${Math.round((r.n / total) * 100)}%` }}>
            <span title={r.title}>{r.label}</span>
            <b>{r.n}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ label, value, note, to }) {
  const body = (
    <>
      <span className="adm-tile-label">{label}</span>
      <span className="adm-tile-value">{value}</span>
      {note && <span className="adm-tile-note">{note}</span>}
    </>
  );
  return to ? (
    <Link to={to} className="adm-tile is-link">
      {body}
    </Link>
  ) : (
    <div className="adm-tile">{body}</div>
  );
}
