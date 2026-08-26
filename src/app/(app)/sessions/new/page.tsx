import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { programmeBlocs, seanceTemplates } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

export default async function NewSessionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(eq(programmeBlocs.userId, user.id), eq(programmeBlocs.actif, true)),
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
          <Link key={template.id} href={`/sessions/new/${template.id}?gymId=`}>
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