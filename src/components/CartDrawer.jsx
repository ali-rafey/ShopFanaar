import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { formatPrice } from "../data/store";
import { trackInitiateCheckout } from "../lib/pixel";

export default function CartDrawer() {
  const { items, open, setOpen, updateQty, remove, subtotal } = useCart();

  return (
    <>
      <div
        className={`drawer-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`drawer ${open ? "open" : ""}`}>
        <div className="drawer-head">
          <h3>Your Cart</h3>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="drawer-empty">Your cart is currently empty.</div>
          ) : (
            items.map((i) => (
              <div className="line" key={i.key}>
                <Link to={`/products/${i.handle}`} onClick={() => setOpen(false)}>
                  <img src={i.image} alt={i.title} />
                </Link>
                <div className="line-info">
                  <div className="t">{i.title}</div>
                  <div className="s">Size: {i.size}</div>
                  <div className="qty">
                    <button onClick={() => updateQty(i.key, i.qty - 1)}>−</button>
                    <span>{i.qty}</span>
                    <button onClick={() => updateQty(i.key, i.qty + 1)}>+</button>
                  </div>
                  <div>
                    <button className="line-remove" onClick={() => remove(i.key)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="s">{formatPrice(i.price * i.qty)}</div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="drawer-foot">
            <div className="subtotal">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <button
              className="btn-dark"
              onClick={() => {
                trackInitiateCheckout(items, subtotal);
                alert(
                  "This is an independent demo store — checkout is not connected."
                );
              }}
            >
              Checkout
            </button>
            <div className="drawer-note">
              Taxes and shipping calculated at checkout.
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
