import { redirect } from "next/navigation";
import { avecUnite } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { bodyWeights, sessionLogs, programmeBlocs } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";

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
      where: and(eq(sessionLogs.userId, user.id), isNull(sessionLogs.archiveLe)),
      orderBy: [desc(sessionLogs.createdAt)],
    }),
    db.query.programmeBlocs.findFirst({
      where: (pb, { eq, and }) => and(eq(pb.userId, user.id), isNull(pb.archiveLe), eq(pb.actif, true)),
    }),
  ]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-encre mb-6">Dashboard</h1>

      <Card className="bg-carte border-filet">
        <CardHeader>
          <CardTitle className="text-encre text-lg">Bienvenue, {user.email?.split("@")[0]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-encre-2 text-sm">Membre depuis {new Date(user.created_at).toLocaleDateString("fr-FR")}</p>
        </CardContent>
      </Card>

      <Card className="bg-carte border-filet">
        <CardHeader>
          <CardTitle className="text-encre text-sm">Bloc actif</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="border-filet text-encre-2">
            {blocActif?.nom || "Pas encore de programme"}
          </Badge>
        </CardContent>
      </Card>

      <Card className="bg-carte border-filet">
        <CardHeader>
          <CardTitle className="text-encre text-sm">Dernière séance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-encre text-lg font-medium">
            {lastSession?.date
              ? new Date(lastSession.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
              : "Ta première séance reste à faire"}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-carte border-filet">
        <CardHeader>
          <CardTitle className="text-encre text-sm">Poids actuel</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-encre text-lg font-medium">
            {lastWeight ? avecUnite(lastWeight.poids, "kg", 1) : "À renseigner"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
