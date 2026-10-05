import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { trackAddToCart } from "../lib/pixel";
import { useCatalog } from "./CatalogContext";

const CartContext = createContext(null);
const STORAGE_KEY = "fanaar-cart";

export function CartProvider({ children }) {
  const catalog = useCatalog();
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Stored lines keep a snapshot for display before the catalog loads; once
  // it has, price/title/image/stock always come from the live product.
  // `available` is null while unknown, 0 when the product or size is gone.
  const lines = useMemo(
    () =>
      items.map((i) => {
        if (!catalog.ready) return { ...i, available: null };
        const p = catalog.getProductById(i.id);
        const v = p?.sizes.find((s) => s.size === i.size);
        return {
          ...i,
          title: p?.title ?? i.title,
          handle: p?.handle ?? i.handle,
          image: p?.images[0] ?? i.image,
          price: p?.price ?? i.price,
          available: v ? v.qty : 0,
        };
      }),
    [items, catalog]
  );

  const availableFor = (key) => lines.find((l) => l.key === key)?.available;
  const cap = (qty, available) => (available == null ? qty : Math.min(qty, available));

  function add(product, size, qty = 1) {
    const key = `${product.id}-${size}`;
    const stock = product.sizes.find((s) => s.size === size)?.qty;
    trackAddToCart(product, size, qty);
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) =>
          i.key === key ? { ...i, qty: cap(i.qty + qty, stock) } : i
        );
      }
      return [
        ...prev,
        {
          key,
          id: product.id,
          handle: product.handle,
          title: product.title,
          price: product.price,
          image: product.images[0],
          size,
          qty: cap(qty, stock),
        },
      ];
    });
    setOpen(true);
  }

  function updateQty(key, qty) {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) =>
            i.key === key ? { ...i, qty: cap(qty, availableFor(key)) } : i
          )
    );
  }

  function remove(key) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function clear() {
    setItems([]);
  }

  const count = useMemo(() => lines.reduce((n, i) => n + i.qty, 0), [lines]);
  const subtotal = useMemo(
    () => lines.reduce((n, i) => n + i.qty * i.price, 0),
    [lines]
  );

  return (
    <CartContext.Provider
      value={{ items: lines, add, updateQty, remove, clear, count, subtotal, open, setOpen }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
