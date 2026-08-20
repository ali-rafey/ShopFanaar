import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { trackPageView } from "./lib/pixel";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import ScrollToTop from "./components/ScrollToTop";
import Home from "./pages/Home";
import Collection from "./pages/Collection";
import Product from "./pages/Product";
import About from "./pages/About";
import Saved from "./pages/Saved";
import NotFound from "./pages/NotFound";

export default function App() {
  const { pathname } = useLocation();

  // Meta Pixel PageView on every route change (incl. first load)
  useEffect(() => {
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
