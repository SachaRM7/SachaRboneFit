import { porteeDeLaMesure, type NatureCharge } from "@/lib/engine/charges";

/**
 * « La dernière fois » — et ce qui a le droit de porter ce nom.
 *
 * LE PIÈGE, ET IL EST TENTANT
 *
 * Après une substitution, la nouvelle machine n'a aucun historique. L'écran
 * paraît vide, et la tentation est d'y mettre la dernière performance de
 * l'ancienne : « tu faisais 60 kg ». Ce serait faux, et d'une façon
 * particulièrement coûteuse — l'athlète chargerait 60 sur un appareil où 60 ne
 * déplace pas la même chose, et croirait avoir régressé ou progressé sans que
 * rien de tel ait eu lieu.
 *
 * Une pile Matrix affichant 40 et une pile Technogym affichant 40 ne déplacent
 * pas la même charge : bras de levier, poulies, frottements. Le nombre reste
 * utile comme INDICE LOCAL — comparable à lui-même sur cette entrée, et à rien
 * d'autre. C'est ce que `porteeDeLaMesure` dit déjà, et ce module s'appuie
 * dessus plutôt que de rejuger la question.
 *
 * LA HIÉRARCHIE, DU PLUS SÛR AU REFUS
 *
 *   1. MÊME ENTRÉE          la même machine, la même convention. Toujours
 *                           comparable, c'est la définition.
 *   2. MÊME EXERCICE, CHARGE LIBRE, MÊME CONVENTION
 *                           60 kg à la barre sont 60 kg partout. Comparable à
 *                           condition que la mesure porte des KILOS et que la
 *                           convention soit identique — « par haltère » et
 *                           « poids total » ne se comparent pas davantage que
 *                           deux machines.
 *   3. RIEN                 et on le dit. « Pas encore de repère sur cette
 *                           machine » est une information ; une fausse
 *                           continuité n'en est pas une.
 *
 * Il n'y a délibérément PAS de niveau « même exercice, autre machine » : c'est
 * exactement le cas où la charge ne se transporte pas.
 */

export const NIVEAUX_REPERE = ["meme_entree", "meme_charge_libre", "aucun"] as const;
export type NiveauRepere = (typeof NIVEAUX_REPERE)[number];

/** Une performance passée, réduite à ce qui décide de sa comparabilité. */
export interface CandidatRepere {
  exerciseInstanceId: string;
  /** Le MOUVEMENT, partagé par plusieurs appareils. */
  exerciseId: string | null;
  conventionCharge: string | null;
  natureCharge: NatureCharge | string | null;
  /** ISO. La plus récente gagne, à niveau égal. */
  date: string;
  series: { charge: number; reps: number }[];
}

/** L'entrée pour laquelle on cherche un repère. */
export interface CibleRepere {
  exerciseInstanceId: string;
  exerciseId: string | null;
  conventionCharge: string | null;
  natureCharge: NatureCharge | string | null;
}

export interface RepereChoisi {
  niveau: NiveauRepere;
  candidat: CandidatRepere | null;
  /** Ce que l'écran affiche quand il n'y a rien. Vide sinon. */
  message: string;
}

const AUCUN_REPERE = "Pas encore de repère sur cette machine";

/**
 * Deux entrées mesurent-elles la même chose, au point d'être comparables ?
 *
 * Trois conditions, et aucune n'est négociable :
 *
 *   — la mesure porte des KILOS. Un indice de pile ne vaut que sur sa pile ;
 *     une assistance ne se compare pas davantage entre deux appareils.
 *   — la convention est identique. « Par haltère » et « poids total » sont
 *     deux nombres différents pour le même effort.
 *   — la nature est identique. Une résistance et une assistance se lisent en
 *     sens inverse.
 */
function memeMesure(a: CibleRepere, b: CandidatRepere): boolean {
  const porteeA = porteeDeLaMesure({
    natureCharge: a.natureCharge, conventionCharge: a.conventionCharge,
  });
  const porteeB = porteeDeLaMesure({
    natureCharge: b.natureCharge, conventionCharge: b.conventionCharge,
  });
  return porteeA === "kilos" && porteeB === "kilos"
    && a.conventionCharge === b.conventionCharge
    && a.natureCharge === b.natureCharge;
}

/** La plus récente de deux performances. */
function plusRecent(a: CandidatRepere, b: CandidatRepere): CandidatRepere {
  return a.date >= b.date ? a : b;
}

/**
 * Le repère à afficher, ou l'aveu qu'il n'y en a pas.
 *
 * Déterministe : mêmes candidats, même réponse. La règle vit ici et non dans
 * l'écran — une hiérarchie de comparabilité écrite en JSX ne se teste pas, et
 * c'est précisément le genre de règle qu'on ne veut pas découvrir fausse
 * devant une machine.
 */
export function choisirRepere(
  cible: CibleRepere,
  candidats: CandidatRepere[],
): RepereChoisi {
  const utiles = candidats.filter((c) => c.series.length > 0);

  // 1. La même entrée. Rien ne se compare mieux à soi-même.
  const memeEntree = utiles
    .filter((c) => c.exerciseInstanceId === cible.exerciseInstanceId)
    .reduce<CandidatRepere | null>((m, c) => (m ? plusRecent(m, c) : c), null);
  if (memeEntree) return { niveau: "meme_entree", candidat: memeEntree, message: "" };

  // 2. Le même mouvement, en charge libre, à convention et nature identiques.
  //    `exerciseId` nul ne s'apparie avec rien : deux inconnues ne font pas
  //    une identité.
  const memeMouvement = cible.exerciseId === null ? [] : utiles.filter(
    (c) => c.exerciseId === cible.exerciseId && memeMesure(cible, c),
  );
  const libre = memeMouvement.reduce<CandidatRepere | null>(
    (m, c) => (m ? plusRecent(m, c) : c), null,
  );
  if (libre) return { niveau: "meme_charge_libre", candidat: libre, message: "" };

  // 3. Rien de comparable — et on le dit plutôt que d'emprunter une charge.
  return { niveau: "aucun", candidat: null, message: AUCUN_REPERE };
}

/**
 * Ce que l'écran met en face de la décision.
 *
 * `null` quand aucun repère n'existe : c'est à l'appelant d'afficher le
 * message, pas à cette fonction de fabriquer un texte qui ressemblerait à une
 * performance.
 */
export function resumeRepere(repere: RepereChoisi): string | null {
  if (!repere.candidat) return null;
  return resumeDesSeries(repere.candidat.series);
}

/**
 * Une performance passée en une ligne : « 60 · 10 / 9 / 8 ».
 *
 * Extrait de `resumeRepere` pour que le Focus puisse afficher son bloc
 * « Dernière fois » sans se réécrire un second format. Deux formats pour la
 * même donnée finissent par ne plus dire la même chose — l'un arrondissant,
 * l'autre non — et l'écart se lit comme une progression.
 *
 * `null` quand il n'y a rien : c'est à l'appelant d'afficher son message, pas
 * à cette fonction de fabriquer un texte qui ressemblerait à une performance.
 */
export function resumeDesSeries(
  series: { charge: number; reps: number }[],
): string | null {
  if (series.length === 0) return null;
  const charges = [...new Set(series.map((x) => x.charge))];
  const charge =
    charges.length === 1
      ? `${charges[0]}`
      : `${Math.min(...charges)}–${Math.max(...charges)}`;
  return `${charge} · ${series.map((x) => x.reps).join(" / ")}`;
}
