/**
 * Ce que l'application ne sait pas encore de quelqu'un.
 *
 * Les comptes créés avant que ces questions existent n'ont jamais été
 * interrogés : leur date de naissance, leur sexe, leur taille et leur poids
 * sont vides, et le resteront tant que personne ne le leur dit. Refaire
 * l'onboarding pour ça serait disproportionné — et surtout, ça interromprait
 * quelqu'un qui ouvre l'application pour lancer sa séance.
 *
 * Ce module dit donc ce qui manque, et à quoi ça sert. Il ne bloque rien : une
 * information absente ne doit empêcher ni de s'entraîner, ni d'ouvrir un
 * écran. Le moteur fonctionne sans, plus grossièrement.
 *
 * La règle est ici plutôt que dans l'écran parce qu'elle est vérifiable : un
 * composant React ne se teste pas dans ce projet, une fonction si.
 */

export type ChampManquant =
  | "date_naissance"
  | "sexe"
  | "taille"
  | "poids"
  | "frequence"
  | "duree";

/** Ce qu'on sait, tel que la base le porte. */
export interface EtatDuProfil {
  dateNaissance: string | null;
  sexe: string | null;
  taille: number | null;
  /** Une pesée existe-t-elle ? Le poids ne vit pas dans `users`. */
  aUnePesee: boolean;
  frequenceMinParSemaine: number | null;
  frequenceCibleParSemaine: number | null;
  frequenceMaxParSemaine: number | null;
  dureeSeanceCibleMinutes: number | null;
  dureeSeanceMaxMinutes: number | null;
}

/**
 * Ce à quoi sert chaque réponse.
 *
 * Demander une donnée sans dire ce qu'elle change est le meilleur moyen de ne
 * pas l'obtenir — et, ici, ce serait faux : chacune de ces lignes décrit un
 * usage qui existe réellement dans le code.
 */
export const POURQUOI: Record<ChampManquant, string> = {
  date_naissance: "Le coach situe ce qu'il te propose selon ton âge.",
  sexe: "Quelques repères de charge et de récupération en dépendent.",
  taille: "Sert au coach pour situer tes mesures.",
  poids: "Ouvre le suivi de ta courbe, et les exercices au poids du corps.",
  frequence: "Le programme se construit sur ta fourchette de séances par semaine.",
  duree: "La séance du jour est composée pour tenir dans ce temps.",
};

export const LIBELLES_MANQUANT: Record<ChampManquant, string> = {
  date_naissance: "Ta date de naissance",
  sexe: "Ton sexe",
  taille: "Ta taille",
  poids: "Ton poids",
  frequence: "Ta fréquence d'entraînement",
  duree: "La durée de tes séances",
};

/**
 * Ce qui manque, dans l'ordre où ça compte.
 *
 * La fréquence et la durée d'abord : ce sont les seules dont l'absence change
 * ce que le moteur PRODUIT — sans elles, la séance du jour est composée sur
 * des valeurs de repli. Les autres n'affectent que la façon dont le coach
 * parle.
 */
export function champsManquants(etat: EtatDuProfil): ChampManquant[] {
  const manquants: ChampManquant[] = [];

  const frequenceIncomplete =
    etat.frequenceMinParSemaine === null ||
    etat.frequenceCibleParSemaine === null ||
    etat.frequenceMaxParSemaine === null;
  if (frequenceIncomplete) manquants.push("frequence");

  if (etat.dureeSeanceCibleMinutes === null || etat.dureeSeanceMaxMinutes === null) {
    manquants.push("duree");
  }

  if (!etat.aUnePesee) manquants.push("poids");
  if (etat.taille === null) manquants.push("taille");
  if (etat.dateNaissance === null) manquants.push("date_naissance");
  // `non_precise` est une RÉPONSE : on ne la redemande pas. Seul `null` — la
  // question jamais posée — compte comme manquant.
  if (etat.sexe === null) manquants.push("sexe");

  return manquants;
}

/**
 * Faut-il proposer de compléter ?
 *
 * Jamais pour une seule information cosmétique : un bandeau qui réapparaît
 * pour réclamer une date de naissance devient du bruit, et on cesse de le
 * lire — y compris le jour où il dit quelque chose d'utile.
 */
export function meriteUnRappel(manquants: ChampManquant[]): boolean {
  if (manquants.includes("frequence") || manquants.includes("duree")) return true;
  return manquants.length >= 2;
}
