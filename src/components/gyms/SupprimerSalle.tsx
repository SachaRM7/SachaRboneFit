"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Supprimer un lieu.
 *
 * Le geste passait par `<form action="/api/gyms/…" method="DELETE">`. HTML ne
 * connaît que GET et POST : le navigateur retombait sur GET, la route ne
 * voyait jamais de DELETE, et le bouton ne faisait rien — sans le moindre
 * message. C'est le même défaut que le « Abandonner » du tableau de bord :
 * un bouton qui reçoit le tap et ne produit rien.
 */
export function SupprimerSalle({ gymId, nom }: { gymId: string; nom: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const supprimer = async () => {
    setEnvoi(true);
    try {
      const res = await fetch(`/api/gyms/${gymId}`, { method: "DELETE" });
      if (!res.ok) {
        const corps = await res.json().catch(() => null);
        throw new Error(corps?.error ?? "Suppression impossible");
      }
      toast.success("Salle supprimée");
      setOuvert(false);
      router.push("/gyms");
      router.refresh();
    } catch (e) {
      // Un échec se dit. Une salle citée par un historique ne se supprime pas,
      // et l'utilisateur a le droit de savoir pourquoi.
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full border-perte/40 text-perte hover:bg-perte/10"
        onClick={() => setOuvert(true)}
      >
        Supprimer cette salle
      </Button>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer « {nom} » ?</DialogTitle>
            <DialogDescription>
              Le matériel décrit ici sera retiré de tes prochaines séances. Les
              séances déjà faites gardent leur trace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOuvert(false)} disabled={envoi}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={supprimer} disabled={envoi}>
              {envoi ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
