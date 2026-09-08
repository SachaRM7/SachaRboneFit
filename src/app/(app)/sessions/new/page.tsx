import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { programmeBlocs, seanceTemplates } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { ArrowUpRight, Dumbbell } from "lucide-react";
import Link from "next/link";

export default async function NewSessionPage() {
  // Mémoïsé pour la durée du rendu : le layout vient de faire cet
  // aller-retour vers le serveur d'authentification, inutile de le refaire.
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe)), eq(programmeBlocs.actif, true)),
  });

  if (!bloc) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-encre mb-4">Nouvelle séance</h1>
        <p className="text-encre-3">Aucun bloc actif. Créez un programme d&apos;abord.</p>
      </div>
    );
  }

  const templates = await db.query.seanceTemplates.findMany({
    where: eq(seanceTemplates.blocId, bloc.id),
    orderBy: (st, { asc }) => [asc(st.ordreDansSemaine)],
  });

  return (
    <div className="p-4 space-y-6">
      <header className="dashboard-header !px-0 !pb-0"><p className="eyebrow">À ton rythme</p><h1>Ta prochaine séance</h1></header>
      <p className="text-encre-3 text-sm">{bloc.nom}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((template) => (
          /* Chaque cible CONSTRUIT un plan de séance : résolution du parc,
             charges, progression. Précharger la liste, c'est en construire
             autant qu'il y a de gabarits, à chaque affichage. */
          <Link key={template.id} href={`/sessions/new/${template.id}?gymId=`} prefetch={false}>
            <Card className="h-full bg-carte border-filet hover:ring-primary/25 transition-all cursor-pointer">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="w-14 h-14 rounded-2xl bg-papier-2 flex items-center justify-center">
                  <span className="text-xl font-bold text-encre">{template.lettre}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-encre text-base">{template.nom}</CardTitle>
                  <p className="text-encre-3 text-xs mt-1 flex items-center gap-1"><Dumbbell size={12} aria-hidden /> Séance {template.lettre}</p>
                </div>
                <ArrowUpRight className="text-primary w-5 h-5 shrink-0" aria-hidden />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}