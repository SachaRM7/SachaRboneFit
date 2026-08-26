import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { coachConversations, coachMessages } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { loadCoachContext } from "@/lib/coach/context-loader";
import { buildSystemPrompt } from "@/lib/coach/system-prompt";
import { appelerLLM, CoachIndisponible, type AppelOutil, type MessageLLM } from "@/lib/coach/llm-client";
import { createCoachTools } from "@/lib/coach/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(4000),
  sessionLogId: z.string().uuid().nullable().optional(),
});

/** Au-delà, on arrête la boucle : le modèle tourne en rond. */
const TOURS_MAX = 4;

/**
 * Conversation avec le coach.
 *
 * La route ré-emballait le flux SSE du fournisseur sans jamais le décoder, et
 * n'a jamais transmis les outils au modèle — `createCoachTools()` n'était appelé
 * nulle part. Le coach affichait donc du protocole brut et n'avait aucun accès
 * aux données.
 *
 * Elle exécute désormais la boucle d'outils côté serveur et renvoie une réponse
 * complète. Les appels et leurs résultats sont archivés sur le message, dans les
 * colonnes prévues pour ça et jusqu'ici toujours vides.
 */
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Message invalide" }, { status: 400 });
  }
  const { conversationId, message, sessionLogId } = parsed.data;

  // --- Conversation ---
  let convId = conversationId ?? null;

  if (convId) {
    const conv = await db.query.coachConversations.findFirst({
      where: and(eq(coachConversations.id, convId), eq(coachConversations.userId, userId)),
    });
    if (!conv) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  } else {
    const [nouvelle] = await db
      .insert(coachConversations)
      .values({ userId, sessionLogId: sessionLogId ?? null, title: message.slice(0, 60) })
      .returning();
    if (!nouvelle) return NextResponse.json({ error: "Création impossible" }, { status: 500 });
    convId = nouvelle.id;
  }

  await db.insert(coachMessages).values({ conversationId: convId, role: "user", content: message });

  // --- Contexte et historique ---
  const [contexte, historique] = await Promise.all([
    loadCoachContext(userId),
    db.query.coachMessages.findMany({
      where: eq(coachMessages.conversationId, convId),
      orderBy: [asc(coachMessages.createdAt)],
    }),
  ]);

  const messages: MessageLLM[] = historique
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const outils = createCoachTools();

  try {
    const resultatsOutils: Array<{ appel: AppelOutil; resultat: string }> = [];
    let reponse = await appelerLLM({
      messages,
      system: buildSystemPrompt(contexte),
      outils: outils.definitions,
    });

    // Boucle d'outils : le modèle demande des données, on les lui fournit, il conclut.
    let tour = 0;
    while (reponse.appelsOutils.length > 0 && tour < TOURS_MAX) {
      for (const appel of reponse.appelsOutils) {
        const executeur = outils.executors[appel.nom];
        const resultat = executeur
          ? await executeur(appel.arguments, userId).then(
              (r) => r.output,
              (e: unknown) => `Erreur : ${e instanceof Error ? e.message : String(e)}`,
            )
          : `Outil inconnu : ${appel.nom}`;
        resultatsOutils.push({ appel, resultat });
      }

      reponse = await appelerLLM({
        messages,
        system: buildSystemPrompt(contexte),
        outils: outils.definitions,
        resultatsOutils,
      });
      tour += 1;
    }

    const texte = reponse.texte.trim() || "Je n'ai pas réussi à formuler de réponse.";

    const [enregistre] = await db
      .insert(coachMessages)
      .values({
        conversationId: convId,
        role: "assistant",
        content: texte,
        toolCalls: resultatsOutils.length ? resultatsOutils.map((r) => r.appel) : null,
        toolResults: resultatsOutils.length ? resultatsOutils.map((r) => r.resultat) : null,
      })
      .returning();

    await db
      .update(coachConversations)
      .set({ updatedAt: new Date() })
      .where(eq(coachConversations.id, convId));

    return NextResponse.json({
      conversationId: convId,
      message: { id: enregistre?.id, role: "assistant", content: texte },
      outilsUtilises: resultatsOutils.map((r) => r.appel.nom),
    });
  } catch (error) {
    if (error instanceof CoachIndisponible) {
      return NextResponse.json(
        { error: "Le coach n'est pas disponible : clé API non configurée ou fournisseur en erreur." },
        { status: 503 },
      );
    }
    console.error("[coach/chat]", error);
    return NextResponse.json({ error: "Le coach n'est pas disponible pour le moment." }, { status: 503 });
  }
}
