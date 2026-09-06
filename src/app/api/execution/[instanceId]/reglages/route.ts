import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  declarerReglage,
  DeclarationRefusee, GestionSalleRefusee,
  IncoherenceExerciceAppareil, InstanceIntrouvable,
} from "@/services/execution";
import {
  LIMITE_LIBELLE_REGLAGE, LIMITE_OPTION_REGLAGE, LIMITE_UNITE_REGLAGE,
  MAX_OPTIONS_REGLAGE, TYPES_REGLAGE_SCHEMA,
} from "@/lib/validators/reglage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Déclarer qu'un réglage existe sur un appareil.
 *
 * C'EST LE CHEMIN QUI MANQUAIT. `instance_reglages` n'était écrite par aucune
 * route, aucun écran, aucun seed : la table existait, la validation existait,
 * la fiche d'exécution savait l'afficher, et rien ne pouvait jamais y mettre
 * une ligne. Cette route est le premier — et pour l'instant le seul — chemin
 * applicatif de création.
 *
 * Elle est SÉPARÉE du `PATCH` voisin, et volontairement : le `PATCH` écrit ce
 * qui appartient à la personne authentifiée — sa valeur, sa note — et n'a
 * donc aucun contrôle d'autorisation à faire. Celle-ci modifie la description
 * COMMUNE d'un appareil que tous les comptes du lieu liront. Deux portées, deux
 * régimes de droits, deux routes : les mélanger reviendrait à faire dépendre
 * l'écriture d'une note personnelle d'un droit sur la salle, ou à laisser une
 * modification du catalogue commun passer par la porte des données privées.
 *
 * `sans-appareil` n'a pas de sens ici : on ne décrit pas le siège des pompes.
 */

/**
 * Bornes facultatives, chacune de son côté.
 *
 * Le schéma ne les exige pas et n'en fournit aucune : la borne d'un cran se
 * compte sur la machine, elle ne se déduit pas. Voir l'en-tête de
 * `lib/engine/declaration-reglage`.
 */
const declarationSchema = z.object({
  exerciseId: z.string().uuid(),
  libelle: z.string().min(1).max(LIMITE_LIBELLE_REGLAGE),
  type: TYPES_REGLAGE_SCHEMA,
  min: z.string().max(12).nullable().optional(),
  max: z.string().max(12).nullable().optional(),
  options: z.array(z.string().max(LIMITE_OPTION_REGLAGE)).max(MAX_OPTIONS_REGLAGE).nullable().optional(),
  unite: z.string().max(LIMITE_UNITE_REGLAGE).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ instanceId: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instanceId } = await params;
  if (instanceId === "sans-appareil") {
    return NextResponse.json(
      { error: "Cet exercice n'a pas d'appareil à décrire." },
      { status: 400 },
    );
  }

  const parsed = declarationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { exerciseId, ...declaration } = parsed.data;

  try {
    const reglages = await declarerReglage({
      userId, exerciseInstanceId: instanceId, exerciseId, declaration,
    });
    return NextResponse.json({ reglages }, { status: 201 });
  } catch (error) {
    // 403 : la requête est valide et la personne authentifiée — c'est la salle
    // qu'elle n'entretient pas. Le message est celui du reste du parc, mot pour
    // mot : deux formulations différentes se seraient contredites.
    if (error instanceof GestionSalleRefusee) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // 422 : bien formée, mais ce qu'elle décrit n'est pas descriptible tel quel
    // — un choix sans options, une borne minimale au-dessus de la maximale, un
    // réglage déjà décrit sur cet appareil.
    if (error instanceof DeclarationRefusee) {
      return NextResponse.json(
        { error: error.message, motif: error.refus.motif },
        { status: 422 },
      );
    }
    if (error instanceof InstanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IncoherenceExerciceAppareil) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[execution reglages POST] error:", error);
    return NextResponse.json({ error: "Déclaration impossible" }, { status: 500 });
  }
}
