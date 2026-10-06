import { Link } from "react-router-dom";
import {
  heroImage,
  shop,
  categoryTiles,
  craft,
  lookbook,
  values,
} from "../data/store";
import { useCatalog } from "../context/CatalogContext";
import ProductCard from "../components/ProductCard";
import Reveal from "../components/Reveal";
import { GridSkeleton } from "../components/Skeleton";
import NewsletterForm from "../components/NewsletterForm";

export default function Home() {
  const { getCollection, ready } = useCatalog();
  const featured = getCollection("landing-page-collection").items;
  const dropNeedle = getCollection("frontpage").items;

  return (
    <div>
      {/* ---------- Hero: editorial split, image at native 4:3 ---------- */}
      <section className="hero-split wrap">
        <div className="hero-copy">
          <span className="eyebrow">{shop.origin}</span>
          <h1 className="hero-display">FANAAR</h1>
          <p className="hero-sub">
            The science of apparel — garments engineered for how they feel,
            move and last.
          </p>
          <div className="hero-cta">
            <Link to="/collections/all-top" className="btn-solid">
              Shop the collection
            </Link>
            <Link to="/collections/frontpage" className="link-underline">
              Explore Autonomy
            </Link>
          </div>
        </div>
        <div className="hero-media">
          <img src={heroImage} alt="Fanaar" fetchpriority="high" />
        </div>
      </section>

      {/* ---------- Values ---------- */}
      <Reveal>
        <section className="wrap values">
          {values.map((v) => (
            <div className="value" key={v.title}>
              <h3>{v.title}</h3>
              <p>{v.body}</p>
            </div>
          ))}
        </section>
      </Reveal>

      {/* ---------- Category board ---------- */}
      <section className="wrap section">
        <Reveal>
          <div className="section-head">
            <h2>Browse the board</h2>
            <Link to="/collections/all-top">View all</Link>
          </div>
        </Reveal>
        <div className="cat-board">
          {categoryTiles.map((c, i) => (
            <Reveal key={c.handle} delay={i * 60}>
              <Link to={`/collections/${c.handle}`} className="cat-tile">
                <div className="cat-tile-img">
                  <img src={c.image} alt={c.title} loading="lazy" />
                </div>
                <span className="cat-tile-label">{c.title}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- New In ---------- */}
      <section className="wrap section">
        <Reveal>
          <div className="section-head">
            <h2>New in</h2>
            <Link to="/collections/landing-page-collection">View all</Link>
          </div>
        </Reveal>
        {ready ? (
          <div className="grid">
            {featured.slice(0, 6).map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        ) : (
          <GridSkeleton count={6} />
        )}
      </section>

      {/* ---------- Craft / Autonomy editorial ---------- */}
      <Reveal>
        <section className="craft">
          <div className="wrap craft-inner">
            <div className="craft-media">
              <img src={craft.image} alt={craft.title} loading="lazy" />
            </div>
            <div className="craft-copy">
              <span className="eyebrow">{craft.eyebrow}</span>
              <h2>{craft.title}</h2>
              <p>{craft.body}</p>
              <Link to={craft.cta.to} className="btn-solid">
                {craft.cta.label}
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ---------- Drop Needle ---------- */}
      <section className="wrap section">
        <Reveal>
          <div className="section-head">
            <h2>Drop Needle</h2>
            <Link to="/collections/frontpage">View all</Link>
          </div>
        </Reveal>
        {ready ? (
          <div className="grid">
            {dropNeedle.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        ) : (
          <GridSkeleton count={3} />
        )}
      </section>

      {/* ---------- Lookbook moodboard ---------- */}
      <section className="wrap section">
        <Reveal>
          <div className="section-head">
            <h2>The lookbook</h2>
            <Link to="/collections/all-top">Shop the looks</Link>
          </div>
        </Reveal>
        {/* 4 or 8 looks read best in 4 columns; otherwise 3 */}
        <div
          className="lookboard"
          style={{ "--look-cols": lookbook.length % 4 === 0 && lookbook.length % 3 !== 0 ? 4 : 3 }}
        >
          {lookbook.map((look, i) => (
            <Reveal key={look.src} delay={(i % 4) * 70} className="lookpin">
              <img src={look.src} width={look.width} height={look.height} alt={look.alt} loading="lazy" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Join band ---------- */}
      <Reveal>
        <section className="join">
          <div className="wrap join-inner">
            <span className="eyebrow">The list</span>
            <h2>let&apos;s connect like old friends</h2>
            <p>
              First access to restocks, new fabrications and everything we make
              in small numbers.
            </p>
            <NewsletterForm />
          </div>
        </section>
      </Reveal>
    </div>
  );
}
