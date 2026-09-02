import type { MotifProgression } from "@/lib/engine/double-progression";

/**
 * Comment se lit une décision de progression, selon sa nature.
 *
 * `messageProgression` était peint en `text-gain` quelle que soit la décision
 * qu'il racontait. Le message de la référence tronquée — « 1 série sur 3, on
 * refait la séance entière » — s'affichait donc en vert et en gras, dans la
 * couleur que le carnet réserve aux progrès, et le bandeau de séance comptait
 * chaque message comme une « charge en hausse ».
 *
 * La correspondance vit ici, en dehors des composants, pour deux raisons : elle
 * est partagée par le tableau de séries et le bandeau — même motif, même
 * sémantique visuelle partout —, et elle est vérifiable sans rendre de React.
 *
 * Les classes sont celles du carnet, pas une palette nouvelle :
 *
 *   text-gain     ce qui a progressé
 *   text-perte    ce qui manque et appelle une action
 *   text-encre-2  ce qui informe sans juger
 */
export type TonProgression = "gain" | "avertissement" | "neutre";

const TONS: Record<MotifProgression, TonProgression> = {
  // Une charge monte : c'est le seul cas qui mérite la couleur du gain.
  montee: "gain",
  montee_effort_maximal: "gain",

  // Répéter la même séance n'est ni un progrès ni un échec. La consolidation
  // sur effort maximal est même une décision saine — la peindre en rouge
  // ferait passer une bonne règle pour une sanction.
  consolidation_effort: "neutre",

  // Le seul motif qui appelle une action de la personne : la séance
  // précédente n'a pas été menée à son terme.
  reference_tronquee: "avertissement",

  // Deux faits sur le matériel, pas sur l'athlète. Une pile en butée est même
  // la conséquence d'avoir progressé jusqu'au bout de la machine ; des
  // incréments non renseignés sont une donnée qui manque. Informer, sans
  // colorer un reproche.
  butee_materiel: "neutre",
  increments_inconnus: "neutre",
};

export function tonDuMotif(motif: MotifProgression | null | undefined): TonProgression {
  // Sans motif, il n'y a pas de message à peindre — le ton neutre est le repli
  // sûr : il n'affirme rien.
  return motif ? TONS[motif] : "neutre";
}

const CLASSES: Record<TonProgression, string> = {
  gain: "text-gain font-semibold",
  avertissement: "text-perte font-semibold",
  neutre: "text-encre-2",
};

export function classeDuMotif(motif: MotifProgression | null | undefined): string {
  return CLASSES[tonDuMotif(motif)];
}

/**
 * Ce motif décrit-il une charge qui monte ?
 *
 * Le bandeau de séance annonçait « N charges en hausse » en comptant TOUT
 * message de progression — une référence tronquée et une butée d'appareil y
 * étaient donc comptées comme des hausses. Ce n'était pas seulement une
 * couleur trompeuse, c'était une phrase fausse.
 */
export function estUneMontee(motif: MotifProgression | null | undefined): boolean {
  return motif === "montee" || motif === "montee_effort_maximal";
}
