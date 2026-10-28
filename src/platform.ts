import type { Preferences } from "./core/profile";

/** Also cached synchronously for the next launch, before IndexedDB can open. */
export function applyAppearance(theme: Preferences["theme"]) {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#252d29" : "#f4f2ec");
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", "black-translucent");
  try {
    localStorage.setItem("number-sums-appearance", theme);
  } catch {
    /* The profile remains authoritative if this optional boot cache is unavailable. */
  }
}
