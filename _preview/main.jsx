import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DartTurnier from "../dart-turnier.jsx";

// Polyfill window.storage → localStorage so the app persists state in preview
if (!window.storage) {
  window.storage = {
    set: (key, val) => Promise.resolve(localStorage.setItem(key, val)),
    get: (key) => {
      const v = localStorage.getItem(key);
      return Promise.resolve(v ? { value: v } : null);
    },
    delete: (key) => Promise.resolve(localStorage.removeItem(key)),
  };
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <DartTurnier />
  </StrictMode>
);
