import { Link } from "react-router-dom";
import { useSaved } from "../context/SavedContext";
import { getProductsByIds } from "../data/store";
import ProductCard from "../components/ProductCard";

export default function Saved() {
  const { ids } = useSaved();
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

      {items.length === 0 ? (
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
