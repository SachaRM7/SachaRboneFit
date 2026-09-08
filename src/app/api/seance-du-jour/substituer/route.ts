import { NextResponse } from "next/server";
import { ligneeApresSubstitution } from "@/lib/live/vue-live";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { exerciseInstances, sessionLogs, sessionPlanItems, users } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

/**
 * Remplacer un exercice pendant la séance, pour de bon.
 *
 * Le remplacement existait déjà — le moteur, la modale « machine occupée » —
 * mais il ne se posait nulle part : le gestionnaire affichait une notification
 * et refermait la fenêtre. Le 6 septembre, `Cable Crunch` a donc été fait sur
 * une tout autre machine, et ses deux séries se sont enregistrées sous le nom
 * de l'exercice prévu. La base croit maintenant qu'un Cable Crunch se fait à
 * 27 kg × 8.
 *
 * C'est le pire des deux mondes : une donnée fausse, et personne pour le
 * savoir. Une charge n'a de sens que rapportée à l'appareil qui l'a produite.
 *
 * Ce que cette route écrit, et pourquoi ces colonnes existaient déjà :
 *
 *   `exerciseInstanceId`        ce qui est RÉELLEMENT fait — les séries s'y
 *                              rattacheront
 *   `exerciseInstancePrevuId`   ce que la séance devait être, écrit une fois et
 *                              jamais réécrit : sans lui, la progression
 *                              conclurait à une absence inexpliquée
 *   `substitutionDeInstanceId`  ce qu'on remplace à cet instant précis
 *   `raisonSubstitution`        ce que l'utilisateur a répondu, en clair
 *   `contexteAdaptation`        la même chose pour le moteur
 *
 * Ce que cette route ne fait PAS : reporter la charge précédente sur le
 * remplaçant. Deux machines ne se valent pas parce qu'elles visent le même
 * muscle — l'historique de chacune reste le sien.
 */

/** Ce que l'utilisateur peut invoquer. La dernière laisse la porte ouverte. */
export const RAISONS_SUBSTITUTION = [
  "occupee",
  "inconfortable",
  "trop_complique",
  "genant_en_public",
  "douloureux",
  "pas_apprecie",
  "autre",
] as const;

