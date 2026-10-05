import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../api";
import { totalStock } from "../../lib/catalog";
import { ErrorBox, money, PageHead, ProductStatusBadge, Spinner, useLoad } from "../ui";

const FILTERS = [
  ["", "All"],
  ["active", "Active"],
  ["draft", "Draft"],
  ["archived", "Archived"],
];

export default function Products() {
  const navigate = useNavigate();
  const list = useLoad(() => api.listProducts(), []);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const all = list.data || [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(
      (p) =>
        (!status || p.status === status) &&
        (!s || p.title.toLowerCase().includes(s) || p.handle.includes(s))
    );
  }, [all, status, q]);
  const count = (s) => all.filter((p) => !s || p.status === s).length;

  return (
    <>
      <PageHead
        title="Products"
        sub="Edit prices, stock, photos and what shows on the store."
        actions={
          <Link to="/admin/products/new" className="adm-btn primary">
            Add product
          </Link>
        }
      />

      <div className="adm-tabs" role="tablist" aria-label="Filter by status">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={status === key}
            className={status === key ? "on" : ""}
            onClick={() => setStatus(key)}
          >
            {label} <span>{count(key)}</span>
          </button>
        ))}
      </div>
      <div className="adm-toolbar">
        <input
          type="search"
          className="adm-search"
          placeholder="Search products"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search products"
        />
      </div>

      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.data === undefined ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="adm-empty">{all.length ? "No products match." : "No products yet."}</p>
      ) : (
        <div className="adm-card flush">
          <table className="adm-table adm-products">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th className="num">Price</th>
                <th>Stock by size</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const stock = totalStock(p);
                return (
                  <tr key={p.id} onClick={() => navigate(`/admin/products/${p.id}`)}>
                    <td data-label="Product">
                      <Link to={`/admin/products/${p.id}`} className="adm-prod" onClick={(e) => e.stopPropagation()}>
                        <span className="adm-thumb">{p.images[0] && <img src={p.images[0]} alt="" loading="lazy" />}</span>
                        <span>
                          {p.title}
                          <small className="muted block">/{p.handle}</small>
                        </span>
                      </Link>
                    </td>
                    <td data-label="Status"><ProductStatusBadge status={p.status} /></td>
                    <td data-label="Price" className="num">{money(p.price)}</td>
                    <td data-label="Stock">
                      <span className="adm-sizes">
                        {p.sizes.map((s) => (
                          <span key={s.size} className={s.qty === 0 ? "out" : s.qty <= 3 ? "low" : ""}>
                            {s.size} <b>{s.qty}</b>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td data-label="Total" className={`num ${stock === 0 ? "adm-out" : ""}`}>
                      {stock === 0 ? "Sold out" : stock}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
