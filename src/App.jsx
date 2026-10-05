import { lazy, Suspense, useEffect } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { initPixel, trackPageView } from "./lib/pixel";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import ScrollToTop from "./components/ScrollToTop";
import Home from "./pages/Home";
import Collection from "./pages/Collection";
import Product from "./pages/Product";
import About from "./pages/About";
import Saved from "./pages/Saved";
import Checkout from "./pages/Checkout";
import OrderStatus from "./pages/OrderStatus";
import Contact from "./pages/Contact";
import { Shipping, Returns, Privacy } from "./pages/Policies";
import NotFound from "./pages/NotFound";

// The admin is its own bundle — shoppers never download it.
const AdminApp = lazy(() => import("./admin/AdminApp"));

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="*" element={<Storefront />} />
    </Routes>
  );
}

function Storefront() {
  const { pathname } = useLocation();

  // Meta Pixel PageView on every route change (incl. first load). Loaded
  // here rather than globally so admin sessions never report to Meta.
  useEffect(() => {
    initPixel();
    trackPageView();
  }, [pathname]);

  return (
    <>
      <ScrollToTop />
      <Header />
      <CartDrawer />
      <main className="page-offset">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections/:handle" element={<Collection />} />
          <Route path="/products/:handle" element={<Product />} />
          <Route path="/about" element={<About />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order/:id" element={<OrderStatus />} />
          <Route path="/pages/contact" element={<Contact />} />
          <Route path="/policies/shipping-policy" element={<Shipping />} />
          <Route path="/policies/refund-policy" element={<Returns />} />
          <Route path="/policies/privacy-policy" element={<Privacy />} />
          {/* Short aliases */}
          <Route path="/contact" element={<Navigate to="/pages/contact" replace />} />
          <Route path="/shipping" element={<Navigate to="/policies/shipping-policy" replace />} />
          <Route path="/returns" element={<Navigate to="/policies/refund-policy" replace />} />
          <Route path="/privacy" element={<Navigate to="/policies/privacy-policy" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
