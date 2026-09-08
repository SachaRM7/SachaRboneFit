"use client";
import { ThemeProvider as NextThemes } from "next-themes";

/** Thème clair par défaut ; le choix sombre ou système reste mémorisé. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
