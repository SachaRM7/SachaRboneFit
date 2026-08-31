import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { exerciseInstances, exerciseInTemplate, setLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { majMachineSchema } from "@/lib/validators/exercise-instance";
import { peutGererLaSalle, REFUS_GESTION_SALLE } from "@/lib/autorisations";
import { proprietesFigeesModifiees, refusDeModification } from "@/lib/engine/charges";

/**
 * L'entree decrit un exercice tel qu'on le trouve dans une salle donnee.
 *
 * La lecture est commune : personne ne doit re-saisir un parc deja renseigne.
 * L'ecriture revient au createur de la SALLE — le tenir a jour est un travail
 * de terrain, il a un responsable. L'autorisation se lit donc sur la salle, et
 * jamais sur la ligne : sinon le premier a corriger un reglage se
 * l'approprierait, et le responsable changerait a chaque modification.
 */
async function salleDeLEntree(id: string) {
  const entree = await db.query.exerciseInstances.findFirst({
    where: eq(exerciseInstances.id, id),
    with: { gym: true },
  });
  return entree ?? null;
}

/**
 * Un exercice tel qu'on le trouve dans une salle donnée.
 *
 * « Machine » était une vulgarisation : une salle contient aussi des barres,
 * des haltères et une barre de traction. Ce que décrit cette entrée, c'est un
 * mouvement rendu possible par un lieu — avec ses incréments, sa convention de
 * charge, ses réglages.
 *
 * Lecture commune : personne ne doit re-saisir un parc déjà renseigné, et le
 * constructeur de séance lisait de toute façon déjà tout le parc sans filtre.
 * Écriture réservée au créateur de la SALLE : la tenir à jour est un travail de
 * terrain, qui a un responsable.
 *
 * L'autorisation se lit sur la salle, jamais sur la ligne — sinon le premier à
 * corriger un réglage se l'approprierait, et le responsable changerait à chaque
 * modification.
 *
 * Ce qui appartient réellement à une personne — séances, séries, charges,
 * conversations — reste protégé ailleurs, par le filtre sur son identifiant.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const instance = await db.query.exerciseInstances.findFirst({
      where: eq(exerciseInstances.id, id),
      with: { exercise: true, gym: true },
    });
    if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(instance);
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    // Auparavant `.set({ ...body })` : n'importe quelle colonne etait modifiable
    // depuis le client, y compris userId, gymId et id.
    const parsed = majMachineSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const champs = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(champs).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    const entree = await salleDeLEntree(id);
    if (!entree) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!peutGererLaSalle(entree.gym, userId)) {
      return NextResponse.json({ error: REFUS_GESTION_SALLE }, { status: 403 });
    }

    /**
     * Ce qui a été soulevé ne se réinterprète pas après coup.
     *
     * Certaines propriétés ne décrivent pas l'appareil : elles disent ce que
     * SIGNIFIENT les nombres déjà enregistrés. Relire une pile affichée comme
     * un poids total, ou une résistance comme une assistance, ferait bondir ou
     * s'effondrer une courbe sans qu'un gramme ait bougé — et l'historique ne
     * porterait plus aucune trace du jour où le sens a changé.
     *
     * Tant qu'aucune série n'existe, tout se corrige librement. Dès qu'il y en
     * a une, la correction s'appelle « c'est un autre appareil » : on archive
     * celui-ci et on en déclare un nouveau. L'historique n'est ni dupliqué ni
     * réécrit, il reste attaché à ce qu'il mesurait.
     */
    const figees = proprietesFigeesModifiees(entree, parsed.data);
    if (figees.length > 0) {
      const [serie] = await db
        .select({ id: setLogs.id })
        .from(setLogs)
        .where(eq(setLogs.exerciseInstanceId, id))
        .limit(1);
      if (serie) {
        return NextResponse.json(
          { error: refusDeModification(figees), proprietes: figees },
          { status: 409 },
        );
      }
    }

    const [updated] = await db.update(exerciseInstances)
      .set({ ...champs, updatedAt: new Date() })
      .where(eq(exerciseInstances.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[exercise-instances PATCH] error:", error);
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const entree = await salleDeLEntree(id);
    if (!entree) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!peutGererLaSalle(entree.gym, userId)) {
      return NextResponse.json({ error: REFUS_GESTION_SALLE }, { status: 403 });
    }

    // Une entrée citée par un programme ne peut pas disparaître : la clé
    // étrangère refuse, et le refus remontait en 500 sans rien expliquer.
    // Une machine que plus aucune séance ne programme redevient supprimable :
    // seules les lignes actives font obstacle.
    const citations = await db.query.exerciseInTemplate.findMany({
      where: (eit, { and, eq, isNull }) =>
        and(eq(eit.exerciseInstanceId, id), isNull(eit.archiveLe)),
      limit: 1,
    });
    if (citations.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cet exercice est utilisé dans un programme. Retire-le d'abord de tes séances, ou archive-le.",
        },
        { status: 409 },
      );
    }

    await db.delete(exerciseInstances).where(eq(exerciseInstances.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
