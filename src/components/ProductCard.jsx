import { Link } from "react-router-dom";
import { formatPrice } from "../data/store";

export default function ProductCard({ product }) {
  const inStock = product.sizes.some((s) => s.qty > 0);
  return (
    <Link to={`/products/${product.handle}`} className="card">
      <div className="card-media">
        {!inStock && <span className="card-badge sold">Sold Out</span>}
        <img src={product.images[0]} alt={product.title} loading="lazy" />
        {product.images[1] && (
          <img
            className="alt"
            src={product.images[1]}
            alt={product.title}
            loading="lazy"
          />
        )}
      </div>
      <div className="card-info">
        <p className="title">{product.title}</p>
        <span className="price">{formatPrice(product.price)}</span>
      </div>
    </Link>
  );
}
