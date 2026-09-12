"use client";
import {
  ArrowUpRight,
  Sparkles,
  SlidersHorizontal,
  MessageCircle,
} from "lucide-react";
import { useCoach } from "@/components/coach/ContexteCoach";
import { DialogClose } from "@/components/ui/dialog";

export function ActionsCoach() {
  const { ouvrir } = useCoach();
  return (
    <section className="coach-hub">
      <div className="section-heading">
        <span className="coach-hub-label">
          <Sparkles size={14} aria-hidden /> Ton coach
        </span>
      </div>
      <div className="coach-actions">
        <DialogClose render={<button />} onClick={() => ouvrir("expliquer_seance")}>
          <MessageCircle size={17} aria-hidden />
          <span>Comprendre ma séance</span>
          <ArrowUpRight size={16} aria-hidden />
        </DialogClose>
        <DialogClose render={<button />} onClick={() => ouvrir("modifier_programme")}>
          <SlidersHorizontal size={17} aria-hidden />
          <span>Adapter mon programme</span>
          <ArrowUpRight size={16} aria-hidden />
        </DialogClose>
      </div>
    </section>
  );
}
