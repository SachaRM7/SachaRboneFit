"use client";

import { useSearchParams } from "next/navigation";
import { SessionDebrief } from "@/components/coach/SessionDebrief";

export function SessionDebriefLoader() {
  const searchParams = useSearchParams();
  const templateLettre = searchParams.get("templateLettre");
  const sessionDate = searchParams.get("sessionDate");
  const sessionId = searchParams.get("sessionId");

  if (!sessionId || !templateLettre || !sessionDate) return null;

  return (
    <SessionDebrief
      sessionLogId={sessionId}
      templateLettre={templateLettre}
      date={sessionDate}
    />
  );
}
