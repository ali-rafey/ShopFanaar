import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { shop } from "../data/store";
import { useCart } from "../context/CartContext";

const SHOP_LINKS = [
  { to: "/collections/all-top", label: "All Top" },
  { to: "/collections/shirts", label: "Shirts" },
  { to: "/collections/t-shirts", label: "T-Shirts" },
  { to: "/collections/quarter-zipper", label: "Sweatshirts" },
  { to: "/collections/basics", label: "Polo" },
  { to: "/collections/bottoms", label: "Bottoms" },
];

export default function Header() {
  const { count, setOpen } = useCart();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isHome = pathname === "/";
  const transparent = isHome && !scrolled;
  const headerClass = menuOpen
    ? "header--overlay"
    : transparent
    ? "header--transparent"
    : "header--solid";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close menu + reset scroll state on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // lock body scroll when overlay menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header className={`header ${headerClass}`}>
        <div className="wrap header-inner">
          {/* left: desktop nav / mobile burger */}
          <div className="header-left">
            <nav className="nav">
              <div className="dropdown">
                <button className="navitem">Shop Fänaar</button>
                <div className="dropdown-menu">
                  {SHOP_LINKS.map((l) => (
                    <Link key={l.to} to={l.to}>
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="dropdown">
                <button className="navitem">Autonomy by Fänaar</button>
                <div className="dropdown-menu">
                  <Link to="/collections/frontpage">Drop Needle</Link>
                </div>
              </div>
              <Link to="/about" className="navitem">
                About
              </Link>
            </nav>

            <button
              className={`burger ${menuOpen ? "is-open" : ""}`}
              aria-label="Menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>

          {/* center: logo */}
          <Link to="/" className="logo" aria-label="Fänaar home">
            <img src={shop.logo} alt={shop.name} />
          </Link>

          {/* right: actions */}
          <div className="header-actions">
            <Link to="/collections/all-top" className="icon-btn shop-link">
              Shop
            </Link>
            <button className="icon-btn" onClick={() => setOpen(true)}>
              Cart{count > 0 && <span className="cart-count">({count})</span>}
            </button>
          </div>
        </div>
      </header>

      {/* full-screen mobile overlay menu */}
      <div className={`overlay-menu ${menuOpen ? "open" : ""}`}>
        <div className="overlay-inner">
          <nav className="overlay-nav">
            <span className="overlay-label">Shop</span>
            {SHOP_LINKS.map((l, i) => (
              <Link
                key={l.to}
                to={l.to}
                style={{ transitionDelay: `${0.05 + i * 0.04}s` }}
              >
                {l.label}
              </Link>
            ))}
            <span className="overlay-label">Autonomy by Fänaar</span>
            <Link
              to="/collections/frontpage"
              style={{ transitionDelay: `${0.05 + SHOP_LINKS.length * 0.04}s` }}
            >
              Drop Needle
            </Link>
            <Link
              to="/about"
              style={{
                transitionDelay: `${0.05 + (SHOP_LINKS.length + 1) * 0.04}s`,
              }}
            >
              About
            </Link>
          </nav>
          <div className="overlay-foot">
            <a href={shop.social.instagram} target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href={shop.social.pinterest} target="_blank" rel="noreferrer">
              Pinterest
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
