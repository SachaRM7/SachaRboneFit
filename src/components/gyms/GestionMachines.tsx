"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { MachineForm, type ExerciceSelectionnable, type MachineExistante } from "./MachineForm";
import { LIBELLES_CONVENTION, LIBELLES_POULIE } from "@/lib/validators/exercise-instance";
import { Plus, Pencil, Trash2 } from "lucide-react";

export interface MachineAffichee extends MachineExistante {
  exerciseId: string;
  exerciceNom: string;
  exercicePilier: string;
  exerciceSlug: string | null;
  exerciceNbFrames: number;
}

interface Props {
  gymId: string;
  machines: MachineAffichee[];
  exercices: ExerciceSelectionnable[];
}

export function GestionMachines({ gymId, machines, exercices }: Props) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<MachineAffichee | null>(null);
  const [suppression, setSuppression] = useState<string | null>(null);

  const ouvrirAjout = () => {
    setEnEdition(null);
    setOuvert(true);
  };

  const ouvrirEdition = (m: MachineAffichee) => {
    setEnEdition(m);
    setOuvert(true);
  };

  const supprimer = async (m: MachineAffichee) => {
    if (!confirm(`Retirer « ${m.machineNom} » de cette salle ?`)) return;
    setSuppression(m.id);
    try {
      const res = await fetch(`/api/exercise-instances/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Machine retirée");
      router.refresh();
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setSuppression(null);
    }
  };

  const parPilier = new Map<string, MachineAffichee[]>();
  for (const m of machines) {
    parPilier.set(m.exercicePilier, [...(parPilier.get(m.exercicePilier) ?? []), m]);
  }

  return (
    <div className="space-y-5">
      <Button className="w-full h-12" onClick={ouvrirAjout}>
        <Plus className="w-4 h-4 mr-2" />
        Ajouter une machine
      </Button>

      {machines.length === 0 && (
        <div className="bg-carte border border-filet rounded-lg p-4">
          <p className="text-encre-2 text-sm">
            Aucune machine référencée. Tant que le matériel n&apos;est pas décrit, une séance
            dans cette salle ne peut proposer aucun exercice.
          </p>
        </div>
      )}

      {[...parPilier.entries()].map(([pilier, liste]) => (
        <section key={pilier} className="space-y-2">
          <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">{pilier}</h2>
          <div className="space-y-2">
            {liste.map((m) => (
              <div key={m.id} className="bg-carte border border-filet rounded-lg p-3">
                <div className="flex items-start gap-3">
                  {m.exerciceSlug && (
                    <IllustrationExercice
                      slug={m.exerciceSlug}
                      nom={m.exerciceNom}
                      nbFrames={m.exerciceNbFrames}
                      className="w-10 h-10 shrink-0 text-encre-2"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-encre font-medium text-sm">{m.machineNom}</p>
                    <p className="text-encre-3 text-xs">{m.exerciceNom}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                        {LIBELLES_CONVENTION[m.conventionCharge as keyof typeof LIBELLES_CONVENTION] ?? m.conventionCharge}
                      </Badge>
                      {m.typePoulie && m.typePoulie !== "na" && (
                        <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                          {LIBELLES_POULIE[m.typePoulie as keyof typeof LIBELLES_POULIE] ?? m.typePoulie}
                        </Badge>
                      )}
                      {m.chargeMax !== null && (
                        <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                          max {m.chargeMax} kg
                        </Badge>
                      )}
                    </div>
                    <p className="text-encre-3 text-xs mt-1.5">
                      Incréments : {m.incrementsPossibles?.join(", ")} kg
                      {m.poidsNonCompte ? ` · ${m.poidsNonCompte} kg non comptés` : ""}
                    </p>
                    {m.notesMachine && (
                      <p className="text-encre-3 text-xs mt-1 italic">{m.notesMachine}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="ghost" size="icon" aria-label={`Modifier ${m.machineNom}`}
                      onClick={() => ouvrirEdition(m)}>
                      <Pencil className="w-4 h-4 text-encre-2" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Supprimer ${m.machineNom}`}
                      disabled={suppression === m.id} onClick={() => supprimer(m)}>
                      <Trash2 className="w-4 h-4 text-encre-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <Drawer open={ouvert} onOpenChange={setOuvert}>
        <DrawerContent className="bg-papier border-filet text-encre max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="text-encre">
              {enEdition ? enEdition.machineNom : "Ajouter une machine"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            <MachineForm
              key={enEdition?.id ?? "nouvelle"}
              gymId={gymId}
              exercices={exercices}
              machine={enEdition ?? undefined}
              onTermine={() => setOuvert(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
