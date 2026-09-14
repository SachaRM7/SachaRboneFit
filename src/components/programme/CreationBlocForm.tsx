"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOMINANTES, LIBELLES_DOMINANTE } from "@/lib/referentiels/cycle";

const TYPES_CYCLE = [
  ...DOMINANTES.map((d) => ({ valeur: d, libelle: LIBELLES_DOMINANTE[d] })),
  { valeur: "deload", libelle: "Décharge" },
] as const;

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
  const [typeCycle, setTypeCycle] = useState<string>("volume");
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
        body: JSON.stringify({ nom: nom.trim(), dateDebut, typeCycle, actif: actifParDefaut }),
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
          {actifParDefaut ? "Il deviendra le programme actif." : "Il sera enregistré sans changer ta rotation actuelle."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="nomBloc">Nom du programme</Label>
        <Input id="nomBloc" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Push / Pull / Legs" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="dateDebut">Début</Label>
          <Input id="dateDebut" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Type de cycle</Label>
          <Select value={typeCycle} onValueChange={(v) => setTypeCycle(v ?? "volume")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES_CYCLE.map((t) => (
                <SelectItem key={t.valeur} value={t.valeur}>{t.libelle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button className="w-full h-12" onClick={creer} disabled={envoi}>
        {envoi ? "Création…" : "Créer le programme"}
      </Button>
    </div>
  );
}
