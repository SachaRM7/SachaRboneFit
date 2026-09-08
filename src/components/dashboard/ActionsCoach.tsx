"use client";
import {
  ArrowUpRight,
  Sparkles,
  SlidersHorizontal,
  MessageCircle,
} from "lucide-react";
import { useCoach } from "@/components/coach/ContexteCoach";
export function ActionsCoach() {
  const { ouvrir } = useCoach();
  return (
    <section className="coach-hub">
      <div className="section-heading">
        <span className="eyebrow">À tes côtés</span>
        <span className="coach-hub-label">
          <Sparkles size={14} aria-hidden /> Ton coach
        </span>
      </div>
      <h2>On ajuste ensemble ?</h2>
      <p>
        Un doute sur ta séance, un changement de rythme. Partons de ce dont tu
        as besoin.
      </p>
      <div className="coach-actions">
        <button onClick={() => ouvrir("expliquer_seance")}>
          <MessageCircle size={17} aria-hidden />
          <span>Comprendre ma séance</span>
          <ArrowUpRight size={16} aria-hidden />
        </button>
        <button onClick={() => ouvrir("modifier_programme")}>
          <SlidersHorizontal size={17} aria-hidden />
          <span>Adapter mon programme</span>
          <ArrowUpRight size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}
