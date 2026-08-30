/**
 * Ce que l'application a à proposer aujourd'hui.
 *
 * L'accueil décidait ça lui-même, dans le rendu, et n'avait qu'une réponse
 * quand il ne savait pas : « Aucune séance programmée », avec un bouton
 * Démarrer qui partait sans salle. Un compte neuf tombait donc sur un écran
 * qui constatait son propre vide.
 *
 * La règle tenue ici : il y a toujours une prochaine action, et cette action
 * est ce qui manque réellement. Quand l'application ne connaît pas encore le
 * parc d'une salle, elle ne peut pas inventer une séance — elle demande le
 * parc. Ce n'est pas un écran d'erreur, c'est l'étape suivante.
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

export interface EntreeEtatDuJour {
  /** Salle du jour : préférence de l'utilisateur, ou unique salle active. */
  salle: Salle | null;
  /** Machines renseignées dans cette salle. Zéro = parc inconnu. */
  machinesDansLaSalle: number;
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
  | { type: "demarrer_calibration"; href: string }
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

  if (e.machinesDansLaSalle === 0) {
    return {
      etat: "salle_vide",
      salle: e.salle,
      seance: null,
      action: { type: "equiper_salle", href: `/gyms/${e.salle.id}/materiel` },
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
      action: { type: "demarrer_calibration", href: lienDemarrage(e.salle.id) },
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
