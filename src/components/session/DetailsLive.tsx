"use client";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Aide de présentation : aucune donnée ni décision n'est créée à l'ouverture. */
export function DetailsLive({ titre, action, children }: {
  titre: string; action: string; children: ReactNode;
}) {
  return <Dialog>
    <DialogTrigger className="live-detail-trigger">{action}</DialogTrigger>
    <DialogContent className="live-detail-sheet" showCloseButton={false} aria-describedby={undefined}>
      <DialogHeader>
        <DialogTitle>{titre}</DialogTitle>
        <DialogClose className="live-detail-close" aria-label="Fermer l’aide"><X aria-hidden size={22} /></DialogClose>
      </DialogHeader>
      <div className="live-detail-body">{children}</div>
    </DialogContent>
  </Dialog>;
}
