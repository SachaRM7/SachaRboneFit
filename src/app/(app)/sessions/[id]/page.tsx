import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { sessionLogs, setLogs, gyms, seanceTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SessionDebrief } from "@/components/coach/SessionDebrief";

export default async function SessionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<URLSearchParams> }) {
  const { id } = await params;
  const search = new URLSearchParams(await searchParams);
  const templateLettre = search.get("templateLettre");
  const sessionDate = search.get("sessionDate");

  const session = await db.query.sessionLogs.findFirst({
    where: eq(sessionLogs.id, id),
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
      <h1 className="text-xl font-bold text-white">Séance du {session.date}</h1>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 space-y-2">
          {gym && <p className="text-zinc-400 text-sm">Salle: {gym.nom}</p>}
          {template && <p className="text-zinc-400 text-sm">Template: {template.nom}</p>}
          {session.dureeMinutes && <p className="text-zinc-400 text-sm">Durée: {session.dureeMinutes} min</p>}
          {session.energieFin && <p className="text-zinc-400 text-sm">Énergie fin: {session.energieFin}/100</p>}
          {session.notesSeance && <p className="text-zinc-500 text-sm mt-2">{session.notesSeance}</p>}
        </CardContent>
      </Card>

      {/* Coach Debrief */}
      {templateLettre && sessionDate && (
        <SessionDebrief
          sessionLogId={id}
          templateLettre={templateLettre}
          date={sessionDate}
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
            <Card key={exId} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">{exName}</CardTitle>
                <p className="text-zinc-500 text-xs">{machineNom}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {exSets.map((set) => (
                    <div key={set.id} className="flex justify-between items-center text-sm">
                      <span className="text-zinc-500">Série {set.numeroSerie}</span>
                      <span className="text-white font-medium">
                        {set.charge} kg × {set.repsEffectuees}
                        {set.rpeEffectif && <span className="text-zinc-500"> — RPE {set.rpeEffectif}</span>}
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
