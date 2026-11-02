import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../context/CatalogContext";
import ListingCard from "./ListingCard";

// A row of products that scrolls sideways — swipe on phones, Previous / Next
// on computers. Four in view on a computer, two and a bit on a phone.
export default function ProductRow({ title, to, products }) {
  const catalog = useCatalog();
  const track = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, products.length, catalog.ready]);

  const page = (dir) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: "smooth" });

  if (catalog.ready && products.length === 0) return null;

  return (
    <section className="pr" aria-label={title}>
      <div className="pr-head">
        <h2>{title}</h2>
        <span className="pr-tools">
          {!(edge.start && edge.end) && (
            <span className="pr-nav">
              <button type="button" disabled={edge.start} onClick={() => page(-1)}>
                Previous
              </button>
              <button type="button" disabled={edge.end} onClick={() => page(1)}>
                Next
              </button>
            </span>
          )}
          {to && (
            <Link to={to} className="link-underline">
              Shop all
            </Link>
          )}
        </span>
      </div>
      <div className="pr-track" ref={track} onScroll={measure}>
        {catalog.ready
          ? products.map((p) => (
              <div className="pr-item" key={p.id}>
                <ListingCard product={p} colorways={catalog.getColorways(p)} />
              </div>
            ))
          : Array.from({ length: 4 }, (_, i) => (
              <div className="pr-item" key={i} aria-hidden="true">
                <div className="cl-skel-media" />
                <div className="card-skel-line" />
                <div className="card-skel-line short" />
              </div>
            ))}
      </div>
    </section>
  );
}