const corpsSchema = z.object({
  sessionLogId: z.string().uuid(),
  /** L'exercice tel qu'il est affiché en ce moment. */
  remplaceInstanceId: z.string().uuid(),
  /** Celui qui prend sa place. */
  remplacantInstanceId: z.string().uuid(),
  raison: z.enum(RAISONS_SUBSTITUTION),
  /** Précision libre, facultative — jamais exigée. */
  precision: z.string().trim().max(300).nullable().optional(),
  /**
   * Distinct du remplacement ponctuel, et c'est volontaire.
   *
   * Ne plus vouloir d'un exercice ne se déduit pas d'une machine occupée un
   * mardi soir. Bannir sur une seule substitution ferait disparaître du
   * programme des mouvements qu'on voulait juste éviter aujourd'hui.
   */
  eviterAlAvenir: z.boolean().optional(),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parse = corpsSchema.safeParse(await request.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { sessionLogId, remplaceInstanceId, remplacantInstanceId, raison, precision, eviterAlAvenir } =
    parse.data;

  if (remplaceInstanceId === remplacantInstanceId) {
    return NextResponse.json({ error: "Même exercice" }, { status: 400 });
  }

  // La séance appartient-elle bien à ce compte ? Sans cette lecture, un
  // identifiant deviné suffirait à réécrire le plan de quelqu'un d'autre.
  const seance = await db.query.sessionLogs.findFirst({
    where: and(eq(sessionLogs.id, sessionLogId), eq(sessionLogs.userId, userId)),
    columns: { id: true, gymId: true },
  });
  if (!seance) return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });

  // Le remplaçant doit exister, ne pas être archivé, et être dans la salle où
  // l'on se trouve : proposer une machine qu'on n'a pas devant soi n'aide pas.
  const remplacant = await db.query.exerciseInstances.findFirst({
    where: and(eq(exerciseInstances.id, remplacantInstanceId), isNull(exerciseInstances.archiveLe)),
  });
  if (!remplacant) {
    return NextResponse.json({ error: "Machine introuvable" }, { status: 404 });
  }
  if (seance.gymId && remplacant.gymId !== seance.gymId) {
    return NextResponse.json({ error: "Cette machine est dans une autre salle" }, { status: 400 });
  }

  const item = await db.query.sessionPlanItems.findFirst({
    where: and(
      eq(sessionPlanItems.sessionLogId, sessionLogId),
      eq(sessionPlanItems.exerciseInstanceId, remplaceInstanceId),
    ),
  });

  if (item) {
    await db
      .update(sessionPlanItems)
      .set({
        exerciseInstanceId: remplacantInstanceId,
        substitutionDeInstanceId: remplaceInstanceId,
        // Écrit une seule fois : après deux remplacements successifs, il
        // désigne toujours ce que la séance devait être au départ.
        exerciseInstancePrevuId: item.exerciseInstancePrevuId ?? remplaceInstanceId,
        raisonSubstitution: precision?.trim() || raison,
        contexteAdaptation: {
          ...(item.contexteAdaptation ?? {}),
          type: raison === "occupee" ? "machine_occupee" : "autre",
          horodatage: new Date().toISOString(),
          /*
           * La lignée COMPLÈTE du slot, écrite en base.
           *
           * Le brouillon local la tenait déjà, ce qui suffisait à un
           * rafraîchissement — pas à un `localStorage` purgé par Safari, ni à
           * une reprise depuis un autre contexte. Or les séries, elles, sont
           * relues depuis Postgres : sans lignée serveur, la nouvelle machine
           * repartait à 0/3 alors qu'une série avait été soulevée.
           *
           * Et c'est bien la LISTE, pas les deux colonnes : après A→B→C, ni
           * `substitutionDeInstanceId` ni `exerciseInstancePrevuId` ne nomment
           * B — qui porte peut-être une série.
           */
          ligneeInstances: ligneeApresSubstitution(
            item.contexteAdaptation?.ligneeInstances,
            item.exerciseInstancePrevuId,
            remplaceInstanceId,
            remplacantInstanceId,
          ),
        },
        /*
         * La charge suggérée et les répétitions proposées DISPARAISSENT.
         *
         * Elles venaient de la double progression sur l'historique de l'ancienne
         * instance. Les recopier, ce serait annoncer « tu faisais 27 kg ici »
         * sur une machine où l'utilisateur n'a jamais rien fait.
         */
        chargeSuggeree: null,
        repsSuggerees: null,
        messageProgression: null,
        updatedAt: new Date(),
      })
      .where(eq(sessionPlanItems.id, item.id));
  }

  if (eviterAlAvenir) {
    // La liste existe déjà et le planificateur la lit : on s'y ajoute, sans
    // doublon, plutôt que d'inventer un second endroit où dire la même chose.
    const profil = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { exercicesRefuses: true },
    });
    const dejaRefuses = profil?.exercicesRefuses ?? [];
    const aEviter = (await db.query.exerciseInstances.findFirst({
      where: eq(exerciseInstances.id, remplaceInstanceId),
      columns: { exerciseId: true },
    }))?.exerciseId;

    if (aEviter && !dejaRefuses.includes(aEviter)) {
      await db
        .update(users)
        .set({ exercicesRefuses: [...dejaRefuses, aEviter], updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
  }

  return NextResponse.json({
    remplace: remplaceInstanceId,
    remplacant: remplacantInstanceId,
    // Vrai quand la séance porte un plan : sinon le remplacement ne vaut que
    // pour l'affichage en cours, et il faut le dire plutôt que le laisser
    // croire persisté.
    planMisAJour: Boolean(item),
    eviteAlAvenir: Boolean(eviterAlAvenir),
  });
}
