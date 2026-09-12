"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Les détails serveur restent des enfants ; ouvrir ne déclenche aucun nouveau calcul. */
export function DetailsAccueil({ titre, apercu, children, className }: {
  titre: string;
  apercu: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger className={className}>{apercu}</DialogTrigger>
      <DialogContent className="home-sheet" showCloseButton={false} aria-describedby={undefined}>
        <DialogHeader className="home-sheet-heading">
          <DialogTitle>{titre}</DialogTitle>
          <DialogClose className="home-sheet-close" aria-label="Fermer les détails">
            <X size={22} aria-hidden />
          </DialogClose>
        </DialogHeader>
        <div className="home-sheet-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
