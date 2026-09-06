/**
 * Diagnostic READ-ONLY de la séance du 6 septembre, et rien d'autre.
 *
 * Deux séries de huit répétitions à 27 kg ont été réalisées sur l'Abdominal
 * Crunch Machine et enregistrées sous le Cable Crunch, faute de bouton pour
 * dire qu'on changeait d'exercice. La base porte donc une baseline sur un
 * mouvement jamais réalisé — et elle servira à prescrire la prochaine fois.
 *
 * Ce script NE MODIFIE RIEN. Il lit, il compare, et il dit ce qu'il trouve.
 * La réparation est imprimée à la fin, en SQL, à exécuter à la main après
 * lecture — et seulement si le diagnostic est sans ambiguïté.
 *
 *   DATABASE_URL=… npx tsx src/scripts/diagnostic-6-septembre.ts
 *
 * Le principe qui gouverne tout le fichier : ne rien deviner. Une séance qui
 * ne correspond pas à TOUS les critères n'est pas « probablement la bonne » ;
 * elle est écartée, et le script le dit plutôt que de proposer une réparation
 * sur une séance qu'il n'a pas identifiée.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { exerciseInstances, exercises, gyms, sessionLogs, setLogs } from "@/db/schema";

/** Ce que le terrain a rapporté. Aucune de ces valeurs n'est écrite en base. */
const ATTENDU = {
  date: "2026-09-06",
  exercices: 6,
  series: 12,
  dureeMinutes: 61,
  chargeMalAttribuee: 27,
  repsMalAttribuees: 8,
  nomPrevu: "Cable Crunch",
  nomReel: "Abdominal Crunch",
  salle: "St-Martin",
};

function titre(texte: string) {
  console.log(`\n${"─".repeat(72)}\n${texte}\n${"─".repeat(72)}`);
}

/**
 * Le compte concerné, en argument.
 *
 * Facultatif — le diagnostic tourne sans. Il devient nécessaire le jour où
 * deux séances cochent tous les autres critères : plutôt que de choisir à la
 * place du lecteur, le script s'arrête et demande cette précision.
 *
 *   npx tsx src/scripts/diagnostic-6-septembre.ts --compte=<uuid>
 */
const compte =
  process.argv.find((a) => a.startsWith("--compte="))?.slice("--compte=".length) ?? null;

