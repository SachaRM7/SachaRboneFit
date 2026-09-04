import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { programmeBlocs, seanceTemplates } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-encre">Nouvelle séance</h1>
      <p className="text-encre-3 text-sm">{bloc.nom}</p>

      <div className="space-y-3">
        {templates.map((template) => (
          /* Chaque cible CONSTRUIT un plan de séance : résolution du parc,
             charges, progression. Précharger la liste, c'est en construire
             autant qu'il y a de gabarits, à chaque affichage. */
          <Link key={template.id} href={`/sessions/new/${template.id}?gymId=`} prefetch={false}>
            <Card className="bg-carte border-filet hover:border-filet cursor-pointer">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded-full bg-papier-2 flex items-center justify-center">
                  <span className="text-xl font-bold text-encre">{template.lettre}</span>
                </div>
                <div>
                  <CardTitle className="text-encre text-base">{template.nom}</CardTitle>
                  <p className="text-encre-3 text-xs">{template.lettre}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}