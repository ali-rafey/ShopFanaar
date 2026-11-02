import { Link } from "react-router-dom";
import { categoryTiles, craft, heroImage, homeTrust, shop } from "../data/store";
import { useCatalog } from "../context/CatalogContext";
import ProductRow from "../components/ProductRow";
import ListingCard from "../components/ListingCard";
import NewsletterForm from "../components/NewsletterForm";

// The home page, kept as quiet as the product pages: the Fanaar hero with a
// clear way in, what every order comes with, a line about Fanaar, then the
// pieces themselves — numbered like the chapters on a product page — and the
// studio and the list at the end. Texture Knit sits beside its story and shows
// two Drop Needle pieces, so the section is full however few there are.

export default function Home() {
  const { getCollection, getColorways, ready } = useCatalog();
  const newIn = getCollection("landing-page-collection").items;
  const dropNeedle = getCollection("frontpage").items;

  return (
    <div className="hm">
      <section className="hero-split wrap">
        <div className="hero-copy">
          <span className="eyebrow">{shop.origin}</span>
          <h1 className="hero-display">FANAAR</h1>
          <p className="hero-sub">The science of apparel — garments engineered for how they feel, move and last.</p>
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

      <ul className="hm-trust" aria-label="With every order">
        {homeTrust.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <div className="wrap hm-wrap">
        <section className="hm-intro">
          <p>{shop.tagline}</p>
          <Link to="/about" className="link-underline">
            Our story
          </Link>
        </section>

        <ProductRow title="1. New in" to="/collections/landing-page-collection" products={newIn} />

        <section className="hm-autonomy" aria-labelledby="hm-autonomy-title">
          <div className="pr-head">
            <h2 id="hm-autonomy-title">2. Texture Knit</h2>
            <Link to={craft.cta.to} className="link-underline">
              Shop all
            </Link>
          </div>
          <div className="hm-autonomy-grid">
            <Link to={craft.cta.to} className="hm-autonomy-media" tabIndex={-1} aria-hidden="true">
              <img src={craft.homeImage} alt="" loading="lazy" />
            </Link>
            <div className="hm-autonomy-copy">
              <span className="eyebrow">{craft.eyebrow}</span>
              <h3>{craft.title}</h3>
              <p>{craft.body}</p>
              <Link to={craft.cta.to} className="link-underline">
                {craft.cta.label}
              </Link>
            </div>
            {ready
              ? dropNeedle.slice(0, 2).map((p) => <ListingCard key={p.id} product={p} colorways={getColorways(p)} />)
              : [0, 1].map((i) => (
                  <div key={i} aria-hidden="true">
                    <div className="cl-skel-media" />
                    <div className="card-skel-line" />
                    <div className="card-skel-line short" />
                  </div>
                ))}
          </div>
        </section>

        <section className="hm-cats" aria-labelledby="hm-cats-title">
          <div className="pr-head">
            <h2 id="hm-cats-title">3. Shop by category</h2>
            <Link to="/collections/all-top" className="link-underline">
              Shop all
            </Link>
          </div>
          <div className="hm-cats-grid">
            {categoryTiles.map((c) => (
              <Link key={c.handle} to={`/collections/${c.handle}`} className="hm-cat">
                <span className="hm-cat-media">
                  <img src={c.image} alt="" loading="lazy" />
                </span>
                <span>{c.title}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="hm-studio">
          <div className="hm-studio-copy">
            <span className="eyebrow">4. From the studio</span>
            <h2>Independent by design</h2>
            <p>
              Fanaar is made in Faisalabad, a city that has spun and woven cloth for generations. Every fabric, every
              sample and every piece passes through the same hands before it reaches yours.
            </p>
            <Link to="/about" className="link-underline">
              Read our story
            </Link>
          </div>
          <Link to="/about" className="hm-studio-media" tabIndex={-1} aria-hidden="true">
            <img src="/images/about/studio.webp" alt="" loading="lazy" />
          </Link>
        </section>
      </div>

      <section className="join">
        <div className="wrap join-inner">
          <span className="eyebrow">The list</span>
          <h2>let&apos;s connect like old friends</h2>
          <p>First access to restocks, new fabrications and everything we make in small numbers.</p>
          <NewsletterForm />
        </div>
      </section>
    </div>
  );
}
