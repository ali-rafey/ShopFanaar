import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { categoryTiles, collectionSpread, collections as collectionInfo } from "../data/store";
import { totalStock } from "../lib/catalog";
import { useCatalog } from "../context/CatalogContext";
import ListingCard from "../components/ListingCard";
import { LookSpread, MoreFromFanaar, Story } from "../components/Editorial";

// A collection, laid out like an editorial catalogue: title and a line about
// it, quiet category links, an even grid of photos — opened up after the
// first rows by a two-image lookbook spread ("Shop the look") — and a story
// and more from Fanaar at the end.

const SORTS = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price, low to high" },
  { key: "price-desc", label: "Price, high to low" },
  { key: "title", label: "A to Z" },
];
const VIEW_KEY = "fanaar-collection-view"; // "grid" (4 / 2 per row) or "large" (2 / 1)
const SPREAD_AFTER = 8;

function savedView() {
  try {
    return localStorage.getItem(VIEW_KEY) === "large" ? "large" : "grid";
  } catch {
    return "grid";
  }
}

export default function Collection() {
  const { handle } = useParams();
  const catalog = useCatalog();
  const { meta, items } = catalog.getCollection(handle);
  const [sort, setSort] = useState("featured");
  const [view, setView] = useState(savedView);
  const title = meta ? meta.title : "Collection";
  const description = collectionInfo.find((c) => c.handle === handle)?.description;

  useEffect(() => setSort("featured"), [handle]);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* fine — the choice lasts for this visit */
    }
  }, [view]);

  const sorted = useMemo(() => {
    const list = [...items];
    // In-stock pieces always come before sold-out ones.
    const byStock = (a, b) => (totalStock(b) > 0 ? 1 : 0) - (totalStock(a) > 0 ? 1 : 0);
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

  const card = (p) => <ListingCard key={p.id} product={p} colorways={catalog.getColorways(p)} />;
  const first = sorted.slice(0, SPREAD_AFTER);
  const rest = sorted.slice(SPREAD_AFTER);

  return (
    <div className="cl">
      <div className="wrap cl-wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span className="current">{title}</span>
        </nav>

        <header className="cl-head">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>

        <nav className="cl-cats" aria-label="Categories">
          <NavLink to="/collections/all-top" className={({ isActive }) => (isActive ? "is-active" : "")}>
            All
          </NavLink>
          {categoryTiles.map((c) => (
            <NavLink key={c.handle} to={`/collections/${c.handle}`} className={({ isActive }) => (isActive ? "is-active" : "")}>
              {c.title}
            </NavLink>
          ))}
        </nav>

        <div className="cl-bar">
          <span className="cl-count">
            {catalog.ready ? `${sorted.length} ${sorted.length === 1 ? "piece" : "pieces"}` : " "}
          </span>
          <div className="cl-bar-tools">
            <label className="cl-sort">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="cl-view" role="group" aria-label="Pieces per row">
              <span>View</span>
              <button type="button" aria-pressed={view === "large"} onClick={() => setView("large")}>
                <span className="cl-on-wide">2</span>
                <span className="cl-on-narrow">1</span>
              </button>
              <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
                <span className="cl-on-wide">4</span>
                <span className="cl-on-narrow">2</span>
              </button>
            </span>
          </div>
        </div>

        {!catalog.ready ? (
          <div className={`cl-grid is-${view}`} aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="cl-skel" key={i}>
                <div className="cl-skel-media" />
                <div className="card-skel-line" />
                <div className="card-skel-line short" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <p className="empty-lead">Nothing here yet.</p>
            <p className="empty-sub">This collection is being restocked. Browse everything else in the meantime.</p>
            <Link to="/collections/all-top" className="btn-solid">
              Shop all
            </Link>
          </div>
        ) : (
          <>
            <div className={`cl-grid is-${view}`}>{first.map(card)}</div>
            <LookSpread looks={[collectionSpread.small, collectionSpread.large]} products={catalog.products} />
            {rest.length > 0 && <div className={`cl-grid is-${view}`}>{rest.map(card)}</div>}
          </>
        )}

        <Story />
        <MoreFromFanaar />
      </div>
    </div>
  );
}
