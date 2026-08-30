import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs, exerciseInstances, exercises } from "@/db/schema";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { lundiDe } from "@/lib/semaines";

/**
 * Volume par pilier et par semaine.
 *
 * Trois défauts corrigés ici :
 *
 * — la clé de semaine valait `Math.ceil((jourDuMois + mois × 30) / 7)`. Ce
 *   numéro n'existe pas : il collait des semaines distinctes sous la même
 *   étiquette et les triait dans le désordre. C'est le lundi de la semaine,
 *   maintenant, qui sert de clé — comparable et triable tel quel.
 * — la route interrogeait la base une fois par séance, puis deux fois par
 *   série. Une jointure suffit.
 * — les séances archivées étaient comptées, alors que l'archivage existe
 *   précisément pour les retirer des calculs.
 */
export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mois = Math.min(24, Math.max(1, Number(new URL(request.url).searchParams.get("months") ?? 3)));
  const debut = new Date();
  debut.setMonth(debut.getMonth() - mois);
  const depuis = debut.toISOString().slice(0, 10);

  const lignes = await db
    .select({
      date: sessionLogs.date,
      charge: setLogs.charge,
      reps: setLogs.repsEffectuees,
      pilier: exercises.pilier,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .innerJoin(exerciseInstances, eq(exerciseInstances.id, setLogs.exerciseInstanceId))
    .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
    .where(
      and(
        eq(sessionLogs.userId, userId),
        isNull(sessionLogs.archiveLe),
        gte(sessionLogs.date, depuis),
      ),
    )
    .orderBy(asc(sessionLogs.date));

  const parSemaine = new Map<string, Record<string, number>>();

  for (const l of lignes) {
    const semaine = lundiDe(l.date);
    const volumes = parSemaine.get(semaine) ?? {};
    const pilier = l.pilier?.toLowerCase() || "core";
    volumes[pilier] = (volumes[pilier] ?? 0) + l.charge * l.reps;
    parSemaine.set(semaine, volumes);
  }

  const resultat = [...parSemaine.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, volumes]) => ({
      week,
      ...Object.fromEntries(Object.entries(volumes).map(([k, v]) => [k, Math.round(v)])),
    }));

  return NextResponse.json(resultat);
}
