import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import {
  enregistrerSerie, retirerSerie, seriesDeLaSeance,
  SeanceIntrouvable, SeanceClose, SerieInvalide,
} from "@/services/seances";

/**
 * Une série, persistée au moment où elle est validée.
 *
 * LE DÉFAUT QUE CETTE ROUTE FERME
 *
 * Rien de la séance n'atteignait Postgres avant l'écran de fin : une heure
 * d'entraînement tenait entièrement dans le `localStorage` du navigateur. Un
 * crash de Safari, un onglet fermé par le système sous pression mémoire, et la
 * séance n'avait jamais eu lieu.
 *
 * Elle ne remplace pas la clôture. `PATCH /api/session-logs/[id]` reste le
 * moment où la séance devient un fait — durée, énergie de fin, débrief — et
 * réécrit la liste complète des séries. Cette route-ci met la base à jour au
 * fil de l'eau pour qu'un accident ne coûte plus rien.
 *
 * IDEMPOTENTE. Le triplet (séance, entrée, numéro) identifie la série : rejouer
 * l'appel après un échec réseau ne crée pas de doublon, et revalider une série
 * corrigée met à jour la bonne ligne. Aucune migration.
 */

export const runtime = "nodejs";

/**
 * La RÉVISION accompagne chaque écriture, et c'est elle qui ordonne.
 *
 * Elle est décidée par le client au moment de l'INTENTION — pas à l'envoi — et
 * transportée telle quelle par les reprises. Une reprise ancienne porte donc
 * une révision ancienne, et le serveur la refuse au profit de la correction
 * faite entre-temps. Sans elle, l'ordre d'ARRIVÉE des requêtes décidait, ce
 * qui n'a aucun rapport avec l'ordre des gestes de l'athlète.
 *
 * OBLIGATOIRE. Elle l'était « facultative pour ne casser aucun appelant » —
 * argument creux : cette route n'existait pas avant ce lot, elle n'a pas
 * d'appelant historique. Le repli `?? Date.now()` offrait surtout une porte de
 * sortie : un appel qui ne respecte pas le protocole obtenait une révision
 * fraîche côté serveur et repassait devant toutes les intentions en vol.
 *
 * `MAX_SAFE_INTEGER` parce que Drizzle lit ce `bigint` en `mode: "number"` :
 * au-delà, la valeur relue ne serait plus celle qui a été écrite.
 */
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const serieSchema = z.object({
  revision: revisionSchema,
  exerciseInstanceId: z.string().uuid(),
  numeroSerie: z.number().int().positive(),
  repsEffectuees: z.number().int().nonnegative(),
  charge: z.number().nonnegative(),
  rpeEffectif: z.number().min(1).max(10).nullable().optional(),
  tempoRespecte: z.boolean().nullable().optional(),
  reposReelSecondes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const retraitSchema = z.object({
  revision: revisionSchema,
  exerciseInstanceId: z.string().uuid(),
  numeroSerie: z.number().int().positive(),
});

/** Ce que la base porte déjà — la source de vérité de la reprise. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    return NextResponse.json(await seriesDeLaSeance(userId, id));
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[series GET] échec :", error instanceof Error ? error.name : typeof error);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = serieSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { revision, ...serie } = parsed.data;
    const issue = await enregistrerSerie({ userId, sessionLogId: id, serie, revision });
    /*
     * `perimee` rend 200, pas une erreur.
     *
     * Une reprise réseau qui arrive après une intention plus récente a fait
     * exactement ce qu'on attend d'elle : rien. La refuser avec un code
     * d'erreur ferait réessayer le client, qui insisterait pour écraser une
     * correction — le défaut qu'on vient de fermer.
     */
    return NextResponse.json({ ok: true, issue }, { status: 200 });
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    /*
     * 409 : la séance est terminée, et la clôture a réécrit la liste complète
     * des séries. Une reprise partie avant la clôture ne doit pas la modifier
     * après — c'est l'invariant « la clôture reste l'autorité ».
     *
     * 409 et non 404 : la séance existe, elle est simplement fermée. Et le
     * client ne réessaie pas — `meriteUneReprise` ne rejoue que le transport
     * et les pannes serveur.
     */
    if (error instanceof SeanceClose) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    /*
     * 422 : la requête est bien formée, c'est la SÉRIE qui ne mesure rien. Le
     * même refus qu'à la clôture, au même moment du moteur — une série acceptée
     * en route ne doit pas être rejetée à la fin.
     */
    if (error instanceof SerieInvalide) {
      return NextResponse.json(
        { error: error.message, numeroSerie: error.numeroSerie, motif: error.motif },
        { status: 422 },
      );
    }
    console.error("[series POST] échec :", error instanceof Error ? error.name : typeof error);
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }
}

/** Décocher une série pendant la séance la retire aussi de la base. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = retraitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  try {
    const { revision, ...cle } = parsed.data;
    const issue = await retirerSerie({ userId, sessionLogId: id, ...cle, revision });
    return NextResponse.json({ ok: true, issue });
  } catch (error) {
    if (error instanceof SeanceIntrouvable) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    // Même règle qu'à l'écriture : une séance close ne se modifie plus.
    if (error instanceof SeanceClose) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[series DELETE] échec :", error instanceof Error ? error.name : typeof error);
    return NextResponse.json({ error: "Retrait impossible" }, { status: 500 });
  }
}
