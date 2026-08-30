import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, setLogs } from "@/db/schema";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

/**
 * Charges séance après séance, pour un exercice.
 *
 * La version précédente chargeait TOUTES les séries de l'instance — sans
 * condition d'utilisateur en SQL — puis interrogeait la base une fois par
 * série pour retrouver sa séance et vérifier le propriétaire en mémoire. Le
 * filtrage était correct au final, mais il lisait les lignes d'autrui pour
 * les écarter ensuite, et coûtait une requête par série. La jointure fait les
 * deux d'un coup, et exclut au passage les séances archivées.
 */
export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parametres = new URL(request.url).searchParams;
  const instanceId = parametres.get("instanceId");
  if (!instanceId) return NextResponse.json({ error: "instanceId required" }, { status: 400 });

  const mois = Math.min(24, Math.max(1, Number(parametres.get("months") ?? 3)));
  const debut = new Date();
  debut.setMonth(debut.getMonth() - mois);
  const depuis = debut.toISOString().slice(0, 10);

  const lignes = await db
    .select({
      sessionLogId: setLogs.sessionLogId,
      date: sessionLogs.date,
      charge: setLogs.charge,
      reps: setLogs.repsEffectuees,
    })
    .from(setLogs)
    .innerJoin(sessionLogs, eq(sessionLogs.id, setLogs.sessionLogId))
    .where(
      and(
        eq(setLogs.exerciseInstanceId, instanceId),
        eq(sessionLogs.userId, userId),
        isNull(sessionLogs.archiveLe),
        gte(sessionLogs.date, depuis),
      ),
    )
    .orderBy(asc(sessionLogs.date));

  const parSeance = new Map<
    string,
    { date: string; best1RM: number; totalVolume: number; bestSet: { charge: number; reps: number } }
  >();

  for (const l of lignes) {
    const estimation = l.charge * (1 + l.reps / 30);
    const volume = l.charge * l.reps;
    const actuel = parSeance.get(l.sessionLogId);
    if (!actuel) {
      parSeance.set(l.sessionLogId, {
        date: l.date,
        best1RM: estimation,
        totalVolume: volume,
        bestSet: { charge: l.charge, reps: l.reps },
      });
      continue;
    }
    if (estimation > actuel.best1RM) {
      actuel.best1RM = estimation;
      actuel.bestSet = { charge: l.charge, reps: l.reps };
    }
    actuel.totalVolume += volume;
  }

  const resultat = [...parSeance.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      best1RM: Math.round(r.best1RM),
      totalVolume: Math.round(r.totalVolume),
      bestSet: r.bestSet,
    }));

  return NextResponse.json(resultat);
}
