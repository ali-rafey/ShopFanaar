import { useParams } from "react-router-dom";
import { getCollection } from "../data/store";
import ProductCard from "../components/ProductCard";

export default function Collection() {
  const { handle } = useParams();
  const { meta, items } = getCollection(handle);

  return (
    <div className="wrap">
      <div className="collection-head">
        <h1>{meta ? meta.title : "Collection"}</h1>
        <div className="count">
          {items.length} {items.length === 1 ? "Product" : "Products"}
        </div>
      </div>
      {items.length === 0 ? (
        <p style={{ textAlign: "center", padding: "60px 0", color: "#777" }}>
          No products in this collection.
        </p>
      ) : (
        <div className="grid" style={{ paddingBottom: 80 }}>
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
