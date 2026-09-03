/**
 * Ce que l'application a à proposer aujourd'hui.
 *
 * L'accueil décidait ça lui-même, dans le rendu, et n'avait qu'une réponse
 * quand il ne savait pas : « Aucune séance programmée », avec un bouton
 * Démarrer qui partait sans salle. Un compte neuf tombait donc sur un écran
 * qui constatait son propre vide.
 *
 * La règle tenue ici : il y a toujours une prochaine action, et cette action
 * est ce qui manque réellement. Quand l'application ne sait pas encore ce
 * qu'une salle permet de faire, elle ne peut pas inventer une séance — elle
 * pose la question. Ce n'est pas un écran d'erreur, c'est l'étape suivante.
 */

export interface Salle {
  id: string;
  nom: string;
}

export interface SeanceProgrammee {
  templateId: string;
  lettre: string;
  nom: string;
}

/**
 * Une salle telle que la base la rend : lisible par tous, tenue par quelqu'un.
 *
 * `userId` désigne le responsable du lieu, pas son public. Le schéma le dit :
 * une salle et ses machines décrivent un lieu, pas un pratiquant, et deux
 * comptes qui s'y entraînent y trouvent la même chose.
 */
export interface SalleConnue {
  id: string;
  userId: string | null;
}

/**
 * Quelle salle proposer aujourd'hui, parmi celles que l'application connaît.
 *
 * Deux règles, et l'ordre compte :
 *
 *   1. la préférence posée à l'onboarding, si le lieu existe encore ;
 *   2. à défaut, l'unique salle DU COMPTE — « il n'y en a qu'une, c'est donc
 *      celle-là ».
 *
 * C'est le mot « du compte » qui manquait. La règle 2 comptait toutes les
 * salles lisibles, c'est-à-dire celles de toute la base : un compte sans aucun
 * lieu, à côté d'un compte qui en a exactement un, se voyait proposer la salle
 * du voisin comme salle du jour — avec son inventaire pour construire la
 * séance et le lien de démarrage qui va avec.
 *
 * Le partage lui-même n'est pas en cause et reste entier : désigner
 * explicitement la salle d'un autre comme sienne (règle 1) continue de
 * fonctionner, c'est même le cas normal quand deux personnes s'entraînent au
 * même endroit. Ce qu'on retire, c'est la DÉDUCTION faite à sa place.
 */
export function choisirSalleDuJour<T extends SalleConnue>(
  compte: { id: string; prefSalleParDefautId: string | null },
  sallesConnues: T[],
): T | null {
  const preferee = compte.prefSalleParDefautId
    ? sallesConnues.find((s) => s.id === compte.prefSalleParDefautId) ?? null
    : null;
  if (preferee) return preferee;

  const siennes = sallesConnues.filter((s) => s.userId === compte.id);
  return siennes.length === 1 ? siennes[0]! : null;
}

export interface EntreeEtatDuJour {
  /** Salle du jour : préférence de l'utilisateur, ou unique salle active. */
  salle: Salle | null;
  /**
   * Exercices que ce lieu permet de faire : appareils décrits ET exercices
   * déduits du matériel déclaré.
   */
  exercicesRealisablesIci: number;
  /**
   * Quelqu'un a-t-il décrit ce lieu ?
   *
   * Distincte du compte ci-dessus : le poids du corps est disponible partout,
   * donc un lieu inconnu n'est jamais à zéro. Sans cette question, on aurait
   * proposé une séance de pompes à quelqu'un debout dans une salle équipée,
   * au lieu de lui demander ce qu'elle contient.
   */
  lieuRenseigne: boolean;
  prochaineSeance: SeanceProgrammee | null;
  /** Une séance a déjà été enregistrée aujourd'hui. */
  seanceFaiteAujourdhui: boolean;
  /** Le bloc actif est une phase de calibration. */
  enCalibration: boolean;
  seancesCetteSemaine: number;
  frequenceMaxParSemaine: number | null;
}

/** Ce que l'utilisateur peut faire maintenant. Le libellé appartient à l'écran. */
export type ActionDuJour =
  | { type: "choisir_salle"; href: "/gyms" }
  | { type: "equiper_salle"; href: string }
  | { type: "demarrer_calibration"; href: "/session/calibration" }
  | { type: "demarrer_seance"; href: string; templateId: string }
  | { type: "voir_progression"; href: "/progression" };

export type NomEtat =
  | "sans_salle"
  | "salle_vide"
  | "calibration"
  | "prete"
  | "deja_entraine"
  | "semaine_complete";

export interface EtatDuJour {
  etat: NomEtat;
  salle: Salle | null;
  seance: SeanceProgrammee | null;
  action: ActionDuJour;
  /** Vrai quand l'application n'a pas encore de quoi construire une séance. */
  enAttenteDeDonnees: boolean;
}

/** Le lien de démarrage porte la salle : elle n'est jamais redemandée. */
export function lienDemarrage(salleId: string, date = new Date()): string {
  const jour = date.toISOString().slice(0, 10);
  return `/session/daily-state?date=${jour}&gymId=${encodeURIComponent(salleId)}`;
}

export function etatDuJour(e: EntreeEtatDuJour): EtatDuJour {
  // Sans salle, rien n'est calculable : ni le matériel, ni les charges, ni les
  // substitutions. C'est la seule question qui précède toutes les autres.
  if (!e.salle) {
    return {
      etat: "sans_salle",
      salle: null,
      seance: null,
      action: { type: "choisir_salle", href: "/gyms" },
      enAttenteDeDonnees: true,
    };
  }

  if (!e.lieuRenseigne || e.exercicesRealisablesIci === 0) {
    return {
      etat: "salle_vide",
      salle: e.salle,
      seance: null,
      action: { type: "equiper_salle", href: `/gyms/${e.salle.id}/exercices` },
      enAttenteDeDonnees: true,
    };
  }

  // Ces deux cas passent après le matériel : annoncer un repos à quelqu'un qui
  // n'a encore rien pu faire serait faux.
  if (e.seanceFaiteAujourdhui) {
    return {
      etat: "deja_entraine",
      salle: e.salle,
      seance: e.prochaineSeance,
      action: { type: "voir_progression", href: "/progression" },
      enAttenteDeDonnees: false,
    };
  }

  const plafond = e.frequenceMaxParSemaine;
  if (plafond !== null && plafond > 0 && e.seancesCetteSemaine >= plafond) {
    return {
      etat: "semaine_complete",
      salle: e.salle,
      seance: e.prochaineSeance,
      action: { type: "voir_progression", href: "/progression" },
      enAttenteDeDonnees: false,
    };
  }

  // Le matériel est connu mais aucune séance n'existe : c'est exactement le
  // moment de mesurer. La calibration n'a pas besoin d'un gabarit préalable,
  // c'est elle qui produit les données dont le gabarit aura besoin.
  if (!e.prochaineSeance) {
    return {
      etat: "calibration",
      salle: e.salle,
      seance: null,
      // La séance n'existe pas encore : cet écran la construit à partir du
      // parc de la salle, puis enchaîne sur le démarrage.
      action: { type: "demarrer_calibration", href: "/session/calibration" },
      enAttenteDeDonnees: false,
    };
  }

  return {
    etat: e.enCalibration ? "calibration" : "prete",
    salle: e.salle,
    seance: e.prochaineSeance,
    action: {
      type: "demarrer_seance",
      href: lienDemarrage(e.salle.id),
      templateId: e.prochaineSeance.templateId,
    },
    enAttenteDeDonnees: false,
  };
}
