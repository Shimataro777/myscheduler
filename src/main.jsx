import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* 起き上がりの絵を消す。index.html のなかに直接書いてある */
if (window.__hibiHideSplash) window.__hibiHideSplash();
