import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatPrice, thumb } from "../lib/catalog";
import { swatchColour } from "../lib/colours";
import { useCatalog } from "../context/CatalogContext";
import { useCart } from "../context/CartContext";
import { useSaved } from "../context/SavedContext";
import { trackViewContent } from "../lib/pixel";
import { Heart } from "../components/ProductCard";
import ListingCard from "../components/ListingCard";
import { ProductSkeleton } from "../components/Skeleton";

// A product, laid out like a catalogue page: the photos down the left (a
// swipeable strip on phones), and beside them a panel that stays in view —
// name, price, a line about the piece, colour, size & fit, shipping, and
// "Select size", which opens a side sheet with the sizes and Add to cart.
// Below: numbered chapters that fold open (details, manufacturing and
// inspiration — both filled in from the product editor — size & fit, care,
// shipping & returns, related pieces).

const CARE =
  "Cold machine wash with like colours. Do not bleach. Dry flat in shade to preserve the knit structure. Warm iron on reverse.";

export default function Product() {
  const { handle } = useParams();
  const catalog = useCatalog();
  const product = catalog.getProduct(handle);
  const { add } = useCart();
  const { isSaved, toggle } = useSaved();

  const [size, setSize] = useState(null);
  const [shot, setShot] = useState(0);
  const [sheet, setSheet] = useState(null); // "size" | "fit" | "shipping"
  const [showBar, setShowBar] = useState(false);
  const galleryRef = useRef(null);
  const actionsRef = useRef(null);

  // The sticky buy bar (phones) only once the real button has scrolled away.
  useEffect(() => {
    const el = actionsRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [handle, product?.id]);

  useEffect(() => {
    setSize(null);
    setShot(0);
    setSheet(null);
    window.scrollTo(0, 0);
    if (galleryRef.current) galleryRef.current.scrollLeft = 0;
  }, [handle]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

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
        <p className="empty-sub">This piece may have moved or sold out permanently.</p>
        <Link to="/collections/all-top" className="btn-solid">
          Back to shop
        </Link>
      </div>
    );
  }

  const saved = isSaved(product.id);
  const chart = product.sizeChart;
  const related = catalog.getRelated(product, 4);
  const colorways = catalog.getColorways(product);
  const multi = colorways.length > 1;
  const activeColor = colorways.find((c) => c.id === product.id)?.colorName;
  // With colourways the swatches carry the colour, so the name drops " - Colour".
  const heading = multi ? product.title.split(" - ")[0].trim() : product.title;
  const soldOut = product.sizes.every((s) => s.qty <= 0);
  const summary = (product.description.match(/^[\s\S]*?[.!?](?=\s|$)/) || [product.description])[0].trim();
  const crumb = catalog.collections.find((c) => c.handle === product.collections[0]);

  const onGalleryScroll = (e) => {
    const el = e.currentTarget;
    if (el.clientWidth === 0) return;
    setShot(Math.round(el.scrollLeft / el.clientWidth));
  };

  const sections = [
    {
      id: "details",
      title: "Details",
      body: (
        <div className="pd-details">
          <p className="pd-lead">{product.description}</p>
          {product.disclaimer && <p className="pd-disclaimer">{product.disclaimer}</p>}
        </div>
      ),
    },
    product.manufacturing && {
      id: "manufacturing",
      title: "Manufacturing",
      body: (
        <div className="pd-details">
          {product.manufacturing.text && <p className="pd-mfg-text">{product.manufacturing.text}</p>}
          {product.manufacturing.rows.length > 0 && (
            <dl className="pd-spec">
              {product.manufacturing.rows.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ),
    },
    product.inspiration.length > 0 && {
      id: "inspiration",
      title: "Inspiration",
      body: (
        <div className="pd-inspo">
          {product.inspiration.map((url, i) => (
            <figure key={url}>
              <img src={thumb(url)} alt={`${heading} — styled ${i + 1}`} loading="lazy" />
            </figure>
          ))}
        </div>
      ),
    },
    chart && { id: "fit", title: "Size & Fit", body: <SizeChart chart={chart} /> },
    { id: "care", title: "Care", body: <p className="pd-text">{CARE}</p> },
    { id: "shipping", title: "Shipping & Returns", body: <ShippingInfo /> },
    related.length > 0 && {
      id: "related",
      title: "Related pieces",
      body: (
        <div className="cl-grid is-grid">
          {related.map((p) => (
            <ListingCard key={p.id} product={p} colorways={catalog.getColorways(p)} />
          ))}
        </div>
      ),
    },
  ].filter(Boolean);

  return (
    <>
      <div className="pd">
        <div className="pd-media">
          <div className="pd-gallery" ref={galleryRef} onScroll={onGalleryScroll}>
            {product.images.map((img, i) => (
              <figure className="pd-shot" key={img}>
                <img src={img} alt={`${product.title} — view ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} />
              </figure>
            ))}
          </div>
          {product.images.length > 1 && (
            <div className="pd-progress" aria-hidden="true">
              <span
                style={{
                  width: `${100 / product.images.length}%`,
                  transform: `translateX(${shot * 100}%)`,
                }}
              />
            </div>
          )}
        </div>

        <div className="pd-panel">
          <div className="pd-panel-inner">
            <div className="pd-top">
              <nav className="pd-crumbs" aria-label="Breadcrumb">
                <Link to="/">Home</Link>
                {crumb && (
                  <>
                    {" / "}
                    <Link to={`/collections/${crumb.handle}`}>{crumb.title}</Link>
                  </>
                )}
              </nav>
              <div className="pd-titlerow">
                <h1>{heading}</h1>
                <button
                  type="button"
                  className={`pd-save ${saved ? "is-saved" : ""}`}
                  onClick={() => toggle(product.id, product)}
                  aria-pressed={saved}
                  aria-label={saved ? "Remove from saved" : "Save this piece"}
                >
                  <Heart filled={saved} />
                </button>
              </div>
              <div className="pd-price">
                {product.compareAtPrice > product.price && <s>{formatPrice(product.compareAtPrice)}</s>}
                {formatPrice(product.price)}
              </div>
              <p className="pd-summary">{summary}</p>
            </div>

            <div className="pd-bottom">
              <ul className="pd-rows">
                {multi && (
                  <li className="pd-row pd-colour">
                    <span>{activeColor}</span>
                    <span className="pd-swatches" aria-label="Colours">
                      {colorways.map((c) => {
                        const hex = swatchColour(c.colorName);
                        return (
                          <Link
                            key={c.id}
                            to={`/products/${c.handle}`}
                            className={`pd-swatch ${c.id === product.id ? "is-current" : ""}`}
                            title={c.colorName}
                            aria-label={c.colorName}
                            style={hex ? { "--swatch": hex } : undefined}
                          >
                            {!hex && <img src={thumb(c.images[0])} alt="" />}
                          </Link>
                        );
                      })}
                    </span>
                  </li>
                )}
                {chart && (
                  <li>
                    <button type="button" className="pd-row" onClick={() => setSheet("fit")}>
                      <span>Size &amp; Fit</span>
                      <span className="pd-row-hint">Size guide, measurements</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </li>
                )}
                <li>
                  <button type="button" className="pd-row" onClick={() => setSheet("shipping")}>
                    <span>Shipping &amp; Returns</span>
                    <span className="pd-row-hint">Cash on delivery, 7-day exchanges</span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              </ul>

              <div ref={actionsRef}>
                <button type="button" className="pd-buy" disabled={soldOut} onClick={() => setSheet("size")}>
                  {soldOut ? "Sold out" : size ? `Size ${size} · Add to cart` : "Select size"}
                </button>
              </div>
              <p className="pd-assure">Dispatched in 1–2 working days from Faisalabad</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pd-sections">
        {sections.map((s, i) => (
          <Chapter key={s.id} number={i + 1} title={s.title} defaultOpen={["details", "manufacturing", "related"].includes(s.id)}>
            {s.body}
          </Chapter>
        ))}
      </div>

      <Sheet open={sheet === "size"} title="Select size" onClose={() => setSheet(null)}>
        <SizePicker
          product={product}
          size={size}
          onSize={setSize}
          chart={chart}
          onAdd={() => {
            setSheet(null);
            add(product, size);
          }}
        />
      </Sheet>
      <Sheet open={sheet === "fit"} title="Size & fit" onClose={() => setSheet(null)}>
        {chart && <SizeChart chart={chart} />}
      </Sheet>
      <Sheet open={sheet === "shipping"} title="Shipping & returns" onClose={() => setSheet(null)}>
        <ShippingInfo />
      </Sheet>

      {/* Sticky buy bar on phones, once the real button has scrolled away. */}
      <div className={`buybar ${showBar && !sheet ? "show" : ""}`}>
        <div className="buybar-info">
          <span className="buybar-title">{product.title}</span>
          <span className="buybar-price">{formatPrice(product.price)}</span>
        </div>
        <button className="btn-solid" disabled={soldOut} onClick={() => setSheet("size")}>
          {soldOut ? "Sold out" : "Select size"}
        </button>
      </div>
    </>
  );
}

// A numbered chapter that folds open and shut.
function Chapter({ number, title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`pd-chapter ${open ? "is-open" : ""}`}>
      <button type="button" className="pd-chapter-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          {number}. {title}
        </span>
        <span className="pd-chapter-icon" aria-hidden="true">
          {open ? "×" : "+"}
        </span>
      </button>
      {open && <div className="pd-chapter-body">{children}</div>}
    </section>
  );
}

// A side sheet, like the cart.
function Sheet({ open, title, onClose, children }) {
  return (
    <>
      <div className={`drawer-overlay ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`drawer pd-sheet ${open ? "open" : ""}`} aria-hidden={!open} aria-label={title}>
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">{open && children}</div>
      </aside>
    </>
  );
}

function SizePicker({ product, size, onSize, chart, onAdd }) {
  const [guide, setGuide] = useState(false);
  const selected = product.sizes.find((s) => s.size === size);
  const canAdd = selected && selected.qty > 0;
  return (
    <div className="pd-sizes">
      <div className="pd-size-grid">
        {product.sizes.map((s) => (
          <button
            key={s.size}
            type="button"
            className={`pd-size ${size === s.size ? "is-on" : ""}`}
            disabled={s.qty <= 0}
            aria-pressed={size === s.size}
            onClick={() => onSize(s.size)}
          >
            {s.size}
            <small>{s.qty <= 0 ? "Sold out" : s.qty <= 3 ? `${s.qty} left` : ""}</small>
          </button>
        ))}
      </div>
      {chart && (
        <>
          <button type="button" className="pd-guide-btn" onClick={() => setGuide(!guide)} aria-expanded={guide}>
            {guide ? "Hide size guide" : "Size guide"}
          </button>
          {guide && <SizeChart chart={chart} />}
        </>
      )}
      <div className="pd-sheet-foot">
        <button type="button" className="pd-buy" disabled={!canAdd} onClick={onAdd}>
          {size ? (canAdd ? `Add to cart · ${formatPrice(product.price)}` : "Sold out") : "Choose a size"}
        </button>
        <p className="pd-assure">Cash on delivery. Exchanges within 7 days on unworn pieces.</p>
      </div>
    </div>
  );
}

function SizeChart({ chart }) {
  return (
    <div className="pd-chart">
      {chart.note && <p className="pd-text">{chart.note}</p>}
      {chart.rows.length > 0 && (
        <div className="size-table-wrap">
          <table className="size-table">
            <thead>
              <tr>
                <th>Size</th>
                {chart.columns.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.size}</td>
                  {r.values.map((v, j) => (
                    <td key={j}>{v || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShippingInfo() {
  return (
    <div className="pd-text">
      <p>
        Cash on delivery across Pakistan. Dispatched within 1–2 working days from Faisalabad; delivery in 3–5 working
        days.
      </p>
      <p>Exchanges within 7 days of delivery on unworn pieces with tags intact.</p>
      <p>
        <Link to="/policies/shipping-policy">Shipping policy</Link> ·{" "}
        <Link to="/policies/refund-policy">Exchanges &amp; returns</Link> · <Link to="/track">Track your order</Link>
      </p>
    </div>
  );
}
