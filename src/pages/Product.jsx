import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { shop } from "../data/store";
import { formatPrice } from "../lib/catalog";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { useSaved } from "../context/SavedContext";
import { trackViewContent } from "../lib/pixel";
import ProductCard, { Heart } from "../components/ProductCard";
import Reveal from "../components/Reveal";
import { ProductSkeleton } from "../components/Skeleton";

export default function Product() {
  const { handle } = useParams();
  const catalog = useCatalog();
  const product = catalog.getProduct(handle);
  const { add } = useCart();
  const { isSaved, toggle } = useSaved();

  const [size, setSize] = useState(null);
  const [openPanel, setOpenPanel] = useState("details");
  const [shot, setShot] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const galleryRef = useRef(null);
  const actionsRef = useRef(null);

  // Show the sticky buy bar only once the real Add-to-cart has scrolled away.
  // If the observer never fires the bar simply stays hidden — the in-page
  // button is always available, so this can't strand the user.
  useEffect(() => {
    const el = actionsRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [handle]);

  useEffect(() => {
    setSize(null);
    setShot(0);
    window.scrollTo(0, 0);
    if (galleryRef.current) galleryRef.current.scrollLeft = 0;
  }, [handle]);

  const productId = product?.id;
  useEffect(() => {
    if (product) trackViewContent(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (!product && !catalog.ready) return <ProductSkeleton />;

  if (!product) {
    return (
      <div className="wrap empty-state" style={{ padding: "120px 0" }}>
        <h1 className="empty-lead">Product not found</h1>
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
  const related = catalog.getRelated(product, 3);
  const colorways = catalog.getColorways(product);

  const primary = product.collections[0];
  const crumb = catalog.collections.find((c) => c.handle === primary);

  // When colourways exist the swatches carry the colour, so the heading
  // drops the " - Colour" suffix instead of wrapping on the hyphen.
  const activeColor = colorways.find((c) => c.id === product.id)?.colorName;
  const heading =
    colorways.length > 1 ? product.title.split(" - ")[0].trim() : product.title;

  // Mobile carousel dot tracking
  const onGalleryScroll = (e) => {
    const el = e.currentTarget;
    if (el.clientWidth === 0) return;
    setShot(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goToShot = (i) => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setShot(i);
  };

  return (
    <>
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          {crumb && (
            <>
              <Link to={`/collections/${crumb.handle}`}>{crumb.title}</Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span className="current">{product.title}</span>
        </nav>
      </div>

      <div className="wrap pdp">
        <div className="pdp-media">
          <div
            className="pdp-gallery"
            ref={galleryRef}
            onScroll={onGalleryScroll}
          >
            {product.images.map((img, i) => (
              <figure className="pdp-shot" key={img}>
                <img
                  src={img}
                  alt={`${product.title} — view ${i + 1}`}
                  loading={i === 0 ? "eager" : "lazy"}
                />
              </figure>
            ))}
          </div>
          {product.images.length > 1 && (
            <div className="pdp-dots" role="tablist" aria-label="Product images">
              {product.images.map((img, i) => (
                <button
                  key={img}
                  className={`dot ${i === shot ? "active" : ""}`}
                  aria-label={`Go to image ${i + 1}`}
                  aria-selected={i === shot}
                  role="tab"
                  onClick={() => goToShot(i)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="pdp-info">
          <div className="vendor">{shop.name}</div>
          <h1>{heading}</h1>
          <div className="pdp-price">
            {product.compareAtPrice > product.price && (
              <s className="was">{formatPrice(product.compareAtPrice)}</s>
            )}
            {formatPrice(product.price)}
          </div>

          {colorways.length > 1 && (
            <div className="colorways">
              <span className="size-label">Colour: {activeColor}</span>
              <div className="swatches">
                {colorways.map((c) => (
                  <Link
                    key={c.id}
                    to={`/products/${c.handle}`}
                    className={`swatch ${c.id === product.id ? "active" : ""}`}
                    title={c.colorName}
                    aria-label={c.colorName}
                  >
                    <img src={c.images[0]} alt="" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="size-row">
            <span className="size-label">Size{size ? `: ${size}` : ""}</span>
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

          <div className="pdp-actions" ref={actionsRef}>
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

          <ul className="pdp-assurances">
            <li>Dispatched in 1–2 working days from Faisalabad</li>
            <li>Exchanges within 7 days on unworn pieces</li>
          </ul>

          <div className="accordion">
            <Panel id="details" title="Details" open={openPanel === "details"} onToggle={setOpenPanel}>
              <p>{product.description}</p>
              {product.disclaimer && (
                <p className="disclaimer">
                  <strong>Disclaimer:</strong> {product.disclaimer}
                </p>
              )}
            </Panel>

            <Panel id="sizing" title="Size & fit" open={openPanel === "sizing"} onToggle={setOpenPanel}>
              <p>
                Fits true to size with a relaxed drape. If you prefer a closer
                fit, size down.
              </p>
              <table className="size-table">
                <thead>
                  <tr><th>Size</th><th>Chest (in)</th><th>Length (in)</th></tr>
                </thead>
                <tbody>
                  <tr><td>S</td><td>38–40</td><td>27</td></tr>
                  <tr><td>M</td><td>40–42</td><td>28</td></tr>
                  <tr><td>L</td><td>42–44</td><td>29</td></tr>
                </tbody>
              </table>
            </Panel>

            <Panel id="care" title="Care" open={openPanel === "care"} onToggle={setOpenPanel}>
              <p>
                Cold machine wash with like colours. Do not bleach. Dry flat in
                shade to preserve the knit structure. Warm iron on reverse.
              </p>
            </Panel>

            <Panel id="shipping" title="Shipping &amp; returns" open={openPanel === "shipping"} onToggle={setOpenPanel}>
              <p>
                Dispatched within 1–2 working days from Faisalabad. Delivery
                across Pakistan in 3–5 working days. Exchanges accepted within
                7 days of delivery on unworn pieces with tags intact.
              </p>
              <p>
                <Link to="/policies/shipping-policy">Shipping policy</Link> ·{" "}
                <Link to="/policies/refund-policy">Exchanges &amp; returns</Link>
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

      {/* Sticky mobile buy bar */}
      <div className={`buybar ${showBar ? "show" : ""}`}>
        <div className="buybar-info">
          <span className="buybar-title">{product.title}</span>
          <span className="buybar-price">{formatPrice(product.price)}</span>
        </div>
        <button
          className="btn-solid"
          disabled={!canAdd}
          onClick={() => {
            if (canAdd) add(product, size);
            else
              document
                .querySelector(".sizes")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          {!size ? "Select size" : !canAdd ? "Sold out" : "Add"}
        </button>
      </div>
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
