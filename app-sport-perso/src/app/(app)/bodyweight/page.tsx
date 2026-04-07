import { BodyWeightForm } from "@/components/bodyweight/BodyWeightForm";
import { WeightSparkline } from "@/components/bodyweight/WeightSparkline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { bodyWeights } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, desc } from "drizzle-orm";

export default async function BodyweightPage() {
  const weights = await db.query.bodyWeights.findMany({
    where: eq(bodyWeights.userId, MOCK_USER_ID),
    orderBy: [desc(bodyWeights.date)],
    limit: 30,
  });

  const latest = weights[0];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-white">Poids corporel</h1>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4">
          {latest && (
            <div className="mb-4">
              <p className="text-3xl font-bold text-white">{latest.poids.toFixed(1)} kg</p>
              <p className="text-zinc-500 text-sm">
                {new Date(latest.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>
          )}
          <WeightSparkline data={weights.map(w => ({ date: w.date, poids: w.poids }))} />
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Ajouter une mesure</CardTitle>
        </CardHeader>
        <CardContent>
          <BodyWeightForm />
        </CardContent>
      </Card>

      <div className="space-y-2">
        {weights.map((w) => (
          <div key={w.id} className="flex justify-between items-center py-2 border-b border-zinc-800">
            <span className="text-zinc-500 text-sm">
              {new Date(w.date).toLocaleDateString("fr-FR")}
            </span>
            <span className="text-white font-medium">{w.poids} kg</span>
          </div>
        ))}
      </div>
    </div>
  );
}
