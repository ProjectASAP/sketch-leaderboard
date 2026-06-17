import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { BenchmarkProvider } from "./context/BenchmarkContext";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BenchmarkProvider>
      <App />
    </BenchmarkProvider>
  </React.StrictMode>
);