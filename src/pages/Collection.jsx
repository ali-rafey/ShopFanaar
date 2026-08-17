import { useParams } from "react-router-dom";
import { getCollection } from "../data/store";
import ProductCard from "../components/ProductCard";

export default function Collection() {
  const { handle } = useParams();
  const { meta, items } = getCollection(handle);

  return (
    <div className="wrap">
      <div className="collection-head">
        <span className="eyebrow">Fänaar</span>
        <h1>{meta ? meta.title : "Collection"}</h1>
        <div className="count">
          {items.length} {items.length === 1 ? "Piece" : "Pieces"}
        </div>
      </div>
      {items.length === 0 ? (
        <p style={{ textAlign: "center", padding: "80px 0", color: "#8c8376" }}>
          No products in this collection.
        </p>
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
