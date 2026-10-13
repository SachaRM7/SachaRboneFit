"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Le chemin de l'écran précédent, dans l'application.
 *
 * Une flèche « retour » écrite comme un lien ouvre une NOUVELLE page : on
 * repart en haut de la liste, et on perd le filtre qu'on regardait. Revenir
 * dans l'historique les garde — mais seulement si l'écran d'avant est bien
 * celui vers lequel la flèche pointe. Ce suivi permet de le savoir.
 */
let courant: string | null = null;
let precedent: string | null = null;

export function cheminPrecedent() {
  return precedent;
}

export function SuiviNavigation() {
  const chemin = usePathname();
  useEffect(() => {
    if (chemin === courant) return;
    precedent = courant;
    courant = chemin;
  }, [chemin]);
  return null;
}
