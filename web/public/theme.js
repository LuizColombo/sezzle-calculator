// Applies the colour theme before first paint, so a reload never flashes the
// wrong theme. A separate file (not inline) so the Content Security Policy can
// stay script-src 'self'. Mirrors src/features/calculator/hooks/useTheme.ts.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("sezzle-calculator.theme");
  } catch (e) {
    // Storage disabled: fall back to the system preference.
  }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#000000" : "#f2f2f7");
})();
