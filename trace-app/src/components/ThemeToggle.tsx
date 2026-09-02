"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "trace-theme";

/** Keep in sync with the inline bootstrap script in layout.tsx. */
function applyTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Dark/light toggle. TRACE defaults to dark (set synchronously by the inline
 * script in layout.tsx before hydration, so there's no flash and no
 * server/client mismatch); this component only needs to reflect and change
 * whatever `data-theme` is already on <html> by the time it mounts.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "dark" | "light") || "dark");
  }, []);

  if (!theme) {
    // Avoid rendering an icon that might not match the real theme before
    // the effect above reads it back off the DOM.
    return <span className="w-9 h-9 inline-block" aria-hidden="true" />;
  }

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
