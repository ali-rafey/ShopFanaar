import { Link } from "react-router-dom";
import { formatPrice, totalStock } from "../lib/catalog";
import { useInView } from "../lib/useInView";
import { useSaved } from "../context/SavedContext";

// Gentle height variation for the masonry pinboard. Source photos are 2:3;
// these ratios only trim background whitespace, never the garment.
const TILE_RATIOS = ["2 / 3", "3 / 4", "4 / 5", "2 / 3", "5 / 7", "3 / 4"];

export default function ProductCard({ product, index = 0 }) {
  const [ref, inView] = useInView();
  const { isSaved, toggle } = useSaved();
  const stock = totalStock(product);
  const inStock = stock > 0;
  const saved = isSaved(product.id);
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
        {inStock && stock <= 3 && (
          <span className="card-badge low">Low Stock</span>
        )}

        <img src={product.images[0]} alt={product.title} loading="lazy" />
        {product.images[1] && (
          <img
            className="alt"
            src={product.images[1]}
            alt=""
            aria-hidden="true"
            loading="lazy"
          />
        )}

        <button
          type="button"
          className={`save-btn ${saved ? "is-saved" : ""}`}
          aria-label={saved ? "Remove from saved" : "Save this piece"}
          aria-pressed={saved}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(product.id, product);
          }}
        >
          <Heart filled={saved} />
          <span>{saved ? "Saved" : "Save"}</span>
        </button>

        <span className="card-view">View</span>
      </div>

      <div className="card-info">
        <p className="title">{product.title}</p>
        <span className="price">
          {product.compareAtPrice > product.price && (
            <s className="was">{formatPrice(product.compareAtPrice)}</s>
          )}
          {formatPrice(product.price)}
        </span>
      </div>
    </Link>
  );
}

export function Heart({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 8.4a4.4 4.4 0 0 1 7.5 2.5c0 4.9-7.5 9.6-7.5 9.6z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
