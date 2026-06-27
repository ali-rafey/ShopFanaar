import { Link } from "react-router-dom";
import { shop } from "../data/store";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-connect">
          <h4>Newsletter</h4>
          <h3>let's connect like old friends</h3>
          <form className="newsletter" onSubmit={(e) => e.preventDefault()}>
            <input type="email" placeholder="Enter your email" />
            <button type="submit">Subscribe</button>
          </form>
          <p style={{ marginTop: 22, fontSize: 12, color: "#666" }}>
            {shop.origin}, by passionate individuals — sophisticated yet
            comfortable.
          </p>
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
          <h4>Information</h4>
          <ul>
            <li><Link to="/about">About Us</Link></li>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Refund Policy</a></li>
            <li><a href="#">Shipping Policy</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
          <h4 style={{ marginTop: 26 }}>Follow</h4>
          <ul>
            <li><a href={shop.social.instagram} target="_blank" rel="noreferrer">Instagram</a></li>
            <li><a href={shop.social.pinterest} target="_blank" rel="noreferrer">Pinterest</a></li>
          </ul>
        </div>
      </div>

      <div className="wrap footer-bottom">
        <span>© {new Date().getFullYear()}, Fänaar</span>
        <span>Faisalabad, Pakistan</span>
      </div>
    </footer>
  );
}
