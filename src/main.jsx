import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { SavedProvider } from "./context/SavedContext.jsx";
import { initPixel } from "./lib/pixel.js";
import "./fonts.css";
import "./styles.css";

initPixel();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <SavedProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </SavedProvider>
    </BrowserRouter>
  </React.StrictMode>
);