async function main() {
  titre("1. Les séances du 6 septembre");
  if (compte) console.log(`  (restreint au compte ${compte.slice(0, 8)}…)`);

  const candidates = await db
    .select({
      id: sessionLogs.id,
      userId: sessionLogs.userId,
      date: sessionLogs.date,
      dureeMinutes: sessionLogs.dureeMinutes,
      gymId: sessionLogs.gymId,
      gymNom: gyms.nom,
      series: sql<number>`(select count(*) from set_logs where set_logs.session_log_id = ${sessionLogs.id})`,
      exercices: sql<number>`(select count(distinct exercise_instance_id) from set_logs where set_logs.session_log_id = ${sessionLogs.id})`,
    })
    .from(sessionLogs)
    .leftJoin(gyms, eq(gyms.id, sessionLogs.gymId))
    .where(eq(sessionLogs.date, ATTENDU.date));

  if (candidates.length === 0) {
    console.log("Aucune séance à cette date. Rien à réparer, rien à conclure.");
    return;
  }

  for (const c of candidates) {
    console.log(
      `  ${c.id}  compte=${c.userId.slice(0, 8)}…  ${Number(c.exercices)} exercices, ` +
        `${Number(c.series)} séries, ${c.dureeMinutes ?? "—"} min, salle « ${c.gymNom ?? "?"} »`,
    );
  }

  titre("2. Convergence des critères");

  /*
   * Tous les critères, ou aucun.
   *
   * Une séance qui coche cinq critères sur six n'est pas « celle-là à peu
   * près ». Réparer la mauvaise séance créerait exactement le défaut qu'on
   * cherche à corriger, dans l'autre sens.
   *
   * `count(*)` revient en `bigint`, que le pilote rend en CHAÎNE.
   *
   * Comparé tel quel à un nombre, il ne correspond jamais : le script
   * annonçait « 0 séance ne coche tous les critères » alors que la séance
   * était sous ses yeux. C'est le genre d'erreur qui, dans un diagnostic,
   * conclut à l'absence de problème.
   */
  const retenues = candidates.filter(
    (c) =>
      Number(c.exercices) === ATTENDU.exercices &&
      Number(c.series) === ATTENDU.series &&
      c.dureeMinutes !== null &&
      Math.abs(c.dureeMinutes - ATTENDU.dureeMinutes) <= 2 &&
      (c.gymNom ?? "").toLowerCase().includes(ATTENDU.salle.toLowerCase()) &&
      // Le compte, quand il est fourni : c'est le critère qui départage deux
      // séances identiques sur tout le reste.
      (compte === null || c.userId === compte),
  );

  console.log(`  ${retenues.length} séance(s) cochent TOUS les critères.`);
  if (retenues.length !== 1) {
    console.log(
      "  → Diagnostic non concluant. On ne propose aucune réparation : le " +
        "risque d'écrire sur la mauvaise séance dépasse le bénéfice." +
        (compte === null && retenues.length > 1
          ? "\n     Relance avec --compte=<uuid> pour lever l'ambiguïté."
          : ""),
    );
    return;
  }

  const seance = retenues[0]!;
  console.log(`  Séance retenue : ${seance.id}`);

  titre("3. Les séries suspectes, telles qu'elles sont stockées");

  const suspectes = await db
    .select({
      setId: setLogs.id,
      instanceId: setLogs.exerciseInstanceId,
      machineNom: exerciseInstances.machineNom,
      exerciceNom: exercises.nom,
      numero: setLogs.numeroSerie,
      reps: setLogs.repsEffectuees,
      charge: setLogs.charge,
    })
    .from(setLogs)
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(
      and(
        eq(setLogs.sessionLogId, seance.id),
        eq(setLogs.charge, ATTENDU.chargeMalAttribuee),
        eq(setLogs.repsEffectuees, ATTENDU.repsMalAttribuees),
      ),
    );

  for (const s of suspectes) {
    console.log(
      `  série ${s.numero} : ${s.charge} kg × ${s.reps} — enregistrée sous ` +
        `« ${s.exerciceNom} » (${s.machineNom})`,
    );
  }

  const malAttribuees = suspectes.filter((s) =>
    s.exerciceNom.toLowerCase().includes("cable crunch"),
  );

  if (malAttribuees.length !== 2) {
    console.log(
      `  → ${malAttribuees.length} série(s) sous « ${ATTENDU.nomPrevu} » au lieu de 2. ` +
        "Diagnostic non concluant, aucune réparation proposée.",
    );
    return;
  }

  titre("4. La machine réellement utilisée");

  const cibles = await db
    .select({
      id: exerciseInstances.id,
      machineNom: exerciseInstances.machineNom,
      exerciceNom: exercises.nom,
      gymNom: gyms.nom,
    })
    .from(exerciseInstances)
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .innerJoin(gyms, eq(gyms.id, exerciseInstances.gymId))
    .where(and(eq(exerciseInstances.gymId, seance.gymId!), sql`${exerciseInstances.archiveLe} is null`));

  const abdo = cibles.filter(
    (c) =>
      c.exerciceNom.toLowerCase().includes("abdominal crunch") ||
      (c.machineNom ?? "").toLowerCase().includes("abdominal crunch"),
  );

  for (const c of abdo) {
    console.log(`  ${c.id}  « ${c.exerciceNom} » (${c.machineNom}) — ${c.gymNom}`);
  }

  if (abdo.length !== 1) {
    console.log(
      `  → ${abdo.length} instance(s) « ${ATTENDU.nomReel} » dans cette salle au lieu ` +
        "d'une seule. Sans destination unique, on ne propose rien.",
    );
    return;
  }

  titre("5. Réparation proposée — À EXÉCUTER À LA MAIN, APRÈS LECTURE");

  const destination = abdo[0]!;
  console.log(`
  Ce qui est stocké   : ${malAttribuees.length} séries de ${ATTENDU.chargeMalAttribuee} kg × ${ATTENDU.repsMalAttribuees}
                        sous « ${malAttribuees[0]!.exerciceNom} » (${malAttribuees[0]!.machineNom})
  Ce qui devrait l'être : les mêmes séries sous « ${destination.exerciceNom} » (${destination.machineNom})

  Le SQL ci-dessous ne touche QUE ces deux lignes-là : il les désigne par leur
  identifiant, dans cette séance, avec cette charge et ces répétitions. Aucune
  autre séance, aucun autre exercice, aucun autre compte ne peut être atteint.

  Il est idempotent : relancé, il ne trouve plus rien à modifier, puisque la
  condition porte sur l'instance de DÉPART.

  BEGIN;

  -- Vérification AVANT : doit rendre exactement ${malAttribuees.length} lignes.
  SELECT id, numero_serie, charge, reps_effectuees, exercise_instance_id
  FROM set_logs
  WHERE id IN (${malAttribuees.map((s) => `'${s.setId}'`).join(", ")})
    AND exercise_instance_id = '${malAttribuees[0]!.instanceId}';

  UPDATE set_logs
  SET exercise_instance_id = '${destination.id}',
      updated_at = now()
  WHERE id IN (${malAttribuees.map((s) => `'${s.setId}'`).join(", ")})
    AND exercise_instance_id = '${malAttribuees[0]!.instanceId}';
  -- Doit afficher : UPDATE ${malAttribuees.length}

  -- Vérification APRÈS : plus rien sous le Cable Crunch pour cette séance…
  SELECT count(*) AS restant_sous_cable_crunch
  FROM set_logs
  WHERE session_log_id = '${seance.id}'
    AND exercise_instance_id = '${malAttribuees[0]!.instanceId}';
  -- Attendu : 0

  -- …et deux séries sous l'Abdominal Crunch.
  SELECT count(*) AS desormais_sous_abdominal_crunch
  FROM set_logs
  WHERE session_log_id = '${seance.id}'
    AND exercise_instance_id = '${destination.id}';
  -- Attendu : ${malAttribuees.length}

  COMMIT;

  Ce qui n'est PAS corrigé, faute de savoir : la qualité technique de ces deux
  séries. Ressenti abdominal quasi nul, légère gêne entre les omoplates,
  réglage de siège incertain — ce sont des observations, pas des mesures. Elles
  ont leur place dans la note de l'appareil, pas dans une réparation SQL.
`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
