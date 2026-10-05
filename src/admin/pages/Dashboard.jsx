import { Link } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { compactMoney, money, PageHead, StatusBadge, timeAgo, useLoad, ErrorBox, Spinner } from "../ui";

export default function Dashboard() {
  const { stats, version } = useFeed();
  const toDo = useLoad(
    () => Promise.all(["pending", "confirmed", "packed"].map((status) => api.listOrders({ status, limit: 8 }))),
    [version]
  );

  if (!stats) return <Spinner />;
  const by = stats.by_status || {};
  const open = toDo.data
    ? toDo.data.flatMap((r) => r.rows).sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <>
      <PageHead title="Overview" sub="What needs doing today, and how the store is selling." />

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
