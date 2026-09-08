import type { MovementId } from "./rig";
export const MOVEMENTS_3D = {
  squat: {
    id: "squat",
    name: "Squat au poids du corps",
    muscles: ["Quadriceps", "Fessiers"],
    groups: ["quads", "glutes"],
    cue: "Descends avec contrôle, genoux dans l’axe des pieds.",
    equipment: "Sans matériel",
  },
  "bicep-curl": {
    id: "bicep-curl",
    name: "Curl biceps avec haltères",
    muscles: ["Biceps"],
    groups: ["biceps"],
    cue: "Garde les bras près du buste et évite de te balancer.",
    equipment: "Deux haltères",
  },
  "lateral-raise": {
    id: "lateral-raise",
    name: "Élévations latérales",
    muscles: ["Épaules"],
    groups: ["deltoids"],
    cue: "Monte les bras sans élan, jusqu’à hauteur des épaules.",
    equipment: "Deux haltères",
  },
} as const satisfies Record<
  MovementId,
  {
    id: MovementId;
    name: string;
    muscles: readonly string[];
    groups: readonly string[];
    cue: string;
    equipment: string;
  }
>;
// Correspondances exactes. Aucune déduction depuis le nom, le muscle ou le pilier.
// Le squat du catalogue correspond à un squat avec barre : il n’est pas relié au prototype sans charge.
export const EXERCISE_3D_BY_SLUG: Readonly<Record<string, MovementId>> = {
  "bicep-curl": "bicep-curl",
  "lateral-raise": "lateral-raise",
};
export function renderingForExercise(
  slug: string | null | undefined,
): MovementId | null {
  return slug && Object.prototype.hasOwnProperty.call(EXERCISE_3D_BY_SLUG, slug)
    ? (EXERCISE_3D_BY_SLUG[slug] ?? null)
    : null;
}
