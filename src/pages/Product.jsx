import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getProduct, formatPrice, shop } from "../data/store";
import { useCart } from "../context/CartContext";
import { trackViewContent } from "../lib/pixel";

export default function Product() {
  const { handle } = useParams();
  const product = getProduct(handle);
  const { add } = useCart();
  const [active, setActive] = useState(0);
  const [size, setSize] = useState(null);

  useEffect(() => {
    setActive(0);
    setSize(null);
    window.scrollTo(0, 0);
    if (product) trackViewContent(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  if (!product) {
    return (
      <div className="wrap" style={{ padding: "100px 0", textAlign: "center" }}>
        <h1>Product not found</h1>
        <Link to="/collections/all-top" className="btn-dark" style={{ display: "inline-block", width: "auto", padding: "14px 30px", marginTop: 20 }}>
          Back to Shop
        </Link>
      </div>
    );
  }

  const selected = product.sizes.find((s) => s.size === size);
  const canAdd = selected && selected.qty > 0;

  return (
    <div className="wrap pdp">
      <div className="pdp-gallery">
        <div className="main">
          <img src={product.images[active]} alt={product.title} />
        </div>
        {product.images.length > 1 && (
          <div className="pdp-thumbs">
            {product.images.map((img, i) => (
              <button
                key={img}
                className={i === active ? "active" : ""}
                onClick={() => setActive(i)}
              >
                <img src={img} alt={`${product.title} ${i + 1}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pdp-info">
        <div className="vendor">{shop.name}</div>
        <h1>{product.title}</h1>
        <div className="pdp-price">{formatPrice(product.price)}</div>

        <div className="size-label">Size{size ? `: ${size}` : ""}</div>
        <div className="sizes">
          {product.sizes.map((s) => (
            <button
              key={s.size}
              className={`size ${size === s.size ? "active" : ""} ${
                s.qty === 0 ? "disabled" : ""
              }`}
              disabled={s.qty === 0}
              onClick={() => setSize(s.size)}
            >
              {s.size}
            </button>
          ))}
        </div>

        <button
          className="btn-dark"
          disabled={!canAdd}
          onClick={() => add(product, size)}
        >
          {!size
            ? "Select a size"
            : !canAdd
            ? "Sold Out"
            : "Add to Cart"}
        </button>

        <div className="pdp-desc">
          <p>{product.description}</p>
          {product.disclaimer && (
            <p className="disclaimer">
              <strong>Disclaimer:</strong> {product.disclaimer}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
