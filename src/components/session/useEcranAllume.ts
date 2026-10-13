"use client";
import { useEffect } from "react";

/**
 * Garder l'écran allumé tant que la séance est ouverte.
 *
 * Pendant un repos de deux minutes, l'iPhone se verrouillait : la page était
 * alors suspendue, le bip de fin ne partait jamais et il fallait déverrouiller
 * pour retrouver sa série. L'API Screen Wake Lock (Safari 16.4+, et en mode
 * écran d'accueil depuis iOS 18.4) l'empêche.
 *
 * Le navigateur relâche le verrou dès que la page passe en arrière-plan : on le
 * redemande au retour. Là où l'API manque ou refuse (batterie faible), rien ne
 * change — l'écran se met en veille comme avant.
 */
export function useEcranAllume(actif: boolean) {
  useEffect(() => {
    if (!actif || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let verrou: WakeLockSentinel | null = null;
    let annule = false;

    const demander = async () => {
      if (document.visibilityState !== "visible" || (verrou && !verrou.released)) return;
      try {
        const obtenu = await navigator.wakeLock.request("screen");
        if (annule) void obtenu.release();
        else verrou = obtenu;
      } catch {
        // Refusé (économie d'énergie, page non visible) : on fait sans.
      }
    };

    void demander();
    document.addEventListener("visibilitychange", demander);
    return () => {
      annule = true;
      document.removeEventListener("visibilitychange", demander);
      void verrou?.release().catch(() => {});
    };
  }, [actif]);
}
