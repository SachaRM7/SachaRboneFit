"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit3, MoreHorizontal, Trash2 } from "@/components/ui/icons";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

/**
 * Les « … » de l'aperçu d'une séance.
 *
 * Ils menaient directement à l'édition, qui a déjà son bouton « Modifier » en
 * bas d'écran : deux portes vers la même pièce, et aucune pour supprimer. Ils
 * ouvrent maintenant une feuille d'actions. La suppression demande une seconde
 * confirmation dans la feuille même — pas de `confirm()` natif, qui sort de
 * l'application sur iOS.
 */
export function MenuSeance({ seanceId, nom }: { seanceId: string; nom: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const changerOuverture = (valeur: boolean) => {
    setOuvert(valeur);
    if (!valeur) setConfirmation(false);
  };

  const supprimer = async () => {
    setEnvoi(true);
    try {
      const res = await fetch(`/api/programme/seances/${seanceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Séance supprimée");
      setOuvert(false);
      router.replace("/sessions/new");
      router.refresh();
    } catch {
      toast.error("Suppression impossible");
      setEnvoi(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => changerOuverture(true)}
        aria-label={`Actions pour ${nom}`}
        aria-haspopup="dialog"
        className="grid size-11 shrink-0 place-items-center rounded-full border border-filet bg-carte text-encre-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>

      <Drawer open={ouvert} onOpenChange={changerOuverture}>
        <DrawerContent className="border-filet bg-papier text-encre">
          <DrawerHeader>
            <DrawerTitle className="text-encre">{nom}</DrawerTitle>
            <DrawerDescription className="text-encre-3">
              {confirmation
                ? "Les séances déjà réalisées resteront dans ton historique."
                : "Que veux-tu faire de cette séance ?"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            {confirmation ? (
              <>
                <button
                  type="button"
                  onClick={() => void supprimer()}
                  disabled={envoi}
                  className="flex h-12 items-center justify-center gap-2 rounded-full bg-destructive px-4 font-semibold text-white disabled:opacity-60"
                >
                  <Trash2 className="size-4" aria-hidden />
                  {envoi ? "Suppression…" : "Oui, supprimer la séance"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmation(false)}
                  disabled={envoi}
                  className="flex h-12 items-center justify-center rounded-full border border-filet bg-carte px-4 font-medium text-encre-2"
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                <Link
                  href={`/sessions/new/${seanceId}/edit`}
                  prefetch={false}
                  onClick={() => setOuvert(false)}
                  className="flex h-12 items-center gap-3 rounded-2xl border border-filet bg-carte px-4 font-medium"
                >
                  <Edit3 className="size-4 text-encre-2" aria-hidden /> Modifier la séance
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmation(true)}
                  className="flex h-12 items-center gap-3 rounded-2xl border border-filet bg-carte px-4 font-medium text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden /> Supprimer la séance
                </button>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
