import type { AvancementExercice } from "./vue-live";

export interface ProchaineEtape {
  index: number | null;
  origine: "programme" | "reporte" | "terminee" | "aucune_autre";
  reportesRestants: number;
}

export interface IncidentDeSeance {
  type?: string;
  decision?: string;
  contexte?: Record<string, unknown>;
}

export interface ExerciceAvecLignee {
  id: string;
  lignee?: readonly string[];
}

/**
 * Reconstruit les reports à partir des faits persistés de la séance.
 *
 * L'incident garde l'instance qui était réellement occupée. Si elle a depuis
 * été remplacée, la lignée ramène ce fait vers l'instance actuellement
 * affichée sans réécrire l'incident historique.
 */
export function reportesDepuisIncidents(
  incidents: readonly IncidentDeSeance[],
  exercices: readonly ExerciceAvecLignee[],
): string[] {
  const ids = incidents
    .filter((i) => i.type === "machine_occupee" && i.decision === "reporter")
    .map((i) => i.contexte?.exercise_instance_id)
    .filter((id): id is string => typeof id === "string")
    .map((id) => exercices.find((e) => e.id === id || e.lignee?.includes(id))?.id)
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

/**
 * Choisit la prochaine action sans modifier la prescription.
 *
 * Les exercices ordinaires gardent l'ordre du programme, en boucle à partir
 * de la position courante. Les exercices reportés ne reviennent qu'une fois
 * tous les autres terminés, puis dans leur ordre de programme. Un exercice
 * terminé n'est jamais relancé, même s'il figure encore dans la liste locale
 * des reports après une reprise.
 */
export function prochaineEtape(
  etats: readonly AvancementExercice[],
  reportes: readonly string[],
  depuis: number,
): ProchaineEtape {
  const aFaire = etats.filter((e) => e.statut !== "termine");
  if (aFaire.length === 0) {
    return { index: null, origine: "terminee", reportesRestants: 0 };
  }

  const reportesIncomplets = new Set(
    aFaire.filter((e) => reportes.includes(e.id)).map((e) => e.id),
  );
  const totalReportes = reportesIncomplets.size;

  for (let decalage = 1; decalage <= etats.length; decalage += 1) {
    const index = (depuis + decalage) % etats.length;
    const etat = etats[index]!;
    if (etat.statut !== "termine" && !reportesIncomplets.has(etat.id)) {
      return {
        index,
        origine: "programme",
        reportesRestants: totalReportes,
      };
    }
  }

  const premierReporte = etats.findIndex(
    (e) => e.statut !== "termine" && reportesIncomplets.has(e.id),
  );
  if (premierReporte === depuis && aFaire.length === 1) {
    return { index: null, origine: "aucune_autre", reportesRestants: totalReportes };
  }
  if (premierReporte >= 0) {
    return {
      index: premierReporte,
      origine: "reporte",
      reportesRestants: totalReportes,
    };
  }

  return { index: null, origine: "aucune_autre", reportesRestants: totalReportes };
}

/** L'ordre utile aux SOS : courant, suite, début de programme, sans terminé. */
export function ordreActionnable(
  etats: readonly AvancementExercice[],
  depuis: number,
): AvancementExercice[] {
  if (etats.length === 0) return [];
  return Array.from({ length: etats.length }, (_, d) => etats[(depuis + d) % etats.length]!)
    .filter((e) => e.statut !== "termine");
}
