import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { coachConversations, coachMessages } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { loadCoachContext } from "@/lib/coach/context-loader";
import { buildSystemPrompt } from "@/lib/coach/system-prompt";
import { appelerLLM, CoachIndisponible, type AppelOutil, type MessageLLM } from "@/lib/coach/llm-client";
import { createCoachTools } from "@/lib/coach/tools";
import { contexteValide, extraireActionRapide } from "@/lib/coach/contexte-ecran";
import { resoudreContexte } from "@/services/contexte-coach";
import { repondreActionRapide } from "@/services/reponses-coach-rapides";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const schema = z.object({
  retry: z.boolean().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(4000),
  sessionLogId: z.string().uuid().nullable().optional(),
  contexte: z.unknown().nullable().optional(),
});

const TOURS_MAX = 4;
const MESSAGES_HISTORIQUE_MAX = 12;
const CARACTERES_HISTORIQUE_MAX = 12_000;
const CARACTERES_RESULTAT_OUTIL_MAX = 6_000;
const CARACTERES_RESULTATS_OUTILS_TOTAL_MAX = 12_000;
const CARACTERES_REPONSE_MAX = 5_000;

function bornerHistorique(historique: Array<{ role: string; content: string }>): MessageLLM[] {
  const candidats = historique
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim().length > 0)
    .slice(-MESSAGES_HISTORIQUE_MAX);

  const retenus: MessageLLM[] = [];
  let caracteres = 0;
  for (let i = candidats.length - 1; i >= 0; i -= 1) {
    const m = candidats[i]!;
    const restant = CARACTERES_HISTORIQUE_MAX - caracteres;
    if (restant <= 0) break;
    const content = m.content.length > restant ? m.content.slice(-restant) : m.content;
    retenus.push({ role: m.role as "user" | "assistant", content });
    caracteres += content.length;
  }
  return retenus.reverse();
}

function bornerResultatOutil(resultat: string, dejaConserve: number): string {
  const restantGlobal = Math.max(0, CARACTERES_RESULTATS_OUTILS_TOTAL_MAX - dejaConserve);
  const limite = Math.min(CARACTERES_RESULTAT_OUTIL_MAX, restantGlobal);
  if (limite <= 0) return "Résultat omis : budget de contexte atteint.";
  if (resultat.length <= limite) return resultat;
  return `${resultat.slice(0, Math.max(0, limite - 31))}\n[… résultat tronqué côté serveur …]`;
}

function bornerReponse(texte: string): string {
  const propre = texte.trim();
  if (propre.length <= CARACTERES_REPONSE_MAX) return propre;
  return `${propre.slice(0, CARACTERES_REPONSE_MAX)}\n\n[… réponse abrégée …]`;
}

