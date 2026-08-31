import { createHash } from "node:crypto";
import {
  SEVERITE, effetSurLEntrainement, type ContrainteLue,
} from "@/lib/engine/contraintes";
import type { Apercu, LigneApercu } from "./propositions";

/**
 * Les propositions qui portent sur une contrainte plutôt que sur une séance.
 *
 * Créer ou lever une contrainte change ce que l'application proposera pendant
 * des semaines : c'est une mutation structurelle, et elle passe donc par le
 * même chemin que les autres — analyse, proposition, aperçu, confirmation,
 * écriture. Ce qui change n'est ni le mécanisme ni les garanties, seulement
 * l'objet regardé.
 *
 * Ce module est pur, comme son homologue pour les séances : il calcule ce que
 * l'athlète lira, et rien d'autre.
 */

export type OperationContrainte =
  | { type: "creer_contrainte"; muscle: string; severite: number; notes?: string | null }
  | { type: "resoudre_contrainte"; contrainteId: string };

export const OPERATIONS_CONTRAINTE: readonly OperationContrainte["type"][] = [
  "creer_contrainte",
  "resoudre_contrainte",
] as const;

/**
 * Empreinte de la situation sur laquelle la proposition a été calculée.
 *
 * Pour une création : ce qui compte est qu'aucune contrainte ne soit apparue
 * entre-temps sur cette zone. Pour une résolution : que la contrainte visée
 * n'ait pas bougé — une sévérité revue à la baisse pendant l'échange rendrait
 * l'aperçu faux.
 */
export function empreinteContrainte(
  muscle: string,
  actives: ContrainteLue[],
): string {
  const concernees = actives
    .filter((c) => c.muscle === muscle)
    .map((c) => [c.id, c.severite, c.dateFin, c.aReevaluerLe])
    .sort();
  return createHash("sha256")
    .update(JSON.stringify([muscle, concernees]))
    .digest("hex")
    .slice(0, 32);
}

/**
 * L'aperçu d'une contrainte qui entre.
 *
 * Il décrit ce que l'application fera — jamais ce que le corps fera. Pas de
 * durée de guérison, pas de diagnostic : une échéance de réévaluation est
 * présentée comme une question à venir, ce qu'elle est.
 */
export function apercuCreation(entrees: {
  libelleMuscle: string;
  severite: number;
  aReevaluerLe: string | null;
}): Apercu {
  const { libelleMuscle, severite, aReevaluerLe } = entrees;
  const effets = effetSurLEntrainement(severite, "entree");

  const lignes: LigneApercu[] = effets.map((texte) => ({
    mouvement: "modifie",
    nom: texte,
    avant: null,
    apres: null,
  }));

  lignes.push({
    mouvement: "ajoute",
    nom: aReevaluerLe
      ? `Question reposée le ${aReevaluerLe} : « est-ce toujours le cas ? »`
      : "Aucune relance : limitation déclarée durable.",
    avant: null,
    apres: null,
  });

  return {
    resume: `${libelleMuscle} noté comme sensible (${severite}/10)${
      severite >= SEVERITE.ecartement ? ", zone ménagée" : ""
    }.`,
    lignes,
    seriesAvant: 0,
    seriesApres: 0,
    avertissements: [],
  };
}

/** L'aperçu d'une contrainte qui sort : ce qui redevient possible. */
export function apercuResolution(entrees: {
  libelleMuscle: string;
  severite: number;
  depuis: string;
}): Apercu {
  const effets = effetSurLEntrainement(entrees.severite, "sortie");

  return {
    resume: `${entrees.libelleMuscle} : contrainte levée, en place depuis le ${entrees.depuis}.`,
    lignes: [
      ...effets.map((texte) => ({
        mouvement: "modifie" as const, nom: texte, avant: null, apres: null,
      })),
      {
        mouvement: "ajoute" as const,
        nom: "La contrainte reste dans l'historique, datée du jour où elle a cessé.",
        avant: null, apres: null,
      },
    ],
    seriesAvant: 0,
    seriesApres: 0,
    avertissements: [],
  };
}

/** Bornes d'une création proposée par le coach. */
export function severiteRecevable(valeur: unknown): number | null {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return null;
  const arrondie = Math.round(n);
  if (arrondie < SEVERITE.minimum || arrondie > SEVERITE.maximum) return null;
  return arrondie;
}
