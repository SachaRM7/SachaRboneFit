import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  contexteExecution, ecrireNote, enregistrerReglages,
  IncoherenceExerciceAppareil, InstanceIntrouvable, IntentionInvalide, ReglageRefuse,
  type Ordonnancement,
} from "@/services/execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ce qu'il faut savoir devant la machine, et ce qu'on y modifie.
 *
 * L'identifiant du compte vient TOUJOURS du cookie vérifié, jamais du corps de
 * la requête : les réglages personnels et la note sont, par construction, ceux
 * de la personne authentifiée. Aucun paramètre ne permet d'en désigner une
 * autre.
 */

const majSchema = z.object({
  /** Clé → valeur. Une chaîne vide efface le réglage. */
  reglages: z.record(z.string(), z.string()).optional(),
  note: z.string().max(280).optional(),
  /**
   * Toujours requis. Sans appareil, il porte la note ; avec, il sert à vérifier
   * que la machine visée fait bien cet exercice — le couple n'est jamais cru
   * sur parole.
   */
  exerciseId: z.string().uuid(),
  /**
   * L'instant où l'utilisateur a formé cette intention, horodaté chez lui.
   *
   * C'est LUI qui tranche entre deux requêtes en vol, et non l'ordre d'arrivée
   * — voir `lib/engine/intention`.
   *
   * Borné à `Number.MAX_SAFE_INTEGER` : la colonne est un `bigint` PostgreSQL,
   * qui accepte des valeurs qu'aucun `number` JavaScript ne relit fidèlement.
   * Une intention au-delà s'écrirait bien et se relirait faux — et,
   * définitivement en tête, condamnerait toutes les écritures suivantes.
   *
   * Facultatif dans le schéma, mais son absence n'est PAS « pas d'ordre » : la
   * route traduit alors la requête en écriture forcée, qui a sa propre
   * sémantique. Voir `Ordonnancement`.
   */
  intention: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ instanceId: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instanceId } = await params;
  const url = new URL(request.url);
  const exerciseId = url.searchParams.get("exerciseId");
  if (!exerciseId) {
    return NextResponse.json({ error: "exerciseId requis" }, { status: 400 });
  }

  try {
    const contexte = await contexteExecution({
      userId,
      exerciseId,
      // `sans-appareil` désigne explicitement le cas des pompes : un exercice
      // sans instance. Le mot est dans l'URL plutôt qu'un identifiant vide,
      // pour qu'un appel malformé ne passe pas pour ce cas-là.
      exerciseInstanceId: instanceId === "sans-appareil" ? null : instanceId,
      tempoSeance: url.searchParams.get("tempoSeance"),
      tempoProgramme: url.searchParams.get("tempoProgramme"),
    });
    return NextResponse.json(contexte);
  } catch (error) {
    if (error instanceof IncoherenceExerciceAppareil) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InstanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[execution GET] error:", error);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}

/**
 * Enregistre réglages et note, à la modification.
 *
 * Séparé de la clôture de séance, délibérément : changer le siège puis fermer
 * l'onglet ne doit rien perdre. Un réglage n'est pas une donnée de séance,
 * c'est un souvenir d'appareil.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ instanceId: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { instanceId } = await params;
  const parsed = majSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sansAppareil = instanceId === "sans-appareil";

  // L'absence d'intention n'est pas un ordre par défaut : c'est un autre
  // régime, nommé. Une écriture forcée s'applique toujours, au lieu d'être
  // mise en concurrence, avec l'heure du serveur, contre des intentions
  // horodatées chez l'utilisateur.
  const ordre: Ordonnancement = parsed.data.intention === undefined
    ? "forcee"
    : { intention: parsed.data.intention };

  try {
    let reglages = undefined;
    if (parsed.data.reglages && !sansAppareil) {
      reglages = await enregistrerReglages({
        userId, exerciseInstanceId: instanceId,
        exerciseId: parsed.data.exerciseId,
        valeurs: parsed.data.reglages,
        ordre,
      });
    }

    let note = undefined;
    if (parsed.data.note !== undefined) {
      note = await ecrireNote({
        userId,
        exerciseInstanceId: sansAppareil ? null : instanceId,
        exerciseId: parsed.data.exerciseId,
        texte: parsed.data.note,
        ordre,
      });
    }

    return NextResponse.json({ reglages, note });
  } catch (error) {
    // 422 : la requête est bien formée, c'est la VALEUR que la machine
    // n'accepte pas. Le client doit dire « entre 1 et 10 », pas « erreur ».
    if (error instanceof ReglageRefuse) {
      return NextResponse.json({ error: error.message, cle: error.cle }, { status: 422 });
    }
    if (error instanceof InstanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    // 400 : le schéma le refuse déjà, mais le service fait autorité et le
    // redit — la route n'est pas son seul appelant.
    if (error instanceof IntentionInvalide) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // 409 : les deux identifiants existent, mais ne vont pas ensemble. Ce
    // n'est ni une donnée invalide (400) ni un objet absent (404).
    if (error instanceof IncoherenceExerciceAppareil) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[execution PATCH] error:", error);
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}
