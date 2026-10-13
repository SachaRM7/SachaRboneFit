"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * Fermer une feuille en la tirant vers le bas, comme une feuille iOS.
 *
 * Les feuilles faites avec vaul (`Drawer`) le savaient déjà ; les autres —
 * fenêtres Base UI posées en bas, panneaux SOS écrits à la main — ne se
 * fermaient qu'avec leur croix, souvent tout en haut, hors de portée du pouce.
 *
 * Le geste ne démarre que si le contenu est déjà défilé tout en haut : sinon
 * tirer vers le bas fait défiler, comme partout ailleurs. Il ignore les champs
 * et les curseurs, et ne fait rien sans écran tactile.
 *
 * Renvoie une ref à poser sur le PANNEAU (l'élément qui doit bouger).
 * `onFermer` est appelé une fois la feuille sortie de l'écran ; le style est
 * ensuite rendu, au cas où le panneau resterait monté.
 */
export function useGlisserPourFermer<T extends HTMLElement>(onFermer: (() => void) | null | undefined) {
  const fermerRef = useRef(onFermer);
  useEffect(() => {
    fermerRef.current = onFermer;
  });

  return useCallback((panneau: T | null) => {
    if (!panneau) return;

    let departY: number | null = null;
    let departT = 0;
    let decalage = 0;
    let glisse = false;

    const enHaut = (cible: EventTarget | null) => {
      for (let el = cible as HTMLElement | null; el && el !== panneau.parentElement; el = el.parentElement) {
        if (el.scrollTop > 0) return false;
      }
      return true;
    };

    const poser = (transform: string, transition: string) => {
      panneau.style.transition = transition;
      panneau.style.transform = transform;
    };

    const debut = (e: TouchEvent) => {
      departY = null;
      if (!fermerRef.current || e.touches.length !== 1) return;
      const cible = e.target as HTMLElement;
      if (cible.closest("input, textarea, select, [role='slider'], [data-sans-glisse]")) return;
      if (!enHaut(cible)) return;
      departY = e.touches[0]!.clientY;
      departT = performance.now();
      decalage = 0;
      glisse = false;
    };

    const mouvement = (e: TouchEvent) => {
      if (departY === null) return;
      decalage = e.touches[0]!.clientY - departY;
      if (!glisse) {
        if (decalage < -4) { departY = null; return; }
        if (decalage < 8) return;
        glisse = true;
      }
      if (e.cancelable) e.preventDefault();
      poser(`translateY(${Math.max(0, decalage - 8)}px)`, "none");
    };

    const fin = () => {
      if (departY === null || !glisse) { departY = null; return; }
      departY = null;
      glisse = false;
      const vitesse = decalage / Math.max(1, performance.now() - departT);
      if (decalage > 110 || (decalage > 40 && vitesse > 0.6)) {
        poser("translateY(100%)", "transform 180ms ease-in");
        window.setTimeout(() => {
          fermerRef.current?.();
          // Si le panneau reste monté (repos replié en pastille), il reprend sa place.
          window.setTimeout(() => poser("", ""), 60);
        }, 170);
      } else {
        poser("", "transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1)");
      }
    };

    panneau.addEventListener("touchstart", debut, { passive: true });
    panneau.addEventListener("touchmove", mouvement, { passive: false });
    panneau.addEventListener("touchend", fin);
    panneau.addEventListener("touchcancel", fin);
    return () => {
      panneau.removeEventListener("touchstart", debut);
      panneau.removeEventListener("touchmove", mouvement);
      panneau.removeEventListener("touchend", fin);
      panneau.removeEventListener("touchcancel", fin);
    };
  }, []);
}
