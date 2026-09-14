"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPE_CYCLE_NON_DEFINI = "non_defini";

export function CreationBlocForm({
  actifParDefaut = true,
  onCreated,
}: {
  actifParDefaut?: boolean;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [envoi, setEnvoi] = useState(false);

  const creer = async () => {
    if (!nom.trim()) {
      toast.error("Donne un nom au programme");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/programme/blocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          dateDebut,
          typeCycle: TYPE_CYCLE_NON_DEFINI,
          actif: actifParDefaut,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Création impossible");
      toast.success(actifParDefaut ? "Programme créé et activé" : "Programme créé");
      setNom("");
      onCreated?.();
      router.push(`/programme?bloc=${payload.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="rounded-[1.5rem] border border-filet bg-carte p-4 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-encre-3">Nouveau programme</p>
        <p className="mt-1 text-sm text-encre-2">
          {actifParDefaut
            ? "Il deviendra le programme actif. Tu pourras préciser son orientation plus tard."
            : "Il sera enregistré sans changer ta rotation actuelle. Son orientation pourra être définie plus tard."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="nomBloc">Nom du programme</Label>
        <Input
          id="nomBloc"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Push / Pull / Legs"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dateDebut">Début</Label>
        <Input id="dateDebut" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        <p className="text-xs text-encre-3">Utilisé comme repère de calendrier, pas comme type de cycle.</p>
      </div>
      <Button className="w-full h-12" onClick={creer} disabled={envoi}>
        {envoi ? "Création…" : "Créer le programme"}
      </Button>
    </div>
  );
}
