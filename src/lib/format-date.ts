/**
 * Afficher une date de séance sans la décaler d'un jour.
 *
 * Les dates de ce modèle sont des JOURS — `2026-09-03`, pas un instant. Or
 * `new Date("2026-09-03")` est interprété par la norme comme minuit UTC, et
 * `toLocaleDateString` le rend ensuite dans le fuseau du téléphone. À l'ouest
 * de Greenwich, minuit UTC tombe la veille : la séance du 3 s'affiche « 2
 * septembre ». En France, l'écart passe inaperçu la moitié de l'année — et
 * réapparaît chez quelqu'un qui voyage, ou dont le téléphone est réglé
 * autrement.
 *
 * On ancre donc à midi. Douze heures de marge de chaque côté : aucun fuseau
 * habité ne fait basculer le jour.
 *
 * Ce raisonnement était écrit cinq fois dans l'application, sous la forme d'un
 * `T12:00:00` recopié — et manquait aux deux endroits qui en avaient le plus
 * besoin, les graphiques, dont l'axe portait donc des dates décalées.
 */

/** L'instant qui représente ce jour, quel que soit le fuseau du lecteur. */
export function midiLocal(jour: string): Date {
  return new Date(`${jour}T12:00:00`);
}

/** « 3 sept. » — pour un axe de graphique, où la place manque. */
export function jourCourt(jour: string): string {
  return midiLocal(jour).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** « 3 septembre » — dans une phrase. */
export function jourEnToutesLettres(jour: string): string {
  return midiLocal(jour).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** « mer. 3 septembre » — pour une liste d'historique, où le jour aide. */
export function jourAvecJourDeSemaine(jour: string): string {
  return midiLocal(jour).toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "long",
  });
}

/** « septembre 2026 » — un en-tête de mois, à partir d'un `AAAA-MM`. */
export function moisEnToutesLettres(mois: string): string {
  return midiLocal(`${mois}-01`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
