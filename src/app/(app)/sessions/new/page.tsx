import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { db } from "@/db/client";
import { programmeBlocs, seanceTemplates, users } from "@/db/schema";
import { prochaineSeance } from "@/services/programmes";
import { seanceCourante } from "@/services/seances";
import { SessionHub } from "@/components/session-composer/SessionHub";

export default async function SessionsPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const [next, current, profile] = await Promise.all([
    prochaineSeance(userId),
    seanceCourante(userId),
    db.query.users.findFirst({ where: eq(users.id, userId) }),
  ]);

  const block = next?.bloc ?? await db.query.programmeBlocs.findFirst({
    where: and(
      eq(programmeBlocs.userId, userId),
      eq(programmeBlocs.actif, true),
      isNull(programmeBlocs.archiveLe),
    ),
  });

  const templates = block
    ? await db.query.seanceTemplates.findMany({
        where: eq(seanceTemplates.blocId, block.id),
        orderBy: [asc(seanceTemplates.ordreDansSemaine)],
      })
    : [];

  return (
    <SessionHub
      blockName={block?.nom ?? null}
      nextTemplateId={next?.template.id ?? null}
      defaultGymId={profile?.prefSalleParDefautId ?? ""}
      templates={templates.map((template) => ({
        id: template.id,
        letter: template.lettre,
        name: template.nom,
      }))}
      current={current?.seanceTemplateId ? {
        sessionId: current.id,
        templateId: current.seanceTemplateId,
        gymId: current.gymId,
      } : null}
    />
  );
}
