"use client";
import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Thème clair / sombre.
 *
 * L'application forçait `class="dark"` sur <html> : le thème clair était
 * inatteignable, et next-themes était installé sans être utilisé. Les tokens
 * Carnet répondent à `.dark` comme à `prefers-color-scheme`, donc le réglage
 * système est respecté par défaut.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
