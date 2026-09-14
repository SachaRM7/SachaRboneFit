"use client";
import { useRouter } from "next/navigation";
import { CoachConversation } from "@/components/coach/CoachConversation";
import { useCoachViewport } from "@/components/coach/useCoachViewport";
export default function CoachPage() {
  const router = useRouter();
  const viewport = useCoachViewport(true);
  return <section className="coach-page" style={viewport} aria-label="Ton coach"><CoachConversation contexte={null} onClose={() => router.push("/dashboard")} /></section>;
}
