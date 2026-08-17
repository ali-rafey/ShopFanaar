import { Link } from "react-router-dom";
import { formatPrice } from "../data/store";
import { useInView } from "../lib/useInView";

export default function ProductCard({ product, index = 0 }) {
  const inStock = product.sizes.some((s) => s.qty > 0);
  const [ref, inView] = useInView();

  return (
    <Link
      ref={ref}
      to={`/products/${product.handle}`}
      className={`card reveal ${inView ? "in" : ""}`}
      style={{ transitionDelay: `${(index % 3) * 90}ms` }}
    >
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
