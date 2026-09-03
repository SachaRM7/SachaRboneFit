import { redirect } from "next/navigation";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";
import { nombre } from "@/lib/format";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { db } from "@/db/client";
import { bodyWeights } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { BodyWeightForm } from "@/components/bodyweight/BodyWeightForm";
import { WeightSparkline } from "@/components/bodyweight/WeightSparkline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BodyweightPage() {
  // Mémoïsé pour la durée du rendu : le layout vient de faire cet
  // aller-retour vers le serveur d'authentification, inutile de le refaire.
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const weights = await db.query.bodyWeights.findMany({
    where: eq(bodyWeights.userId, userId),
    orderBy: [desc(bodyWeights.date)],
    limit: 30,
  });

  const latest = weights[0];

  return (
    <div className="p-4 space-y-4">
      <EnTeteSecondaire titre="Poids de corps" vers="/settings" libelleRetour="Retour à Plus" />

      <Card className="bg-carte border-filet">
        <CardContent className="pt-4">
          {latest && (
            <div className="mb-4">
              <p className="text-3xl font-bold text-encre">{nombre(latest.poids, 1)} kg</p>
              <p className="text-encre-3 text-sm">
                {new Date(latest.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>
          )}
          <WeightSparkline data={weights.map(w => ({ date: w.date, poids: w.poids }))} />
        </CardContent>
      </Card>

      <Card className="bg-carte border-filet">
        <CardHeader>
          <CardTitle className="text-encre text-sm">Ajouter une mesure</CardTitle>
        </CardHeader>
        <CardContent>
          <BodyWeightForm />
        </CardContent>
      </Card>

      <div className="space-y-2">
        {weights.map((w) => (
          <div key={w.id} className="flex justify-between items-center py-2 border-b border-filet">
            <span className="text-encre-3 text-sm">
              {new Date(w.date).toLocaleDateString("fr-FR")}
            </span>
            <span className="text-encre font-medium">{w.poids} kg</span>
          </div>
        ))}
      </div>
    </div>
  );
}
