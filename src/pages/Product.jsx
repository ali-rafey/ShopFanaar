import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getProduct,
  getRelated,
  formatPrice,
  shop,
  collections as allCollections,
} from "../data/store";
import { useCart } from "../context/CartContext";
import { useSaved } from "../context/SavedContext";
import { trackViewContent } from "../lib/pixel";
import ProductCard, { Heart } from "../components/ProductCard";
import Reveal from "../components/Reveal";

export default function Product() {
  const { handle } = useParams();
  const product = getProduct(handle);
  const { add } = useCart();
  const { isSaved, toggle } = useSaved();

  const [active, setActive] = useState(0);
  const [size, setSize] = useState(null);
  const [openPanel, setOpenPanel] = useState("details");

  useEffect(() => {
    setActive(0);
    setSize(null);
    window.scrollTo(0, 0);
    if (product) trackViewContent(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  if (!product) {
    return (
      <div className="wrap empty-state" style={{ padding: "120px 0" }}>
        <p className="empty-lead">Product not found</p>
        <p className="empty-sub">
          This piece may have moved or sold out permanently.
        </p>
        <Link to="/collections/all-top" className="btn-solid">
          Back to shop
        </Link>
      </div>
    );
  }

  const selected = product.sizes.find((s) => s.size === size);
  const canAdd = selected && selected.qty > 0;
  const saved = isSaved(product.id);
  const related = getRelated(product, 3);

  const primary = product.collections[0];
  const crumb = allCollections.find((c) => c.handle === primary);

  return (
    <>
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          {crumb ? (
            <>
              <Link to={`/collections/${crumb.handle}`}>{crumb.title}</Link>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span className="current">{product.title}</span>
        </nav>
      </div>

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
                  aria-label={`View image ${i + 1}`}
                  onClick={() => setActive(i)}
                >
                  <img src={img} alt="" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp-info">
          <div className="vendor">{shop.name}</div>
          <h1>{product.title}</h1>
          <div className="pdp-price">{formatPrice(product.price)}</div>

          <div className="size-row">
            <span className="size-label">
              Size{size ? `: ${size}` : ""}
            </span>
            <button
              className="size-guide-btn"
              onClick={() =>
                setOpenPanel(openPanel === "sizing" ? null : "sizing")
              }
            >
              Size guide
            </button>
          </div>

          <div className="sizes">
            {product.sizes.map((s) => (
              <button
                key={s.size}
                className={`size ${size === s.size ? "active" : ""} ${
                  s.qty === 0 ? "disabled" : ""
                }`}
                disabled={s.qty === 0}
                aria-pressed={size === s.size}
                onClick={() => setSize(s.size)}
              >
                {s.size}
              </button>
            ))}
          </div>

          {selected && selected.qty > 0 && selected.qty <= 3 && (
            <p className="stock-note">
              Only {selected.qty} left in size {selected.size}
            </p>
          )}

          <div className="pdp-actions">
            <button
              className="btn-solid full"
              disabled={!canAdd}
              onClick={() => add(product, size)}
            >
              {!size ? "Select a size" : !canAdd ? "Sold out" : "Add to cart"}
            </button>
            <button
              className={`btn-outline save ${saved ? "is-saved" : ""}`}
              onClick={() => toggle(product.id)}
              aria-pressed={saved}
            >
              <Heart filled={saved} />
              {saved ? "Saved" : "Save"}
            </button>
          </div>

          <div className="accordion">
            <Panel
              id="details"
              title="Details"
              open={openPanel === "details"}
              onToggle={setOpenPanel}
            >
              <p>{product.description}</p>
              {product.disclaimer && (
                <p className="disclaimer">
                  <strong>Disclaimer:</strong> {product.disclaimer}
                </p>
              )}
            </Panel>

            <Panel
              id="sizing"
              title="Size &amp; fit"
              open={openPanel === "sizing"}
              onToggle={setOpenPanel}
            >
              <p>
                Fits true to size with a relaxed drape. If you prefer a closer
                fit, size down.
              </p>
              <table className="size-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Chest (in)</th>
                    <th>Length (in)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>S</td>
                    <td>38–40</td>
                    <td>27</td>
                  </tr>
                  <tr>
                    <td>M</td>
                    <td>40–42</td>
                    <td>28</td>
                  </tr>
                  <tr>
                    <td>L</td>
                    <td>42–44</td>
                    <td>29</td>
                  </tr>
                </tbody>
              </table>
            </Panel>

            <Panel
              id="care"
              title="Care"
              open={openPanel === "care"}
              onToggle={setOpenPanel}
            >
              <p>
                Cold machine wash with like colours. Do not bleach. Dry flat in
                shade to preserve the knit structure. Warm iron on reverse.
              </p>
            </Panel>

            <Panel
              id="shipping"
              title="Shipping &amp; returns"
              open={openPanel === "shipping"}
              onToggle={setOpenPanel}
            >
              <p>
                Dispatched within 1–2 working days from Faisalabad. Delivery
                across Pakistan in 3–5 working days. Exchanges accepted within
                7 days of delivery on unworn pieces with tags intact.
              </p>
            </Panel>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="wrap section">
          <Reveal>
            <div className="section-head">
              <h2>You may also like</h2>
              <Link to="/collections/all-top">View all</Link>
            </div>
          </Reveal>
          <div className="grid">
            {related.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Panel({ id, title, open, onToggle, children }) {
  return (
    <div className={`panel ${open ? "open" : ""}`}>
      <button
        className="panel-head"
        aria-expanded={open}
        onClick={() => onToggle(open ? null : id)}
      >
        <span dangerouslySetInnerHTML={{ __html: title }} />
        <span className="panel-icon" aria-hidden="true" />
      </button>
      <div className="panel-body">
        <div className="panel-inner">{children}</div>
      </div>
    </div>
  );
}
