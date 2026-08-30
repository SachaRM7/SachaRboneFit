import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { memoireEmpechements } from "./memoire";
import { deciderRetour, type GardeFousRetour } from "@/lib/engine/memoire-empechements";
import {
  activiteMusculaire,
  etatMusclesDepuis,
  courbaturesDuJour,
  ciblesHebdo,
  mesurerCycle,
} from "@/lib/coach/outils-programme";
import { scoreRecuperation } from "@/lib/engine/recuperation";
import { versMuscle } from "@/lib/referentiels/muscles";

/**
 * Pourquoi tel exercice revient aujourd'hui.
 *
 * Le point délicat, et la raison pour laquelle ce fichier est court : la
 * mémoire ne remet rien elle-même. La place existe déjà dans le gabarit, et la
 * résolution y a déjà replacé l'exercice prévu du seul fait qu'il est de
 * nouveau disponible. Ce qui manquait, c'était de pouvoir le dire — et de se
 * taire quand les garde-fous ne suivent pas.
 *
 * Aucune série n'est ajoutée nulle part. Un exercice empêché trois fois n'a
 * droit à rien de plus qu'un exercice empêché une fois.
 */

export interface RetourExplique {
  exerciceNom: string;
  explication: string;
}

export async function expliquerRetours(entrees: {
  userId: string;
  resolus: Array<{
    exerciceId: string;
    exerciceNom: string;
    musclesPrincipaux: string[];
    series: number;
  }>;
  date: string;
  dureeDisponibleMinutes: number | null;
}): Promise<RetourExplique[]> {
  const { userId, resolus } = entrees;
  if (resolus.length === 0) return [];

  const { classes } = await memoireEmpechements(userId, entrees.date);
  if (classes.length === 0) return [];

  const parExercice = new Map(classes.map((c) => [c.exerciceId, c]));
  const concernes = resolus.filter((r) => parExercice.has(r.exerciceId));
  if (concernes.length === 0) return [];

  const [profil, activite, activiteSemaine, cycle, courbatures] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    activiteMusculaire(userId, 21),
    activiteMusculaire(userId, 7),
    mesurerCycle(userId),
    courbaturesDuJour(userId),
  ]);

  const etats = etatMusclesDepuis(activite, courbatures);
  const cibles = ciblesHebdo(profil?.objectifMusclesPrioritaires ?? []);

  const seriesSemaine: Record<string, number> = {};
  for (const [muscle, a] of activiteSemaine) seriesSemaine[muscle] = Math.round(a.series);

  const retours: RetourExplique[] = [];
  for (const r of concernes) {
    const muscles = r.musclesPrincipaux
      .map((m) => versMuscle(m))
      .filter((m): m is NonNullable<ReturnType<typeof versMuscle>> => m !== null);

    // Le muscle le moins récupéré décide : un exercice qui en sollicite deux
    // ne revient pas parce que l'un des deux est frais. `pret` porte déjà le
    // seuil propre à la phase, il n'y a pas à le recalculer ici.
    const prets = muscles.map((m) => {
      const etat = etats[m];
      if (!etat) return true;
      return scoreRecuperation({
        ...etat,
        tendancePerformance: cycle.tendancePerformance,
        phase: cycle.phase,
      }).pret;
    });

    // Ce qui reste absorbable cette semaine sur le muscle le plus servi.
    const restantes = muscles.length
      ? Math.min(
          ...muscles.map((m) => (cibles[m] ?? Infinity) - (seriesSemaine[m] ?? 0)),
        )
      : Infinity;

    const garde: GardeFousRetour = {
      // La résolution a déjà retenu cet exercice pour aujourd'hui.
      realisableAujourdhui: true,
      recuperationSuffisante: prets.every(Boolean),
      seriesHebdoRestantes: Number.isFinite(restantes) ? restantes : Number.MAX_SAFE_INTEGER,
      // Une fréquence est respectée tant que la cible hebdomadaire ne l'est
      // pas déjà : au-delà, revenir dessus serait insister.
      frequenceMusculaireRespectee: restantes > 0,
      // Une décharge n'est pas le moment de remettre un exercice absent : elle
      // vise moins de volume, pas plus de nouveautés.
      phaseCompatible: cycle.phase !== "decharge",
      dureeDisponibleSuffisante: true,
    };

    const decision = deciderRetour(parExercice.get(r.exerciceId)!, garde, r.series);
    if (decision.favorise && decision.explication) {
      retours.push({ exerciceNom: r.exerciceNom, explication: decision.explication });
    }
  }

  return retours;
}
