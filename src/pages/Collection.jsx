import { useMemo, useState, useEffect } from "react";
import { useParams, Link, NavLink } from "react-router-dom";
import { categoryTiles } from "../data/store";
import { totalStock } from "../lib/catalog";
import { useCatalog } from "../context/CatalogContext";
import ProductCard from "../components/ProductCard";
import { GridSkeleton } from "../components/Skeleton";

const SORTS = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "title", label: "Alphabetical" },
];

export default function Collection() {
  const { handle } = useParams();
  const { getCollection, ready } = useCatalog();
  const { meta, items } = getCollection(handle);
  const [sort, setSort] = useState("featured");

  useEffect(() => {
    setSort("featured");
  }, [handle]);

  const sorted = useMemo(() => {
    const list = [...items];
    // Always float in-stock pieces above sold-out ones.
    const byStock = (a, b) =>
      (totalStock(b) > 0 ? 1 : 0) - (totalStock(a) > 0 ? 1 : 0);
    switch (sort) {
      case "price-asc":
        return list.sort((a, b) => byStock(a, b) || a.price - b.price);
      case "price-desc":
        return list.sort((a, b) => byStock(a, b) || b.price - a.price);
      case "title":
        return list.sort((a, b) => byStock(a, b) || a.title.localeCompare(b.title));
      default:
        return list.sort(byStock);
    }
  }, [items, sort]);

  return (
    <div className="wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span className="current">{meta ? meta.title : "Collection"}</span>
      </nav>

      <div className="collection-head">
        <span className="eyebrow">Fanaar</span>
        <h1>{meta ? meta.title : "Collection"}</h1>
        <div className="count">
          {ready ? `${items.length} ${items.length === 1 ? "piece" : "pieces"}` : "\u00a0"}
        </div>
      </div>

      <div className="chip-row" role="navigation" aria-label="Categories">
        <NavLink
          to="/collections/all-top"
          className={({ isActive }) => `chip ${isActive ? "active" : ""}`}
        >
          All
        </NavLink>
        {categoryTiles.map((c) => (
          <NavLink
            key={c.handle}
            to={`/collections/${c.handle}`}
            className={({ isActive }) => `chip ${isActive ? "active" : ""}`}
          >
            {c.title}
          </NavLink>
        ))}
      </div>

      {!ready ? (
        <div style={{ paddingBottom: 110 }}>
          <GridSkeleton count={6} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-lead">Nothing here yet.</p>
          <p className="empty-sub">
            This collection is being restocked. Browse everything else in the
            meantime.
          </p>
          <Link to="/collections/all-top" className="btn-solid">
            Shop all
          </Link>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <span className="toolbar-count">
              Showing {sorted.length}{" "}
              {sorted.length === 1 ? "piece" : "pieces"}
            </span>
            <label className="sort">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sort products"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid" style={{ paddingBottom: 110 }}>
            {sorted.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
