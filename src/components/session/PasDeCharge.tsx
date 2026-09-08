"use client";
import { Minus, Plus } from "lucide-react";
import { configurationDe, voisineCharge, chargeAtteignable } from "@/lib/engine/charges";
import type { ExercicePrescrit } from "./types";

/**
 * Monter et descendre la charge d'un cran — celui de l'appareil.
 *
 * CE QUE CE COMPOSANT NE FAIT PAS
 *
 * Il n'ajoute pas 2,5. Il ne connaît aucun incrément, aucun arrondi, aucune
 * borne : il demande au moteur `voisineCharge` ce que l'appareil produit un
 * cran plus haut ou plus bas, et affiche la réponse. Un `valeur + 2.5` écrit
 * ici serait un second moteur de charge — il transformerait le râtelier
 * [5, 10, 17.5, 25] en 5, 7.5, 10, et l'athlète chercherait devant la machine
 * des crans qui n'existent pas.
 *
 * `voisineCharge` et non `prochaineCharge` : la seconde suit la PROGRESSION,
 * qui descend sur une machine d'assistance. Un `+` qui allège l'exercice sans
 * rien dire serait le pire des deux mondes.
 *
 * QUAND L'APPAREIL N'A PAS ÉTÉ MESURÉ
 *
 * Les boutons disparaissent. Proposer un pas par défaut reviendrait à décrire
 * un appareil que personne n'a mesuré — et la saisie directe reste là, elle,
 * pour ce cas exactement.
 */

interface Props {
  exercice: ExercicePrescrit;
  /** La valeur courante du champ, telle qu'elle est saisie. */
  valeur: string;
  onChanger: (valeur: string) => void;
  /** Une série validée ne se corrige qu'après avoir été rouverte. */
  desactive?: boolean;
}

/** La configuration de l'appareil, telle que le moteur la lit. */
export function configurationDeLExercice(exercice: ExercicePrescrit) {
  return configurationDe({
    natureCharge: exercice.natureCharge,
    incrementsPossibles: exercice.incrementsPossibles,
    paliersCharges: exercice.paliersCharges,
    chargeMinimale: exercice.chargeMinimale,
    chargeMax: exercice.chargeMax,
  });
}

/**
 * Les deux crans de l'appareil, prêts à être câblés sur n'importe quels boutons.
 *
 * La grammaire du Focus place les boutons DE PART ET D'AUTRE de la valeur, celle
 * de la Liste les colle en paire. Deux dispositions, un seul appel au moteur :
 * dupliquer `voisineCharge` dans la seconde vue en ferait un second moteur de
 * charge, exactement ce que ce fichier existe pour empêcher.
 */
export function cransDeCharge(
  exercice: ExercicePrescrit,
  valeur: string,
  onChanger: (valeur: string) => void,
) {
  const config = configurationDeLExercice(exercice);

  /*
   * Le point de départ du cran.
   *
   * Champ vide : on part de la charge suggérée par le moteur, ou du premier
   * cran. Appuyer sur `+` devant un champ vide doit donner quelque chose
   * d'utile, pas zéro.
   */
  const courante = Number.parseFloat(valeur.replace(",", "."));
  const depart = Number.isFinite(courante)
    ? courante
    : exercice.chargeSuggeree ?? config.chargeMinimale ?? 0;

  const aller = (sens: "haut" | "bas") => {
    const r = voisineCharge(config, depart, sens);
    // « Indéterminable » : rien à proposer, et surtout rien à inventer.
    if (r.valeur === null) return;
    onChanger(String(r.valeur));
  };

  return {
    monter: () => aller("haut"),
    descendre: () => aller("bas"),
    /*
     * Un appareil sans grille connue n'a pas de crans à proposer. La saisie
     * directe, elle, reste disponible — c'est l'échappatoire prévue.
     */
    disponible:
      voisineCharge(config, depart, "haut").statut !== "indeterminable",
  };
}

export function PasDeCharge({ exercice, valeur, onChanger, desactive }: Props) {
  const { monter, descendre, disponible } = cransDeCharge(
    exercice,
    valeur,
    onChanger,
  );
  if (!disponible) return null;

  const bouton =
    "shrink-0 w-11 h-11 rounded-lg border border-filet bg-papier-2 "
    + "flex items-center justify-center active:bg-filet disabled:opacity-30";

  return (
    <div className="flex items-center gap-1.5">
      {/* 44 px : la cible tactile minimale d'iOS. Des boutons plus petits se
          ratent avec les mains moites, entre deux séries. */}
      <button
        type="button"
        onClick={descendre}
        disabled={desactive}
        aria-label="Charge : un cran en dessous"
        className={bouton}
      >
        <Minus className="w-4 h-4 text-encre-2" aria-hidden />
      </button>
      <button
        type="button"
        onClick={monter}
        disabled={desactive}
        aria-label="Charge : un cran au-dessus"
        className={bouton}
      >
        <Plus className="w-4 h-4 text-encre-2" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Ce que l'écran doit dire d'une charge saisie à la main.
 *
 * `null` quand il n'y a rien à signaler — la valeur est réalisable, ou
 * l'appareil n'a pas été mesuré et personne n'est en position de contredire la
 * personne qui a la machine sous les yeux.
 *
 * ELLE NE CORRIGE RIEN. La valeur saisie est conservée telle quelle : la
 * remplacer en silence ferait enregistrer autre chose que ce qui a été
 * soulevé. L'écran informe, et propose les deux voisines réelles.
 */
export function alerteChargeIrrealisable(
  exercice: ExercicePrescrit,
  valeur: string,
): { message: string; choix: number[] } | null {
  const saisie = Number.parseFloat(valeur.replace(",", "."));
  if (!Number.isFinite(saisie)) return null;

  const config = configurationDeLExercice(exercice);
  const proche = chargeAtteignable(config, saisie);
  if (proche.statut === "indeterminable") return null;
  if (proche.valeur !== null && Math.abs(proche.valeur - saisie) < 1e-6) return null;

  const bas = voisineCharge(config, saisie, "bas");
  const haut = voisineCharge(config, saisie, "haut");
  const choix = [...new Set(
    [bas.valeur, haut.valeur].filter((v): v is number => v !== null),
  )].sort((a, b) => a - b);

  return {
    message: `${saisie} indisponible sur cet appareil.`,
    choix,
  };
}
