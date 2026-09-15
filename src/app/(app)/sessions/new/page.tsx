import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { db } from "@/db/client";
import { seanceTemplates, users } from "@/db/schema";
import { prochaineSeance } from "@/services/programmes";
import { seanceCourante } from "@/services/seances";
import { lireBlocs } from "@/services/blocs";
import { SessionHub } from "@/components/session-composer/SessionHub";
import { repereSeanceVisible } from "@/lib/session-composer/repere-visible";

/**
 * Le centre de contrôle des séances.
 *
 * Deux choses différentes vivent ici, et les confondre était le piège : la
 * ROTATION, qui a un programme actif et une prochaine séance, et la
 * CONSULTATION, qui regarde les séances d'un programme choisi. Le sélecteur lit
 * `?programme=` et n'active rien — activer un programme reste une action
 * distincte, avec son propre bouton, sur l'écran Programme.
 */
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ programme?: string }>;
}) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const { programme: programmeDemande } = await searchParams;

  const [next, current, profile, blocs] = await Promise.all([
    prochaineSeance(userId),
    seanceCourante(userId),
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    lireBlocs(userId),
  ]);

  // La requête mène, sinon le programme actif, sinon le premier enregistré. Un
  // identifiant inconnu ou archivé ne laisse donc jamais l'écran vide : il
  // retombe sur l'actif plutôt que d'annoncer « aucune séance ».
  const actif = blocs.actif ?? blocs.tous[0] ?? null;
  const selectionne = blocs.tous.find((bloc) => bloc.id === programmeDemande) ?? actif;

  const templates = selectionne
    ? await db.query.seanceTemplates.findMany({
        where: eq(seanceTemplates.blocId, selectionne.id),
        orderBy: [asc(seanceTemplates.ordreDansSemaine)],
      })
    : [];
  const indexProchaine = next
    ? next.toutesLesSeances.findIndex((template) => template.id === next.template.id)
    : -1;
  const positionProchaine = Math.max(indexProchaine, 0) + 1;

  return (
    <SessionHub
      blockName={selectionne?.nom ?? null}
      programmes={blocs.tous.map((bloc) => ({
        id: bloc.id,
        nom: bloc.nom,
        actif: Boolean(bloc.actif),
      }))}
      selectedProgrammeId={selectionne?.id ?? null}
      next={next
        ? {
            id: next.template.id,
            marker: repereSeanceVisible(
              next.template.lettre,
              indexProchaine,
              next.bloc.typeCycle,
            ),
            name: next.template.nom,
            programName: next.bloc.nom,
            programType: next.bloc.typeCycle,
            position: positionProchaine,
            total: next.toutesLesSeances.length,
          }
        : null}
      defaultGymId={profile?.prefSalleParDefautId ?? ""}
      templates={templates.map((template, index) => ({
        id: template.id,
        marker: repereSeanceVisible(template.lettre, index, selectionne?.typeCycle ?? ""),
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
