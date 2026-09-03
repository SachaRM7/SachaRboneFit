"use client";

import { useSearchParams } from "next/navigation";
import { SessionDebrief } from "@/components/coach/SessionDebrief";

export function SessionDebriefLoader() {
  const searchParams = useSearchParams();
  // La lettre et la date ne sont plus transmises : le débrief est lu en base
  // à partir de la seule séance, et le serveur relit lui-même ce qu'il décrit
  // plutôt que de faire confiance à des paramètres d'URL.
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) return null;

  return <SessionDebrief sessionLogId={sessionId} />;
}
