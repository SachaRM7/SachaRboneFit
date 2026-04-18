import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { coachConversations, coachMessages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await db.query.coachConversations.findMany({
    where: eq(coachConversations.userId, userId),
    orderBy: [desc(coachConversations.updatedAt)],
    limit: 20,
  });

  // Get last message preview for each conversation
  const conversationsWithPreviews = await Promise.all(
    conversations.map(async (conv) => {
      const lastMsg = await db.query.coachMessages.findFirst({
        where: eq(coachMessages.conversationId, conv.id),
        orderBy: [desc(coachMessages.createdAt)],
      });

      return {
        id: conv.id,
        title: conv.title,
        sessionLogId: conv.sessionLogId,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessage: lastMsg ? {
          role: lastMsg.role,
          preview: lastMsg.content.slice(0, 100),
        } : null,
      };
    })
  );

  return NextResponse.json(conversationsWithPreviews);
}