export async function POST(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(75_000)]);
  let convId: string | null = null;
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Message invalide" }, { status: 400 });
    }

    const { conversationId, message, sessionLogId } = parsed.data;
    const contexteEcran = contexteValide(parsed.data.contexte);
    const actionRapide = extraireActionRapide(message);
    const messageVisible = actionRapide?.message ?? message;

    convId = conversationId ?? null;

    if (convId) {
      const conv = await db.query.coachConversations.findFirst({
        where: and(eq(coachConversations.id, convId), eq(coachConversations.userId, userId)),
      });
      if (!conv) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
    } else {
      const [nouvelle] = await db
        .insert(coachConversations)
        .values({ userId, sessionLogId: sessionLogId ?? null, title: messageVisible.slice(0, 60) })
        .returning();
      if (!nouvelle) return NextResponse.json({ error: "Création impossible" }, { status: 500 });
      convId = nouvelle.id;
    }

    const dernier = parsed.data.retry ? await db.query.coachMessages.findFirst({
      where: eq(coachMessages.conversationId, convId), orderBy: [desc(coachMessages.createdAt)],
    }) : null;
    if (!(dernier?.role === "user" && dernier.content === messageVisible)) {
      await db.insert(coachMessages).values({
        conversationId: convId,
        role: "user",
        content: messageVisible,
      });
    }

    /**
     * Bouton prédéfini : le Coach reste l'interface, mais aucun fournisseur IA
     * n'est appelé. Les réponses viennent des mêmes services/règles que le reste
     * de l'application et sont persistées comme un message normal du Coach.
     */
    if (actionRapide) {
      const texte = bornerReponse(await repondreActionRapide({
        actionId: actionRapide.id,
        userId,
        contexte: contexteEcran,
      }));

      const [enregistre] = await db
        .insert(coachMessages)
        .values({
          conversationId: convId,
          role: "assistant",
          content: texte,
          toolCalls: null,
          toolResults: null,
        })
        .returning();

      await db
        .update(coachConversations)
        .set({ updatedAt: new Date() })
        .where(eq(coachConversations.id, convId));

      return NextResponse.json({
        conversationId: convId,
        message: { id: enregistre?.id, role: "assistant", content: texte },
        outilsUtilises: [],
        deterministe: true,
      });
    }

    // À partir d'ici seulement : vraie question libre -> LLM.
    const [contexte, contexteDeLEcran, historique] = await Promise.all([
      loadCoachContext(userId),
      resoudreContexte(userId, contexteEcran),
      db.query.coachMessages.findMany({
        where: eq(coachMessages.conversationId, convId),
        orderBy: [asc(coachMessages.createdAt)],
      }),
    ]);

    const messages = bornerHistorique(historique);
    const outils = createCoachTools();
    const profilAppel = contexteEcran?.sujet === "construire_seance" ? "lourd" : "courant";

    const promptComplet = contexteDeLEcran.texte
      ? `${buildSystemPrompt(contexte)}\n\n## Écran en cours\n${contexteDeLEcran.texte}`
      : buildSystemPrompt(contexte);

    const resultatsOutils: Array<{ appel: AppelOutil; resultat: string }> = [];
    let caracteresOutils = 0;
    let reponse = await appelerLLM({
      messages,
      sessionId: convId ?? undefined,
      signal,
      system: promptComplet,
      outils: outils.definitions,
    }, profilAppel);

    let tour = 0;
    while (reponse.appelsOutils.length > 0 && tour < TOURS_MAX) {
      for (const appel of reponse.appelsOutils) {
        const executeur = outils.executors[appel.nom];
        const brut = executeur
          ? await executeur(
              appel.arguments,
              userId,
              {
                ...(contexteDeLEcran.refs ?? {
                  ecran: contexteEcran?.ecran ?? "plus",
                  blocId: null,
                  seanceTemplateId: null,
                  exerciseInstanceId: null,
                  sessionLogId: null,
                }),
                conversationId: convId,
              },
            ).then(
              (r) => r.output,
              (e: unknown) => `Erreur : ${e instanceof Error ? e.message : String(e)}`,
            )
          : `Outil inconnu : ${appel.nom}`;
        const resultat = bornerResultatOutil(brut, caracteresOutils);
        caracteresOutils += resultat.length;
        resultatsOutils.push({ appel, resultat });
      }

      reponse = await appelerLLM({
        messages,
        sessionId: convId ?? undefined,
        signal,
        system: promptComplet,
        outils: outils.definitions,
        resultatsOutils,
      }, profilAppel);
      tour += 1;
    }

    if (!reponse.texte.trim() && resultatsOutils.length > 0) {
      reponse = await appelerLLM({
        messages,
        sessionId: convId ?? undefined,
        signal,
        system: `${promptComplet}\n\nLes consultations sont terminées. Réponds maintenant à la demande avec les résultats disponibles, sans demander de nouvel outil.`,
        resultatsOutils,
      }, profilAppel);
    }

    const texte = bornerReponse(reponse.texte) || "Je n'ai pas réussi à formuler de réponse.";

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
      deterministe: false,
    });
  } catch (error) {
    if (error instanceof CoachIndisponible) {
      if (error.statut === 413) {
        return NextResponse.json({ conversationId: convId, code: "COACH_CAPACITE", error: "Le coach ne peut pas traiter cette demande avec sa limite actuelle. Ta question est conservée." }, { status: 413 });
      }
      if (error.statut === 429) {
        return NextResponse.json({ conversationId: convId, code: "COACH_QUOTA", error: "Le coach a atteint sa limite temporaire. Réessaie dans un instant." },
          { status: 429, headers: error.retryAfterSeconds !== undefined ? { "Retry-After": String(error.retryAfterSeconds) } : {} });
      }
      return NextResponse.json(
        { conversationId: convId, error: "Le coach n'est pas disponible : clé API non configurée ou fournisseur en erreur." },
        { status: 503 },
      );
    }
    console.error("[coach/chat]", error);
    return NextResponse.json({ conversationId: convId, error: "Le coach n'est pas disponible pour le moment." }, { status: 503 });
  }
}
