import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BACKEND, bundledCatalog, fetchCatalog } from "../lib/api";
import { colorwaysFor, relatedFor } from "../lib/catalog";

const CatalogContext = createContext(null);
const CACHE_KEY = "fanaar-catalog-v1";

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c && Array.isArray(c.products) ? c : null;
  } catch {
    return null;
  }
}

// Returning visitors render instantly from the last catalog they saw while a
// fresh copy loads; first-time visitors see skeletons for one round trip.
function initialState() {
  if (BACKEND === "static") return { ...bundledCatalog(), status: "ready" };
  const cached = readCache();
  if (cached) return { ...cached, status: "ready" };
  return { ...bundledCatalog(), products: [], status: "loading" };
}

export function CatalogProvider({ children }) {
  const [state, setState] = useState(initialState);
  const inflight = useRef(null);

  const refresh = useCallback(() => {
    if (BACKEND === "static") return Promise.resolve();
    if (inflight.current) return inflight.current;
    inflight.current = fetchCatalog()
      .then((catalog) => {
        setState({ ...catalog, status: "ready" });
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
        } catch {
          /* storage full or blocked — the live copy is still in memory */
        }
      })
      .catch(() => {
        // Backend unreachable: keep whatever we're showing, or fall back to
        // the bundled catalog rather than an empty store. Checkout still
        // re-validates everything server-side.
        setState((s) => (s.status === "ready" ? s : { ...bundledCatalog(), status: "ready" }));
      })
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => {
    const { products, collections } = state;
    const byHandle = new Map(products.map((p) => [p.handle, p]));
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      ...state,
      ready: state.status === "ready",
      refresh,
      getProduct: (handle) => byHandle.get(handle),
      getProductById: (id) => byId.get(id),
      getProductsByIds: (ids = []) => ids.map((id) => byId.get(id)).filter(Boolean),
      getCollection: (handle) => ({
        meta: collections.find((c) => c.handle === handle),
        items: products.filter((p) => p.collections.includes(handle)),
      }),
      getRelated: (product, limit) => relatedFor(products, product, limit),
      getColorways: (product) => colorwaysFor(products, product),
    };
  }, [state, refresh]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export const useCatalog = () => useContext(CatalogContext);
