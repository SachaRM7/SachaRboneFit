"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MapPin, Plus } from "lucide-react";
import { LIBELLES_CONVENTION, CONVENTIONS_CHARGE } from "@/lib/validators/exercise-instance";

interface Salle {
  id: string;
  nom: string;
}

interface Props {
  exerciseId: string;
  exerciceNom: string;
  /** Salles où l'exercice est déjà équipé : on ne les repropose pas. */
  sallesDejaEquipees: string[];
}

/** Incréments les plus courants, par convention de charge. */
const INCREMENTS_PAR_DEFAUT: Record<string, number[]> = {
  pile_affichee: [5],
  disques_ajoutes: [2.5],
  poids_total: [2.5],
};

/**
 * Équiper un exercice dans une salle, depuis sa fiche.
 *
 * La bibliothèque comptait cent vingt et un exercices consultables et neuf
 * programmables, sans aucun chemin entre les deux : pour utiliser un exercice
 * il fallait deviner qu'il fallait d'abord créer une machine depuis l'écran des
 * salles. Le geste part désormais de l'endroit où l'envie naît — la fiche de
 * l'exercice.
 *
 * Les réglages fins (poulie, charge maximale, notes) restent du ressort de
 * l'écran des salles : ici on demande le minimum pour rendre l'exercice
 * utilisable tout de suite.
 */
export function EquiperDansSalle({ exerciseId, exerciceNom, sallesDejaEquipees }: Props) {
  const router = useRouter();
  const [salles, setSalles] = useState<Salle[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [salleId, setSalleId] = useState("");
  const [machineNom, setMachineNom] = useState(exerciceNom);
  const [convention, setConvention] = useState<string>("pile_affichee");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const reponse = await fetch("/api/gyms");
        const corps = await reponse.json().catch(() => null);
        if (annule) return;
        if (!reponse.ok || !Array.isArray(corps)) {
          setErreur(corps?.error ?? `HTTP ${reponse.status}`);
          return;
        }
        setSalles(corps);
      } catch (cause) {
        if (!annule) setErreur(cause instanceof Error ? cause.message : "Requête impossible");
      }
    })();
    return () => { annule = true; };
  }, []);

  const disponibles = salles.filter((s) => !sallesDejaEquipees.includes(s.id));

  const equiper = async () => {
    if (!salleId) return;
    setEnvoi(true);
    try {
      const reponse = await fetch("/api/exercise-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId,
          gymId: salleId,
          machineNom: machineNom.trim() || exerciceNom,
          typePoulie: "na",
          conventionCharge: convention,
          incrementsPossibles: INCREMENTS_PAR_DEFAUT[convention] ?? [2.5],
        }),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) throw new Error(corps?.error ?? `HTTP ${reponse.status}`);

      toast.success(`${exerciceNom} équipé`);
      setOuvert(false);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Équipement impossible");
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur) {
    return <p className="text-perte text-xs">Salles non chargées — {erreur}</p>;
  }

  if (salles.length === 0) return null;

  if (disponibles.length === 0) {
    return (
      <p className="text-encre-3 text-xs">
        Équipé dans toutes tes salles.
      </p>
    );
  }

  if (!ouvert) {
    return (
      <Button
        variant="outline"
        className="w-full border-filet bg-papier-2 text-encre-2"
        onClick={() => { setSalleId(disponibles[0]!.id); setOuvert(true); }}
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Équiper dans une salle
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-filet bg-carte p-4 space-y-4">
      <div className="space-y-2">
        <Label className="text-encre-2 text-xs">Salle</Label>
        <div className="flex flex-wrap gap-2">
          {disponibles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSalleId(s.id)}
              aria-pressed={salleId === s.id}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors ${
                salleId === s.id
                  ? "border-encre bg-encre text-papier"
                  : "border-filet bg-papier-2 text-encre-2"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {s.nom}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="machine" className="text-encre-2 text-xs">Nom de la machine</Label>
        <Input
          id="machine" value={machineNom}
          onChange={(e) => setMachineNom(e.target.value)}
          className="bg-papier-2 border-filet text-encre"
        />
        <p className="text-encre-3 text-xs">
          Le nom affiché en salle, s&apos;il diffère de celui de l&apos;exercice.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-encre-2 text-xs">Comment se lit la charge</Label>
        <div className="grid grid-cols-3 gap-2">
          {CONVENTIONS_CHARGE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setConvention(c)}
              aria-pressed={convention === c}
              className={`rounded-lg border px-2 py-2.5 text-xs transition-colors ${
                convention === c
                  ? "border-encre bg-encre text-papier"
                  : "border-filet bg-papier-2 text-encre-2"
              }`}
            >
              {LIBELLES_CONVENTION[c]}
            </button>
          ))}
        </div>
        <p className="text-encre-3 text-xs">
          Incréments de {(INCREMENTS_PAR_DEFAUT[convention] ?? [2.5]).join(", ")} kg — ajustables
          depuis la salle.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 bg-encre text-papier hover:bg-encre/90"
          onClick={equiper}
          disabled={envoi || !salleId}
        >
          {envoi ? "Ajout…" : "Équiper"}
        </Button>
        <Button variant="ghost" className="text-encre-2" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
