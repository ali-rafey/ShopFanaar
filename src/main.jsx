import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { CatalogProvider } from "./context/CatalogContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { SavedProvider } from "./context/SavedContext.jsx";
import "./fonts.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <CatalogProvider>
        <SavedProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </SavedProvider>
      </CatalogProvider>
    </BrowserRouter>
  </React.StrictMode>
);
