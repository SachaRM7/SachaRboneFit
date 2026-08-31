import { db } from "@/db/client";
import { reserveDepuisRpe } from "@/lib/engine/records";
import {
  exerciseInstances, exercises, sessionLogs, setLogs, users,
} from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { bilanProgression, type Bilan, type SerieBilan } from "@/lib/engine/bilan-progression";
import { stagnations } from "./progression";

/**
 * Le bilan de progression, lu en base.
 *
 * Trois requêtes, pas une de plus. Les routes existantes chargeaient les
 * séances puis interrogeaient la base une fois PAR séance pour ses séries, et
 * une fois par série pour sa séance : un mois d'entraînement suffisait à
 * produire des centaines d'allers-retours.
 *
 * Les séances archivées sont exclues partout. C'est ce que promet la colonne
 * `archive_le` — une reprise après interruption ne doit pas traîner les
 * anciennes charges dans les statistiques — et les routes de progression
 * étaient les seules à l'ignorer.
 */
export async function bilanDeProgression(
  userId: string,
  aujourdhui = new Date().toISOString().slice(0, 10),
): Promise<Bilan> {
  const [seances, lignes, profil, listeStagnations] = await Promise.all([
    db
      .select({ date: sessionLogs.date, dureeMinutes: sessionLogs.dureeMinutes })
      .from(sessionLogs)
      .where(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)))
      .orderBy(asc(sessionLogs.date)),

    db
      .select({
        date: sessionLogs.date,
        exerciseInstanceId: setLogs.exerciseInstanceId,
        exerciceNom: exercises.nom,
        charge: setLogs.charge,
        reps: setLogs.repsEffectuees,
        rpe: setLogs.rpeEffectif,
        musclesPrincipaux: exercises.musclesPrincipaux,
        musclesSecondaires: exercises.musclesSecondaires,
        natureCharge: exerciseInstances.natureCharge,
      })
      .from(setLogs)
      .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
      .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
      .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
      .where(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)))
      .orderBy(asc(sessionLogs.date)),

    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        frequenceMinParSemaine: true,
        frequenceCibleParSemaine: true,
        frequenceMaxParSemaine: true,
      },
    }),

    // Déjà nettoyée des semaines d'empêchement par le service existant : un
    // exercice remplacé faute de matériel n'a pas eu l'occasion de progresser.
    stagnations(userId),
  ]);

  const series: SerieBilan[] = lignes.map((l) => ({
    date: l.date,
    exerciseInstanceId: l.exerciseInstanceId,
    exerciceNom: l.exerciceNom,
    charge: l.charge,
    reps: l.reps,
    // Le RPE est enregistré, la réserve s'en déduit : RPE 8 vaut 2 répétitions
    // en réserve. Sans lui, l'estimation du maximum sous-estime les séries
    // arrêtées loin de l'échec.
    rir: reserveDepuisRpe(l.rpe),
    musclesPrincipaux: l.musclesPrincipaux ?? [],
    musclesSecondaires: l.musclesSecondaires ?? [],
    natureCharge: l.natureCharge,
  }));

  return bilanProgression({
    aujourdhui,
    seances,
    series,
    stagnations: listeStagnations,
    frequenceMinParSemaine: profil?.frequenceMinParSemaine ?? null,
    frequenceCibleParSemaine: profil?.frequenceCibleParSemaine ?? null,
    frequenceMaxParSemaine: profil?.frequenceMaxParSemaine ?? null,
  });
}

/**
 * Les exercices que l'utilisateur a réellement travaillés, pour la vue
 * « Par exercice ».
 *
 * Le sélecteur de cet écran ne contenait qu'une option — « Sélectionner un
 * exercice » — et rien ne le remplissait : la vue était inatteignable depuis
 * l'ouverture de l'application.
 */
export async function exercicesTravailles(userId: string) {
  const lignes = await db
    .select({
      instanceId: setLogs.exerciseInstanceId,
      nom: exercises.nom,
      machineNom: exerciseInstances.machineNom,
      date: sessionLogs.date,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)));

  const parInstance = new Map<
    string,
    { instanceId: string; nom: string; machineNom: string | null; seances: Set<string>; derniere: string }
  >();

  for (const l of lignes) {
    const actuel = parInstance.get(l.instanceId);
    if (actuel) {
      actuel.seances.add(l.date);
      if (l.date > actuel.derniere) actuel.derniere = l.date;
    } else {
      parInstance.set(l.instanceId, {
        instanceId: l.instanceId,
        nom: l.nom,
        machineNom: l.machineNom,
        seances: new Set([l.date]),
        derniere: l.date,
      });
    }
  }

  return [...parInstance.values()]
    .map(({ seances, ...reste }) => ({ ...reste, seances: seances.size }))
    // Le plus récemment travaillé en tête : c'est celui qu'on vient regarder.
    .sort((a, b) => b.derniere.localeCompare(a.derniere) || a.nom.localeCompare(b.nom));
}
