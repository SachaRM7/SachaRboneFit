/**
 * Ce qui était prévu, ce qui a été fait, et pourquoi ce n'est pas la même chose.
 *
 * Une substitution n'est ni un échec ni un oubli. Elle est une décision prise
 * par l'application, dans un contexte qu'elle connaît : on s'entraînait
 * ailleurs, la machine n'existait pas là-bas, on avait des élastiques dans le
 * sac. Sans cette mémoire, la progression relit l'historique et conclut deux
 * choses fausses : que le développé stagne depuis six semaines, et qu'il a été
 * abandonné sans raison.
 *
 * Ce module dit comment lire cette mémoire. Il ne calcule rien de neuf : il
 * empêche de mal interpréter ce qui est écrit.
 */

import { semainesDistinctes } from "@/lib/semaines";

export type TypeAdaptation =
  | "changement_lieu"
  | "materiel_absent"
  | "machine_occupee"
  | "autre";

export interface ContexteAdaptation {
  type: TypeAdaptation;
  lieuAvantId?: string | null;
  lieuAvantNom?: string | null;
  lieuApresId?: string | null;
  lieuApresNom?: string | null;
  materielApporte?: string[];
  niveauFidelite?: string;
  qualite?: string;
  horodatage?: string;
}

/** Une ligne de séance, telle que la base la porte. */
export interface LigneTracee {
  exerciseInstanceId: string;
  exerciseInstancePrevuId: string | null;
  raisonSubstitution: string | null;
  contexteAdaptation: ContexteAdaptation | null;
}

/** L'exercice qui devait être fait. Le prévu quand il existe, sinon l'actuel. */
export function exercicePrevu(l: LigneTracee): string {
  return l.exerciseInstancePrevuId ?? l.exerciseInstanceId;
}

/** L'exercice réellement porté par la ligne aujourd'hui. */
export function exerciceEffectue(l: LigneTracee): string {
  return l.exerciseInstanceId;
}

export function estUneSubstitution(l: LigneTracee): boolean {
  return (
    l.exerciseInstancePrevuId !== null && l.exerciseInstancePrevuId !== l.exerciseInstanceId
  );
}

/**
 * L'exercice prévu a-t-il été empêché par les circonstances ?
 *
 * La distinction compte : remplacer un exercice parce qu'on s'entraîne
 * ailleurs n'est pas la même chose que le remplacer par préférence. Le premier
 * cas ne doit jamais compter comme une occasion manquée ; le second, si.
 */
const EMPECHEMENTS: TypeAdaptation[] = ["changement_lieu", "materiel_absent", "machine_occupee"];

export function empecheParLesCirconstances(l: LigneTracee): boolean {
  if (!estUneSubstitution(l)) return false;
  const type = l.contexteAdaptation?.type;
  // Une substitution sans contexte enregistré est traitée comme un
  // empêchement : dans le doute, on ne reproche rien à l'athlète.
  if (!type) return true;
  return EMPECHEMENTS.includes(type);
}

/** Ce qu'on montre à l'utilisateur, en une phrase. */
export function raconterSubstitution(l: LigneTracee, nomPrevu: string, nomFait: string): string | null {
  if (!estUneSubstitution(l)) return null;
  if (l.raisonSubstitution) return l.raisonSubstitution;
  const lieu = l.contexteAdaptation?.lieuApresNom;
  return lieu
    ? `${nomPrevu} indisponible à ${lieu} — remplacé par ${nomFait}.`
    : `${nomPrevu} remplacé par ${nomFait}.`;
}

export interface PeriodeIndisponible {
  /** Instance prévue qui n'a pas pu être faite. */
  instanceId: string;
  date: string;
}

/**
 * Jours où un exercice a été prévu mais empêché.
 *
 * La progression s'en sert pour ne pas compter ces jours comme des occasions
 * de progresser : un exercice qu'on n'a pas pu faire ne stagne pas, il attend.
 */
export function joursEmpeches(
  lignes: Array<LigneTracee & { date: string }>,
): PeriodeIndisponible[] {
  const empeches: PeriodeIndisponible[] = [];
  for (const l of lignes) {
    if (!empecheParLesCirconstances(l)) continue;
    empeches.push({ instanceId: l.exerciseInstancePrevuId!, date: l.date });
  }
  return empeches;
}

/**
 * Nombre de semaines distinctes pendant lesquelles l'exercice a été empêché.
 *
 * Deux empêchements la même semaine ne comptent qu'une fois : sinon une séance
 * ratée deux fois vaudrait deux semaines d'indisponibilité.
 */
export function semainesEmpechees(dates: string[]): number {
  return semainesDistinctes(dates);
}
