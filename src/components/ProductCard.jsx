import { Link } from "react-router-dom";
import { formatPrice } from "../data/store";
import { useInView } from "../lib/useInView";

// Gentle height variation for the masonry pinboard. Source photos are 2:3
// (h/w 1.5); these ratios only trim background whitespace, never the garment.
const TILE_RATIOS = ["2 / 3", "3 / 4", "4 / 5", "2 / 3", "5 / 7", "3 / 4"];

export default function ProductCard({ product, index = 0 }) {
  const inStock = product.sizes.some((s) => s.qty > 0);
  const [ref, inView] = useInView();
  const ratio = TILE_RATIOS[index % TILE_RATIOS.length];

  return (
    <Link
      ref={ref}
      to={`/products/${product.handle}`}
      className={`card ${inView ? "in" : ""}`}
      style={{ transitionDelay: `${(index % 3) * 80}ms` }}
    >
      <div className="card-media" style={{ aspectRatio: ratio }}>
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
