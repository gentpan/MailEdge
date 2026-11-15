import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { I18nProvider } from "./i18n";
import { applyCornerStyle, getCornerStyle } from "./lib/corners";
import "@fontsource-variable/stack-sans-notch";
import "./styles/tokens.css";
import "./styles/app.css";

// 渲染前先套上圆角主题，避免切换闪烁
applyCornerStyle(getCornerStyle());

const container = document.getElementById("root");
if (!container) throw new Error("找不到 #root 挂载点");

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
