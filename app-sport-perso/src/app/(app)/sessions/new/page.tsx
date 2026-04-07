import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeanceTemplate, ProgrammeBloc } from "@/db/schema";
import { db } from "@/db/client";
import { programmeBlocs, seanceTemplates } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

export default async function NewSessionPage() {
  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(eq(programmeBlocs.userId, MOCK_USER_ID), eq(programmeBlocs.actif, true)),
  });

  if (!bloc) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-white mb-4">Nouvelle séance</h1>
        <p className="text-zinc-500">Aucun bloc actif. Créez un programme d'abord.</p>
      </div>
    );
  }

  const templates = await db.query.seanceTemplates.findMany({
    where: eq(seanceTemplates.blocId, bloc.id),
    orderBy: (st, { asc }) => [asc(st.ordreDansSemaine)],
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-white">Nouvelle séance</h1>
      <p className="text-zinc-500 text-sm">{bloc.nom}</p>

      <div className="space-y-3">
        {templates.map((template) => (
          <Link key={template.id} href={`/sessions/new/${template.id}?gymId=`}>
            <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 cursor-pointer">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                  <span className="text-xl font-bold text-white">{template.lettre}</span>
                </div>
                <div>
                  <CardTitle className="text-white text-base">{template.nom}</CardTitle>
                  <p className="text-zinc-500 text-xs">{template.lettre}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
