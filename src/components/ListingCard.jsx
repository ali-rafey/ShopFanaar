import { Link } from "react-router-dom";
import { formatPrice, thumb, totalStock } from "../lib/catalog";
import { swatchColour } from "../lib/colours";
import { useInView } from "../lib/useInView";
import { useSaved } from "../context/SavedContext";
import { Heart } from "./ProductCard";

// A product on a collection page (src/pages/Collection.jsx): an even 2:3
// photo, then name, price, colour and the other colourways — quiet and
// regular, so the photos do the talking.

// The second photo only appears on hover, so touch screens never load it.
const CAN_HOVER = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export default function ListingCard({ product, colorways = [] }) {
  const [ref, inView] = useInView();
  const { isSaved, toggle } = useSaved();
  const stock = totalStock(product);
  const saved = isSaved(product.id);
  const multi = colorways.length > 1;
  const colour = multi ? colorways.find((c) => c.id === product.id)?.colorName : null;
  const name = multi ? product.title.split(" - ")[0].trim() : product.title;
  const href = `/products/${product.handle}`;

  return (
    <article ref={ref} className={`lc ${inView ? "in" : ""} ${stock === 0 ? "is-sold" : ""}`}>
      <div className="lc-media">
        <Link to={href} tabIndex={-1} aria-hidden="true">
          <img src={thumb(product.images[0])} alt="" loading="lazy" />
          {CAN_HOVER && product.images[1] && <img className="alt" src={thumb(product.images[1])} alt="" loading="lazy" />}
        </Link>
        {stock === 0 && <span className="lc-flag">Sold out</span>}
        <button
          type="button"
          className={`lc-save ${saved ? "is-saved" : ""}`}
          aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
          aria-pressed={saved}
          onClick={() => toggle(product.id, product)}
        >
          <Heart filled={saved} />
        </button>
      </div>

      <div className="lc-info">
        <Link to={href} className="lc-name">
          {name}
        </Link>
        <span className="lc-price">
          {product.compareAtPrice > product.price && <s>{formatPrice(product.compareAtPrice)}</s>}
          {formatPrice(product.price)}
        </span>
        {colour && <span className="lc-colour">{colour}</span>}
        {stock > 0 && stock <= 3 && <span className="lc-note">Only {stock} left</span>}
        {multi && (
          <span className="lc-swatches" aria-label="Colours">
            {colorways.map((c) => {
              const hex = swatchColour(c.colorName);
              return (
                <Link
                  key={c.id}
                  to={`/products/${c.handle}`}
                  className={`lc-swatch ${c.id === product.id ? "is-current" : ""}`}
                  title={c.colorName}
                  aria-label={c.colorName}
                  style={hex ? { "--swatch": hex } : undefined}
                >
                  {!hex && <img src={thumb(c.images[0])} alt="" />}
                </Link>
              );
            })}
          </span>
        )}
      </div>
    </article>
  );
}
