import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { sessionLogs, setLogs, gyms, seanceTemplates } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await db.query.sessionLogs.findFirst({
    where: eq(sessionLogs.id, id),
    with: {
      gym: true,
      seanceTemplate: true,
    },
  });

  if (!session) notFound();

  const sets = await db.query.setLogs.findMany({
    where: eq(setLogs.sessionLogId, id),
    with: {
      exerciseInstance: {
        with: {
          exercise: true,
          gym: true,
        },
      },
    },
    orderBy: [setLogs.numeroSerie],
  });

  // Group sets by exercise
  const groupedSets = sets.reduce((acc, set) => {
    const exId = set.exerciseInstanceId;
    if (!acc[exId]) acc[exId] = [];
    (acc[exId] as typeof sets).push(set);
    return acc;
  }, {} as Record<string, typeof sets>);

  const typedSession = session as any;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-white">Séance du {session.date}</h1>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 space-y-2">
          {typedSession.gym && <p className="text-zinc-400 text-sm">Salle: {typedSession.gym.nom}</p>}
          {typedSession.seanceTemplate && <p className="text-zinc-400 text-sm">Template: {typedSession.seanceTemplate.nom}</p>}
          {session.dureeMinutes && <p className="text-zinc-400 text-sm">Durée: {session.dureeMinutes} min</p>}
          {session.energieFin && <p className="text-zinc-400 text-sm">Énergie fin: {session.energieFin}/100</p>}
          {session.notesSeance && <p className="text-zinc-500 text-sm mt-2">{session.notesSeance}</p>}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {Object.entries(groupedSets).map(([exId, exSets]) => {
          const first = (exSets as typeof sets)[0];
          if (!first) return null;
          const exName = (first as any).exerciseInstance?.exercise?.nom || "Exercice";
          const machineNom = (first as any).exerciseInstance?.machineNom || "";

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
