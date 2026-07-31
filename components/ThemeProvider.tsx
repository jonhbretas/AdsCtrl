"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  attribute?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "dark",
  setTheme: () => null,
});

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  enableSystem = true,
  disableTransitionOnChange = false,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    const saved = window.localStorage.getItem("adsctrl:theme") as Theme | null;
    return saved === "dark" || saved === "light" || (enableSystem && saved === "system") ? saved : defaultTheme;
  });

  useEffect(() => {
    const saved = window.localStorage.getItem("adsctrl:theme") as Theme | null;
    if (saved === "dark" || saved === "light" || (enableSystem && saved === "system")) setThemeState(saved);
  }, [enableSystem]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem("adsctrl:theme", next);
  };

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", isDark);
    root.dataset.theme = isDark ? "dark" : "light";
    root.style.colorScheme = isDark ? "dark" : "light";
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    if (disableTransitionOnChange) {
      root.classList.add("no-transitions");
      setTimeout(() => root.classList.remove("no-transitions"), 0);
    }

    const handler = () => {
      if (theme === "system") {
        const systemDark = mediaQuery.matches;
        root.classList.toggle("dark", systemDark);
        root.dataset.theme = systemDark ? "dark" : "light";
        root.style.colorScheme = systemDark ? "dark" : "light";
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme, disableTransitionOnChange]);

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeProviderContext);
