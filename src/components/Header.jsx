import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { shop, categoryTiles, craft } from "../data/store";
import { useCart } from "../context/CartContext";
import { useSaved } from "../context/SavedContext";
import SocialIcons from "./SocialIcons";

const SHOP_LINKS = [
  { to: "/collections/all-top", label: "All Top" },
  { to: "/collections/shirts", label: "Shirts" },
  { to: "/collections/t-shirts", label: "T-Shirts" },
  { to: "/collections/quarter-zipper", label: "Sweatshirts" },
  { to: "/collections/basics", label: "Polo" },
  { to: "/collections/bottoms", label: "Bottoms" },
];

function IconHeart() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 8.4a4.4 4.4 0 0 1 7.5 2.5c0 4.9-7.5 9.6-7.5 9.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBag() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        d="M6 8h12l-1 12H7L6 8zm3 0V6.5a3 3 0 0 1 6 0V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Header() {
  const { count, setOpen } = useCart();
  const { count: savedCount } = useSaved();
  const { pathname } = useLocation();

  const [scrolled, setScrolled] = useState(false);
  const [mega, setMega] = useState(null); // 'shop' | 'autonomy' | null
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef(null);
  const closeTimer = useRef(null);

  // Always a readable solid bar — the site is white end-to-end, so a
  // transparent white-on-image header would be illegible.
  const headerClass = mobileOpen ? "header--overlay" : "header--solid";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close everything on navigation.
  useEffect(() => {
    setMega(null);
    setMobileOpen(false);
  }, [pathname]);

  // Escape closes; click outside closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMega(null);
        setMobileOpen(false);
      }
    };
    const onDown = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setMega(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);

  // Lock scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Hover intent: open immediately, close with a small grace period so moving
  // the pointer into the panel never dismisses it.
  const openMega = useCallback((key) => {
    clearTimeout(closeTimer.current);
    setMega(key);
  }, []);
  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMega(null), 180);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <>
      <header
        ref={headerRef}
        className={`header ${headerClass} ${mega ? "header--mega" : ""} ${
          scrolled ? "is-scrolled" : ""
        }`}
        onMouseLeave={scheduleClose}
      >
        <div className="wrap header-inner">
          <div className="header-left">
            <nav className="nav" aria-label="Main">
              <button
                className={`navitem ${mega === "shop" ? "is-active" : ""}`}
                aria-expanded={mega === "shop"}
                aria-haspopup="true"
                onMouseEnter={() => openMega("shop")}
                onFocus={() => openMega("shop")}
                onClick={() => setMega((m) => (m === "shop" ? null : "shop"))}
              >
                Shop Fanaar
              </button>
              <button
                className={`navitem ${mega === "autonomy" ? "is-active" : ""}`}
                aria-expanded={mega === "autonomy"}
                aria-haspopup="true"
                onMouseEnter={() => openMega("autonomy")}
                onFocus={() => openMega("autonomy")}
                onClick={() =>
                  setMega((m) => (m === "autonomy" ? null : "autonomy"))
                }
              >
                Autonomy
              </button>
              <Link
                to="/about"
                className="navitem"
                onMouseEnter={() => openMega(null)}
              >
                About
              </Link>
            </nav>

            <button
              className={`burger ${mobileOpen ? "is-open" : ""}`}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>

          <Link to="/" className="logo" aria-label="Fanaar — home">
            <img src={shop.logo} alt={shop.name} />
          </Link>

          <div className="header-actions">
            <Link
              to="/saved"
              className="icon-btn"
              aria-label={`Saved items${savedCount ? ` (${savedCount})` : ""}`}
            >
              <IconHeart />
              <span className="icon-label">Saved</span>
              {savedCount > 0 && <span className="pip">{savedCount}</span>}
            </Link>
            <button
              className="icon-btn"
              onClick={() => setOpen(true)}
              aria-label={`Open cart${count ? ` (${count})` : ""}`}
            >
              <IconBag />
              <span className="icon-label">Cart</span>
              {count > 0 && <span className="pip">{count}</span>}
            </button>
          </div>
        </div>

        {/* Mega panel — attached directly beneath the bar, so there is no
            dead gap that could drop the hover state. */}
        <div
          className={`mega ${mega ? "open" : ""}`}
          onMouseEnter={() => clearTimeout(closeTimer.current)}
        >
          <div className="wrap mega-inner">
            {mega === "shop" && (
              <>
                <div className="mega-col">
                  <span className="mega-label">Categories</span>
                  <ul className="mega-list">
                    {SHOP_LINKS.map((l) => (
                      <li key={l.to}>
                        <Link to={l.to}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mega-tiles">
                  {categoryTiles.slice(0, 4).map((c) => (
                    <Link
                      key={c.handle}
                      to={`/collections/${c.handle}`}
                      className="mega-tile"
                    >
                      <div className="mega-tile-img">
                        <img src={c.image} alt={c.title} loading="lazy" />
                      </div>
                      <span>{c.title}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {mega === "autonomy" && (
              <>
                <div className="mega-col">
                  <span className="mega-label">Autonomy by Fanaar</span>
                  <ul className="mega-list">
                    <li>
                      <Link to="/collections/frontpage">Drop Needle</Link>
                    </li>
                    <li>
                      <Link to="/about">Knitting &amp; Weaving</Link>
                    </li>
                    <li>
                      <Link to="/collections/all-top">All Pieces</Link>
                    </li>
                  </ul>
                </div>
                <div className="mega-feature">
                  <Link to={craft.cta.to} className="mega-feature-img">
                    <img src={craft.image} alt={craft.title} loading="lazy" />
                  </Link>
                  <div className="mega-feature-copy">
                    <h4>{craft.title}</h4>
                    <p>{craft.body}</p>
                    <Link to={craft.cta.to} className="link-underline">
                      {craft.cta.label}
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile full-screen menu */}
      <div className={`overlay-menu ${mobileOpen ? "open" : ""}`}>
        <div className="overlay-inner">
          <nav className="overlay-nav">
            <span className="overlay-label">Shop</span>
            {SHOP_LINKS.map((l, i) => (
              <Link
                key={l.to}
                to={l.to}
                style={{ transitionDelay: `${0.05 + i * 0.035}s` }}
              >
                {l.label}
              </Link>
            ))}
            <span className="overlay-label">Autonomy by Fanaar</span>
            <Link
              to="/collections/frontpage"
              style={{ transitionDelay: `${0.05 + SHOP_LINKS.length * 0.035}s` }}
            >
              Drop Needle
            </Link>
            <Link
              to="/about"
              style={{
                transitionDelay: `${0.05 + (SHOP_LINKS.length + 1) * 0.035}s`,
              }}
            >
              About
            </Link>
            <Link
              to="/saved"
              style={{
                transitionDelay: `${0.05 + (SHOP_LINKS.length + 2) * 0.035}s`,
              }}
            >
              Saved{savedCount > 0 ? ` (${savedCount})` : ""}
            </Link>
          </nav>
          <SocialIcons className="overlay-foot" size={32} />
        </div>
      </div>
    </>
  );
}
