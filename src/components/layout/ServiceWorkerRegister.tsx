"use client";
import { useEffect } from "react";

/**
 * Enregistrement du service worker.
 *
 * L'enregistrement etait pose une fois et jamais revu. Un service worker
 * defectueux deja installe gardait donc la main indefiniment : c'est ainsi
 * qu'une version qui mettait en cache une reponse redirigee a pu rendre la
 * navigation impossible, sans qu'aucun deploiement ne puisse la corriger — le
 * navigateur ne verifiait le fichier qu'au gre de ses propres heuristiques.
 *
 * On demande donc explicitement une verification a chaque montage, et on
 * recharge une fois quand un nouveau service worker prend la main.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // `controllerchange` se declenche aussi au tout premier enregistrement. Le
    // controleur y est deja le nouveau, donc le tester dans le gestionnaire ne
    // distingue rien : c'est son etat *avant* qui dit s'il y a remplacement.
    const avaitUnControleur = Boolean(navigator.serviceWorker.controller);
    let recharge = false;
    const surChangement = () => {
      if (recharge || !avaitUnControleur) return;
      recharge = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", surChangement);

    navigator.serviceWorker
      .register("/sw.js")
      .then((enregistrement) => enregistrement.update())
      .catch(console.error);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", surChangement);
    };
  }, []);

  return null;
}
