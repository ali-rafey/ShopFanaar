import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useFeed } from "../AdminApp";
import * as api from "../api";
import { ALL_STATUSES, STATUS } from "../../lib/orderStatus";
import { ErrorBox, fmtDate, fmtPhone, money, PageHead, PayBadge, Spinner, StatusBadge, useLoad } from "../ui";

const PAGE = 50;

export default function Orders() {
  const { stats, version } = useFeed();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const [search, setSearch] = useState(q);
  const [limit, setLimit] = useState(PAGE);

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

  useEffect(() => setLimit(PAGE), [status, q]);

  const list = useLoad(() => api.listOrders({ status, search: q, limit }), [status, q, limit, version]);
  const by = stats?.by_status || {};
  const total = Object.values(by).reduce((n, x) => n + x, 0);

  const setStatus = (s) => {
    const next = new URLSearchParams(params);
    if (s) next.set("status", s);
    else next.delete("status");
    setParams(next);
  };

  const rows = list.data?.rows || [];

  return (
    <>
      <PageHead title="Orders" sub={`${total} orders in total`} />

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
      </div>

      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.data === undefined ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="adm-empty">
          {q || status ? "No orders match this filter." : "No orders yet. They'll show up here the moment someone checks out."}
        </p>
      ) : (
        <div className="adm-card flush">
          <table className="adm-table adm-orders">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Customer</th>
                <th>City</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} onClick={() => navigate(`/admin/orders/${o.id}`)}>
                  <td data-label="Order">
                    <Link to={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>
                      <strong>#{o.order_number}</strong>
                    </Link>
                  </td>
                  <td data-label="Date" className="muted">{fmtDate(o.created_at)}</td>
                  <td data-label="Customer">
                    {o.customer_name}
                    <small className="muted block">{fmtPhone(o.phone)}</small>
                  </td>
                  <td data-label="City">{o.city}</td>
                  <td data-label="Items" className="num">
                    {o.order_items.reduce((n, i) => n + i.quantity, 0)}
                  </td>
                  <td data-label="Total" className="num">{money(o.total)}</td>
                  <td data-label="Payment"><PayBadge status={o.payment_status} /></td>
                  <td data-label="Status"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.data && list.data.count > rows.length && (
        <div className="adm-more">
          <button className="adm-btn" onClick={() => setLimit((l) => l + PAGE)} disabled={list.loading}>
            {list.loading ? "Loading…" : `Show more (${list.data.count - rows.length} more)`}
          </button>
        </div>
      )}
    </>
  );
}
