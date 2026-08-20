import { Link } from "react-router-dom";
import { shop } from "../data/store";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <img src={shop.logo} alt={shop.name} className="footer-logo" />
          <p>
            {shop.origin}, by passionate individuals — sophisticated yet
            comfortable.
          </p>
          <div className="footer-social">
            <a href={shop.social.instagram} target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href={shop.social.pinterest} target="_blank" rel="noreferrer">
              Pinterest
            </a>
          </div>
        </div>

        <div>
          <h4>Shop</h4>
          <ul>
            <li><Link to="/collections/all-top">All Top</Link></li>
            <li><Link to="/collections/shirts">Shirts</Link></li>
            <li><Link to="/collections/t-shirts">T-Shirts</Link></li>
            <li><Link to="/collections/quarter-zipper">Sweatshirts</Link></li>
            <li><Link to="/collections/basics">Polo</Link></li>
            <li><Link to="/collections/bottoms">Bottoms</Link></li>
          </ul>
        </div>

        <div>
          <h4>Autonomy</h4>
          <ul>
            <li><Link to="/collections/frontpage">Drop Needle</Link></li>
            <li><Link to="/about">Knitting &amp; Weaving</Link></li>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/saved">Saved</Link></li>
          </ul>
        </div>

        <div>
          <h4>Information</h4>
          <ul>
            <li><Link to="/about">Contact</Link></li>
            <li><Link to="/about">Shipping</Link></li>
            <li><Link to="/about">Returns</Link></li>
            <li><Link to="/about">Privacy</Link></li>
          </ul>
        </div>
      </div>

      <div className="wrap footer-bottom">
        <span>© {new Date().getFullYear()}, Fanaar</span>
        <span>Faisalabad, Pakistan</span>
      </div>
    </footer>
  );
}
