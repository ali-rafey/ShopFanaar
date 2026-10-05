import { Link } from "react-router-dom";
import { useSaved } from "../context/SavedContext";
import { useCatalog } from "../context/CatalogContext";
import ProductCard from "../components/ProductCard";
import { GridSkeleton } from "../components/Skeleton";

export default function Saved() {
  const { ids } = useSaved();
  const { getProductsByIds, ready } = useCatalog();
  const items = getProductsByIds(ids);

  return (
    <div className="wrap">
      <div className="collection-head">
        <span className="eyebrow">Your board</span>
        <h1>Saved</h1>
        <div className="count">
          {items.length} {items.length === 1 ? "piece" : "pieces"}
        </div>
      </div>

      {!ready && ids.length > 0 ? (
        <div style={{ paddingBottom: 110 }}>
          <GridSkeleton count={Math.min(ids.length, 6)} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-lead">Your board is empty.</p>
          <p className="empty-sub">
            Tap <strong>Save</strong> on any piece to pin it here for later.
          </p>
          <Link to="/collections/all-top" className="btn-solid">
            Start browsing
          </Link>
        </div>
      ) : (
        <div className="grid" style={{ paddingBottom: 110 }}>
          {items.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
