import { Link } from "react-router-dom";
import { heroImage, shop, getCollection } from "../data/store";
import ProductCard from "../components/ProductCard";

export default function Home() {
  const featured = getCollection("landing-page-collection").items;
  const dropNeedle = getCollection("frontpage").items;

  return (
    <div>
      <section className="hero hero-bleed">
        <img src={heroImage} alt="Fänaar" />
        <div className="hero-overlay">
          <span className="hero-eyebrow">The Science of Apparel</span>
          <span className="hero-display">FÄNAAR</span>
          <Link to="/collections/all-top" className="btn-light">
            Shop The Collection
          </Link>
        </div>
      </section>

      <section className="philosophy">
        <p>{shop.tagline}</p>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>New In</h2>
          <Link to="/collections/landing-page-collection">View All</Link>
        </div>
        <div className="grid">
          {featured.slice(0, 8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Autonomy — Drop Needle</h2>
          <Link to="/collections/frontpage">View All</Link>
        </div>
        <div className="grid">
          {dropNeedle.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
