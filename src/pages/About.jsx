import { Link } from "react-router-dom";
import { shop, craft, values, lookbook } from "../data/store";
import Reveal from "../components/Reveal";

export default function About() {
  return (
    <>
      <section className="wrap about-hero">
        <span className="eyebrow">{shop.origin}</span>
        <h1>The science of apparel</h1>
        <p className="about-lead">{shop.tagline}</p>
      </section>

      <Reveal>
        <section className="wrap about-figure">
          <img src={craft.image} alt="Fanaar fabrication" loading="lazy" />
        </section>
      </Reveal>

      <Reveal>
        <section className="wrap about-body">
          <div className="about-col">
            <h2>Made, not sourced</h2>
            <p>
              Fanaar is a menswear label built in Faisalabad — a city that has
              spun and woven cloth for generations. We develop our own
              fabrications rather than buying them finished, which means the
              texture of a piece is decided at the machine, in the yarn, long
              before it becomes a garment.
            </p>
          </div>
          <div className="about-col">
            <h2>Structure over surface</h2>
            <p>
              Drop needle ribs, micro-block knits and waffle thermals get their
              character from construction, not print. It is a slower way to
              make clothing, and it is the reason the pieces hold their shape,
              their hand-feel and their weight over years rather than seasons.
            </p>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="wrap values values--about">
          {values.map((v) => (
            <div className="value" key={v.title}>
              <h3>{v.title}</h3>
              <p>{v.body}</p>
            </div>
          ))}
        </section>
      </Reveal>

      <Reveal>
        <section className="wrap section">
          <div className="section-head">
            <h2>From the studio</h2>
            <Link to="/collections/all-top">Shop the collection</Link>
          </div>
          <div className="lookboard">
            {lookbook.slice(0, 6).map((src) => (
              <div className="lookpin" key={src}>
                <img src={src} alt="Fanaar" loading="lazy" />
              </div>
            ))}
          </div>
        </section>
      </Reveal>
    </>
  );
}
