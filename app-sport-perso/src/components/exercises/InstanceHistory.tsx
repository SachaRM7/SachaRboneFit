import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SetLog, ExerciseInstance, Exercise } from "@/db/schema";

interface InstanceHistoryProps {
  setLogs: (SetLog & { sessionLog?: { date: string; energieFin?: number | null } })[];
  exerciseName: string;
}

export function InstanceHistory({ setLogs, exerciseName }: InstanceHistoryProps) {
  if (setLogs.length === 0) return null;

  // Group by session
  const grouped = setLogs.reduce((acc, log) => {
    const key = log.sessionLogId;
    if (!acc[key]) {
      acc[key] = { date: log.sessionLog?.date || "", sets: [], energieFin: log.sessionLog?.energieFin };
    }
    acc[key].sets.push(log);
    return acc;
  }, {} as Record<string, { date: string; sets: SetLog[]; energieFin?: number | null }>);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-400">Historique</h3>
      {Object.entries(grouped)
        .sort((a, b) => new Date(b[1].date).getTime() - new Date(a[1].date).getTime())
        .slice(0, 6)
        .map(([sessionId, group]) => {
          const charge = group.sets[0]?.charge;
          const reps = group.sets.map(s => s.repsEffectuees).join("/");
          const rpe = group.sets[0]?.rpeEffectif;
          const dateStr = group.date ? new Date(group.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "??";

          return (
            <div key={sessionId} className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">{dateStr}</span>
              <span className="text-white font-medium">
                {charge} kg × {reps}
                {rpe && <span className="text-zinc-500"> — RPE {rpe}</span>}
              </span>
            </div>
          );
        })}
    </div>
  );
}
