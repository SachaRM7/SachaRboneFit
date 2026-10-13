"use client";

import { useSyncExternalStore } from "react";
import { Trash2 } from "@/components/ui/icons";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

/**
 * Une confirmation dans l'application, à la place de `window.confirm()`.
 *
 * Le `confirm()` natif sort de l'application : sur iPhone, c'est une boîte
 * système grise titrée par l'adresse du site, sans rapport avec le reste de
 * l'interface. On garde sa simplicité d'appel — une promesse qui rend un
 * booléen — mais la question monte dans une feuille de l'app, qu'on peut
 * aussi refermer en glissant (ce qui vaut « non »).
 *
 * Une seule question à la fois : `<ConfirmationGlobale />`, monté une fois à la
 * racine, l'affiche.
 */

export interface DemandeConfirmation {
  titre: string;
  message?: string;
  /** Libellé du bouton qui accepte. */
  action: string;
  /** Une action qui retire quelque chose : bouton rouge et icône corbeille. */
  destructif?: boolean;
}

type Etat = (DemandeConfirmation & { repondre: (ok: boolean) => void }) | null;

let etat: Etat = null;
const abonnes = new Set<() => void>();
const publier = (suivant: Etat) => {
  etat = suivant;
  abonnes.forEach((f) => f());
};

export function demanderConfirmation(demande: DemandeConfirmation): Promise<boolean> {
  // Une question restée ouverte vaut « non » : on ne l'empile pas.
  etat?.repondre(false);
  return new Promise((resoudre) => {
    publier({
      ...demande,
      repondre: (ok) => {
        publier(null);
        resoudre(ok);
      },
    });
  });
}

export function ConfirmationGlobale() {
  const courant = useSyncExternalStore(
    (f) => { abonnes.add(f); return () => abonnes.delete(f); },
    () => etat,
    () => null,
  );

  return (
    <Drawer open={courant !== null} onOpenChange={(ouvert) => { if (!ouvert) courant?.repondre(false); }}>
      <DrawerContent className="border-filet bg-papier text-encre">
        <DrawerHeader>
          <DrawerTitle className="text-encre">{courant?.titre}</DrawerTitle>
          {courant?.message && (
            <DrawerDescription className="text-encre-3">{courant.message}</DrawerDescription>
          )}
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <button
            type="button"
            onClick={() => courant?.repondre(true)}
            className={`flex h-12 items-center justify-center gap-2 rounded-full px-4 font-semibold ${courant?.destructif ? "bg-destructive text-white" : "bg-encre text-papier"}`}
          >
            {courant?.destructif && <Trash2 className="size-4" aria-hidden />}
            {courant?.action}
          </button>
          <button
            type="button"
            onClick={() => courant?.repondre(false)}
            className="flex h-12 items-center justify-center rounded-full border border-filet bg-carte px-4 font-medium text-encre-2"
          >
            Annuler
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
