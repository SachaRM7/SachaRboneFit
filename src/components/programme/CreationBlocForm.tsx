"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOMINANTES, LIBELLES_DOMINANTE } from "@/lib/referentiels/cycle";

/**
 * Les dominantes du modèle actuel.
 *
 * L'opposition « mécanique / métabolique » n'est plus proposée : elle ne
 * décrit pas ce qu'un bloc fait varier. Les cycles déjà enregistrés sous ces
 * valeurs les gardent et restent lisibles (`libelleCycle`) — rien n'est
 * réécrit en base.
 */
const TYPES_CYCLE = [
  ...DOMINANTES.map((d) => ({ valeur: d, libelle: LIBELLES_DOMINANTE[d] })),
  { valeur: "deload", libelle: "Décharge" },
] as const;

export function CreationBlocForm() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [typeCycle, setTypeCycle] = useState<string>("volume");
  const [envoi, setEnvoi] = useState(false);

  const creer = async () => {
    if (!nom.trim()) {
      toast.error("Donne un nom au bloc");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/programme/blocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nom.trim(), dateDebut, typeCycle, actif: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Bloc créé");
      router.refresh();
    } catch {
      toast.error("Création impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="bg-carte border border-filet rounded-lg p-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nomBloc">Nom du bloc</Label>
        <Input id="nomBloc" value={nom} onChange={(e) => setNom(e.target.value)}
          placeholder="Bloc 1 — Cycle mécanique" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="dateDebut">Début</Label>
          <Input id="dateDebut" type="date" value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)} />
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
        {envoi ? "Création…" : "Créer le bloc"}
      </Button>
    </div>
  );
}
