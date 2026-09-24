import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { MsalAppProviders } from "@/auth/MsalAppProviders";
import { ToastProvider } from "@/state/toastContext";
import { ThemeProvider } from "@/state/themeContext";
import "@/styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <MsalAppProviders>
          <ToastProvider>
            <App />
          </ToastProvider>
        </MsalAppProviders>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
