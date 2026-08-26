import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { coachConversations, coachMessages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { loadCoachContext } from "@/lib/coach/context-loader";
import { buildSystemPrompt } from "@/lib/coach/system-prompt";
import { callLLM } from "@/lib/coach/llm-client";
import type { LLMMessage } from "@/lib/coach/llm-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { conversationId, message, sessionLogId } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Load or create conversation
  let convId = conversationId;

  if (convId) {
    const conv = await db.query.coachConversations.findFirst({
      where: eq(coachConversations.id, convId),
    });
    if (!conv || conv.userId !== userId) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  } else {
    // Create new conversation
    const [newConv] = await db.insert(coachConversations).values({
      userId,
      sessionLogId: sessionLogId || null,
      title: null,
    }).returning();
    if (!newConv) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    convId = newConv.id;
  }

  // Save user message
  await db.insert(coachMessages).values({
    conversationId: convId,
    role: "user",
    content: message,
  }).returning();

  // Load context and system prompt
  const context = await loadCoachContext(userId);
  const systemPrompt = buildSystemPrompt(context);

  // Load existing messages for context
  const existingMessages = await db.query.coachMessages.findMany({
    where: eq(coachMessages.conversationId, convId),
    orderBy: [coachMessages.createdAt],
  });

  const allMessages: LLMMessage[] = existingMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  allMessages.push({ role: "user", content: message });

  // Call LLM
  let fullResponse = "";

  try {
    const stream = await callLLM({
      messages: allMessages,
      system: systemPrompt,
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const streamContent = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
            controller.enqueue(`event: text\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
          }
        } catch (e) {
          controller.error(e);
        } finally {
          // Save assistant message
          if (fullResponse && convId) {
            try {
              await db.insert(coachMessages).values({
                conversationId: convId,
                role: "assistant",
                content: fullResponse,
              });

              // Update conversation title if not set (from first user message)
              const conv = await db.query.coachConversations.findFirst({
                where: eq(coachConversations.id, convId),
              });
              if (conv && !conv.title) {
                const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
                await db.update(coachConversations)
                  .set({ title, updatedAt: new Date() })
                  .where(eq(coachConversations.id, convId));
              }
            } catch (saveErr) {
              console.error("Failed to save assistant message:", saveErr);
            }
          }

          controller.enqueue(`event: done\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`);
          controller.close();
        }
      },
    });

    return new Response(streamContent, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

  } catch (llmError: unknown) {
    const llmMessage = llmError instanceof Error ? llmError.message : String(llmError);
    if (llmMessage.includes("API key") || llmMessage.includes("not set")) {
      return NextResponse.json(
        { error: "Le coach n'est pas disponible: clé API non configurée." },
        { status: 503 }
      );
    }
    console.error("Coach LLM error:", llmError);
    return NextResponse.json(
      { error: "Le coach n'est pas disponible pour le moment." },
      { status: 503 }
    );
  }
}
