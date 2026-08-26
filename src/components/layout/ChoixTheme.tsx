"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, SunMoon } from "lucide-react";

/**
 * Choix du thème.
 *
 * L'application suivait le réglage du système sans laisser aucun moyen d'en
 * sortir : un téléphone en mode sombre ne pouvait jamais afficher le papier
 * crème, qui est pourtant l'identité de la direction Carnet. Le réglage système
 * reste disponible, mais il se choisit.
 */

const OPTIONS = [
  { valeur: "light", libelle: "Clair", Icone: Sun },
  { valeur: "dark", libelle: "Sombre", Icone: Moon },
  { valeur: "system", libelle: "Système", Icone: SunMoon },
] as const;

export function ChoixTheme() {
  // `theme` vaut `undefined` tant que next-themes n'a pas lu le stockage local :
  // aucune option n'est donc marquée active au premier rendu, ce qui est aussi
  // ce que rend le serveur. Pas de garde de montage à ajouter.
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ valeur, libelle, Icone }) => {
        const actif = theme === valeur;
        return (
          <button
            key={valeur}
            type="button"
            onClick={() => setTheme(valeur)}
            aria-pressed={actif}
            className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm transition-colors ${
              actif
                ? "border-encre bg-encre text-papier"
                : "border-filet bg-papier-2 text-encre-2 hover:text-encre"
            }`}
          >
            <Icone className="h-4 w-4" />
            {libelle}
          </button>
        );
      })}
    </div>
  );
}
