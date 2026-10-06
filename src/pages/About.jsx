import { useEffect } from "react";
import { Link } from "react-router-dom";
import { shop, craft } from "../data/store";
import Reveal from "../components/Reveal";

const FOUNDER_SITE = "https://alianees.online";

const PROOF = [
  { title: "Lab-tested", body: "Every fabric is tested before a single piece is cut." },
  { title: "Made in-house", body: "Sampled and produced in our own facility." },
  { title: "Across Pakistan", body: "Delivered to your door, cash on delivery." },
];

const LAB_TESTS = [
  "GSM",
  "Composition",
  "Tear strength",
  "Tensile strength",
  "Dye class",
  "Warp & weft",
  "Knit or weave suitability",
];

const STEPS = [
  {
    title: "Sourcing",
    body: "Every fabric is sourced from the high end of the textile industry — chosen for the hand-feel, weight and structure a piece needs.",
  },
  {
    title: "Laboratory testing",
    body: "Before a fabric is approved, it goes through the lab. Nothing reaches production on looks alone.",
    tags: LAB_TESTS,
  },
  {
    title: "Sampling",
    body: "Each piece is sampled in-house first, so fit, finish and feel are settled before anything is made in number.",
  },
  {
    title: "In-house production",
    body: "Produced in our own facility in small batches, with every stage kept under one roof.",
  },
  {
    title: "Delivery",
    body: "Packed with care and delivered across Pakistan — cash on delivery, tracked to your door.",
  },
];

export default function About() {
  useEffect(() => {
    const previous = document.title;
    document.title = "About — Fanaar";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <article className="ab">
      {/* ---------- Header ---------- */}
      <header className="wrap ab-head">
        <div className="ab-head-text">
          <span className="eyebrow">About Fanaar</span>
          <h1>The science of apparel</h1>
          <p className="ab-lead">{shop.tagline}</p>
        </div>
        <figure className="ab-head-photo">
          <img
            src="/images/about/studio.webp"
            width="720"
            height="960"
            fetchpriority="high"
            alt="The Fanaar studio in Faisalabad — finished pieces on the rails, samples on the table"
          />
          <figcaption>The studio, Faisalabad</figcaption>
        </figure>
      </header>

      {/* ---------- At a glance ---------- */}
      <Reveal className="wrap">
        <ul className="ab-proof" aria-label="Fanaar at a glance">
          {PROOF.map((p) => (
            <li key={p.title}>
              <strong>{p.title}</strong>
              <span>{p.body}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      {/* ---------- Story ---------- */}
      <section className="wrap ab-story">
        <Reveal>
          <div className="ab-block">
            <h2>Independent by design</h2>
            <p>
              Fanaar is run by one person with a deep passion for the world of clothing, from
              Faisalabad — a city that has spun and woven cloth for generations. Being small is the
              point: every fabric, every sample and every piece passes through the same hands
              before it reaches yours.
            </p>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="ab-block">
            <h2>Structure over surface</h2>
            <p>
              Drop needle ribs, micro-block knits and waffle thermals get their character from
              construction, not print. It is a slower way to make clothing, and it is the reason the
              pieces hold their shape, their hand-feel and their weight over years rather than
              seasons.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ---------- From fabric to your door ---------- */}
      <section className="wrap ab-row is-flipped">
        <div className="ab-row-media">
          <Reveal>
            <figure className="ab-photo">
              <img
                src="/images/about/swatches.webp"
                width="640"
                height="827"
                loading="lazy"
                alt="Fabric swatches labelled by hand: broad line stripe, narrow stripe, J-black interlock, mesh thermal"
              />
              <figcaption>Fabrics on the table</figcaption>
            </figure>
          </Reveal>
        </div>
        <div className="ab-row-text">
          <Reveal>
            <span className="eyebrow">How a piece is made</span>
            <h2 className="ab-process-title">From fabric to your door</h2>
          </Reveal>
          <ol className="ab-journey">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 50}>
                  <span className="ab-step-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {s.tags && (
                    <ul className="ab-tests" aria-label="Laboratory tests">
                      {s.tags.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  )}
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Reveal>
        <div className="wrap ab-cta">
          <Link to="/collections/all-top" className="btn-solid">
            Shop the collection
          </Link>
          <Link to={craft.cta.to} className="link-underline">
            {craft.cta.label}
          </Link>
        </div>
      </Reveal>

      {/* ---------- The person behind it: closed by default ---------- */}
      <section className="wrap ab-founder">
        <details className="ab-founder-drop">
          <summary>
            <span className="eyebrow">The person behind Fanaar</span>
            <span className="ab-drop-icon" aria-hidden="true" />
          </summary>
          <div className="ab-founder-body">
            <p>
              I came to textiles from the outside — not from a family mill or a fashion house, but
              from a belief that an industry this old deserves someone willing to ask better
              questions of it. Fanaar is that belief: young, deliberately small, and run by me, one
              batch at a time. If you are reading this, you are early — I would genuinely like to{" "}
              <Link to="/pages/contact">know what you think</Link>.
            </p>
            <div className="ab-sign">
              <span className="ab-sign-name">Ali Anees</span>
              <span className="ab-sign-role">Founder, Fanaar</span>
              <a
                href={FOUNDER_SITE}
                target="_blank"
                rel="noopener"
                className="ab-avatar"
                aria-label="Ali Anees — alianees.online"
                title="alianees.online"
              >
                <img src="/images/about/ali.webp" width="40" height="40" alt="Ali Anees" />
              </a>
            </div>
          </div>
        </details>
      </section>
    </article>
  );
}
