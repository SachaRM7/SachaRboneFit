import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { coachConversations, coachMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify conversation belongs to user
  const conv = await db.query.coachConversations.findFirst({
    where: eq(coachConversations.id, id),
  });

  if (!conv || conv.userId !== userId) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = await db.query.coachMessages.findMany({
    where: eq(coachMessages.conversationId, id),
    orderBy: [coachMessages.createdAt],
  });

  return NextResponse.json(messages);
}
