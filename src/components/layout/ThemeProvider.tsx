"use client";
import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Thème clair / sombre.
 *
 * L'application forçait `class="dark"` sur <html> : le thème clair était
 * inatteignable, et next-themes était installé sans être utilisé.
 *
 * Le défaut est le papier crème, pas le réglage système : c'est l'identité de
 * la direction Carnet, et suivre le système la rendait invisible à quiconque a
 * son téléphone en mode sombre. Le sombre et le suivi système restent
 * accessibles depuis Paramètres › Apparence.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
