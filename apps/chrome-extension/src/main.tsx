import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { initializeUiLocale } from "./i18n";

const preferredTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
document.documentElement.dataset.theme = preferredTheme;
void chrome.storage.local.get("finfoldTheme").then(({ finfoldTheme }) => {
  if (finfoldTheme === "light" || finfoldTheme === "dark") document.documentElement.dataset.theme = finfoldTheme;
}).catch(() => undefined);

void initializeUiLocale().catch(() => undefined).finally(() => createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
));
