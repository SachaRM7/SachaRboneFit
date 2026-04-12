import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { bodyWeights, sessionLogs, programmeBlocs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [lastWeight, lastSession, blocActif] = await Promise.all([
    db.query.bodyWeights.findFirst({
      where: eq(bodyWeights.userId, user.id),
      orderBy: [desc(bodyWeights.date)],
    }),
    db.query.sessionLogs.findFirst({
      where: eq(sessionLogs.userId, user.id),
      orderBy: [desc(sessionLogs.createdAt)],
    }),
    db.query.programmeBlocs.findFirst({
      where: (pb, { eq, and }) => and(eq(pb.userId, user.id), eq(pb.actif, true)),
    }),
  ]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Bienvenue, {user.email?.split("@")[0]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-400 text-sm">Membre depuis {new Date(user.created_at).toLocaleDateString("fr-FR")}</p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Bloc actif</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            {blocActif?.nom || "Aucun bloc actif"}
          </Badge>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Dernière séance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-white text-lg font-medium">
            {lastSession?.date
              ? new Date(lastSession.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
              : "Aucune séance"}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Poids actuel</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-white text-lg font-medium">
            {lastWeight ? `${lastWeight.poids.toFixed(1)} kg` : "Non renseigné"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
