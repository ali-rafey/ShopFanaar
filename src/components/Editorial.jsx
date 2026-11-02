import { useState } from "react";
import { Link } from "react-router-dom";
import { craft, lookbook, moreFromFanaar } from "../data/store";
import { formatPrice, thumb } from "../lib/catalog";

// Editorial pieces shared by the home and collection pages.

// Two lookbook photos, small left and large right, each able to show the
// pieces worn in it. `looks`: two indexes into `lookbook`.
export function LookSpread({ looks: which, products }) {
  const looks = which.map((i) => lookbook[i]).filter(Boolean);
  if (looks.length < 2) return null;
  return (
    <section className="cl-spread" aria-label="The lookbook">
      {looks.map((look, i) => (
        <figure key={look.src} className={i === 0 ? "cl-spread-small" : "cl-spread-large"}>
          <img src={look.src} alt={look.alt} width={look.width} height={look.height} loading="lazy" />
          <ShopTheLook look={look} products={products} />
        </figure>
      ))}
    </section>
  );
}

function ShopTheLook({ look, products }) {
  const [open, setOpen] = useState(false);
  const worn = (look.products || []).map((h) => products.find((p) => p.handle === h)).filter(Boolean);
  if (!worn.length) return null;
  return (
    <div className={`cl-look ${open ? "is-open" : ""}`}>
      {open && (
        <ul className="cl-look-list">
          {worn.map((p) => (
            <li key={p.id}>
              <Link to={`/products/${p.handle}`}>
                <img src={thumb(p.images[0])} alt="" />
                <span>
                  {p.title}
                  <small>{formatPrice(p.price)}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="cl-look-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Shop the look"} <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
    </div>
  );
}

// The Autonomy story, set to the right like a page in a catalogue.
export function Story() {
  return (
    <section className="cl-story">
      <img src={craft.image} alt="" loading="lazy" />
      <div>
        <span className="eyebrow">{craft.eyebrow}</span>
        <h2>{craft.title}</h2>
        <p>{craft.body}</p>
        <Link to={craft.cta.to} className="link-underline">
          {craft.cta.label}
        </Link>
      </div>
    </section>
  );
}

export function MoreFromFanaar() {
  return (
    <section className="cl-more" aria-labelledby="cl-more-title">
      <h2 id="cl-more-title" className="eyebrow">
        More from Fanaar
      </h2>
      <div className="cl-more-grid">
        {moreFromFanaar.map((m) => (
          <Link key={m.title} to={m.to} className="cl-more-card">
            <span className="cl-more-media">
              <img src={m.image} alt="" loading="lazy" />
            </span>
            <span className="eyebrow">{m.eyebrow}</span>
            <span className="cl-more-title">{m.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
