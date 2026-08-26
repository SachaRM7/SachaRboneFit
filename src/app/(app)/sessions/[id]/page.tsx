import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { sessionLogs, setLogs, gyms, seanceTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SessionDebrief } from "@/components/coach/SessionDebrief";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  // La requete n'etait pas scopee : n'importe quel compte authentifie pouvait
  // consulter la seance d'un autre en connaissant son identifiant.
  const session = await db.query.sessionLogs.findFirst({
    where: and(eq(sessionLogs.id, id), eq(sessionLogs.userId, userId)),
  });

  if (!session) notFound();

  const gym = session.gymId ? await db.query.gyms.findFirst({ where: eq(gyms.id, session.gymId) }) : null;
  const template = session.seanceTemplateId ? await db.query.seanceTemplates.findFirst({ where: eq(seanceTemplates.id, session.seanceTemplateId) }) : null;

  const sets = await db.query.setLogs.findMany({
    where: eq(setLogs.sessionLogId, id),
  });

  const exerciseInstanceIds = [...new Set(sets.map(s => s.exerciseInstanceId))];
  const instances = await db.query.exerciseInstances.findMany({
    where: (ei, { inArray }) => inArray(ei.id, exerciseInstanceIds),
  });

  const exercises = await db.query.exercises.findMany({
    where: (ex, { inArray }) => inArray(ex.id, instances.map(i => i.exerciseId)),
  });

  const instanceMap = new Map(instances.map(i => [i.id, { ...i, exercise: exercises.find(e => e.id === i.exerciseId) }]));

  // Group sets by exercise
  const groupedSets = sets.reduce((acc, set) => {
    const exId = set.exerciseInstanceId;
    if (!acc[exId]) acc[exId] = [];
    (acc[exId] as typeof sets).push(set);
    return acc;
  }, {} as Record<string, typeof sets>);

  const typedSession = session;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-encre">Séance du {session.date}</h1>

      <Card className="bg-carte border-filet">
        <CardContent className="pt-4 space-y-2">
          {gym && <p className="text-encre-2 text-sm">Salle: {gym.nom}</p>}
          {template && <p className="text-encre-2 text-sm">Template: {template.nom}</p>}
          {session.dureeMinutes && <p className="text-encre-2 text-sm">Durée: {session.dureeMinutes} min</p>}
          {session.energieFin && <p className="text-encre-2 text-sm">Énergie fin: {session.energieFin}/10</p>}
          {session.notesSeance && <p className="text-encre-3 text-sm mt-2">{session.notesSeance}</p>}
        </CardContent>
      </Card>

      {/* Coach Debrief */}
      {template?.lettre && (
        <SessionDebrief
          sessionLogId={id}
          templateLettre={template.lettre}
          date={session.date}
        />
      )}

      <div className="space-y-4">
        {Object.entries(groupedSets).map(([exId, exSets]) => {
          const first = (exSets as typeof sets)[0];
          if (!first) return null;
          const inst = instanceMap.get(exId);
          const exName = inst?.exercise?.nom || "Exercice";
          const machineNom = inst?.machineNom || "";

          return (
            <Card key={exId} className="bg-carte border-filet">
              <CardHeader className="pb-2">
                <CardTitle className="text-encre text-sm">{exName}</CardTitle>
                <p className="text-encre-3 text-xs">{machineNom}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {exSets.map((set) => (
                    <div key={set.id} className="flex justify-between items-center text-sm">
                      <span className="text-encre-3">Série {set.numeroSerie}</span>
                      <span className="text-encre font-medium">
                        {set.charge} kg × {set.repsEffectuees}
                        {set.rpeEffectif && <span className="text-encre-3"> — RPE {set.rpeEffectif}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
