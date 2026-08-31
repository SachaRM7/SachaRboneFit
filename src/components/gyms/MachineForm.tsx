"use client";
import { useMemo, useState } from "react";
import { libellePilier } from "@/lib/referentiels/libelles";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import {
  CONVENTIONS_CHARGE, TYPES_POULIE, LIBELLES_CONVENTION, LIBELLES_POULIE,
} from "@/lib/validators/exercise-instance";

export interface ExerciceSelectionnable {
  id: string;
  nom: string;
  pilier: string;
  slug: string | null;
  dejaPresent: boolean;
}

export interface MachineExistante {
  id: string;
  machineNom: string;
  typePoulie: string | null;
  conventionCharge: string;
  incrementsPossibles: number[];
  poidsNonCompte: number | null;
  chargeMax: number | null;
  notesMachine: string | null;
}

interface Props {
  gymId: string;
  exercices: ExerciceSelectionnable[];
  /** Renseigné pour une modification, absent pour un ajout. */
  machine?: MachineExistante & { exerciseId: string };
  onTermine?: () => void;
}

/** Incréments proposés d'un clic, tirés des matériels courants. */
const INCREMENTS_COURANTS = [
  { libelle: "Pile 5 kg", valeurs: [5] },
  { libelle: "Pile 2,5 kg", valeurs: [2.5, 5] },
  { libelle: "Pile en livres", valeurs: [2.3, 4.5, 6.8, 9, 11.3, 13.5] },
  { libelle: "Barre olympique", valeurs: [2.5, 5, 10, 20] },
  { libelle: "Haltères 2 kg", valeurs: [2] },
  { libelle: "Disques", valeurs: [2.5, 5, 10, 15, 20] },
];

export function MachineForm({ gymId, exercices, machine, onTermine }: Props) {
  const router = useRouter();
  const modification = Boolean(machine);

  const [exerciseId, setExerciseId] = useState(machine?.exerciseId ?? "");
  const [recherche, setRecherche] = useState("");
  const [machineNom, setMachineNom] = useState(machine?.machineNom ?? "");
  const [typePoulie, setTypePoulie] = useState(machine?.typePoulie ?? "na");
  const [conventionCharge, setConventionCharge] = useState(machine?.conventionCharge ?? "pile_affichee");
  const [increments, setIncrements] = useState(
    (machine?.incrementsPossibles ?? [5]).join(", "),
  );
  const [poidsNonCompte, setPoidsNonCompte] = useState(machine?.poidsNonCompte?.toString() ?? "");
  const [chargeMax, setChargeMax] = useState(machine?.chargeMax?.toString() ?? "");
  const [notes, setNotes] = useState(machine?.notesMachine ?? "");
  const [envoi, setEnvoi] = useState(false);

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const base = q
      ? exercices.filter((e) => e.nom.toLowerCase().includes(q) || e.pilier.toLowerCase().includes(q))
      : exercices;
    return base.slice(0, 40);
  }, [exercices, recherche]);

  const exerciceChoisi = exercices.find((e) => e.id === exerciseId);

  const parseIncrements = (): number[] | null => {
    const valeurs = increments
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((v) => Number(v.replace(",", ".")));
    if (valeurs.length === 0 || valeurs.some((v) => !Number.isFinite(v) || v <= 0)) return null;
    return [...new Set(valeurs)].sort((a, b) => a - b);
  };

  const enregistrer = async () => {
    if (!exerciseId) {
      toast.error("Choisis l'exercice disponible ici");
      return;
    }
    // Le nom sur place était exigé : une barre, des haltères, une barre de
    // traction n'en portent aucun, et ces exercices étaient donc impossibles à
    // déclarer. Sans nom, le serveur retient celui de l'exercice.
    const valeurs = parseIncrements();
    if (!valeurs) {
      toast.error("Incréments invalides — sépare-les par des virgules");
      return;
    }

    const nombreOuNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

    setEnvoi(true);
    try {
      const corps = {
        machineNom: machineNom.trim() || undefined,
        typePoulie,
        conventionCharge,
        incrementsPossibles: valeurs,
        poidsNonCompte: nombreOuNull(poidsNonCompte),
        chargeMax: nombreOuNull(chargeMax),
        notesMachine: notes.trim() || null,
      };

      const res = machine
        ? await fetch(`/api/exercise-instances/${machine.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corps),
          })
        : await fetch("/api/exercise-instances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...corps, exerciseId, gymId }),
          });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Échec");
      }

      toast.success(modification ? "Machine mise à jour" : "Machine ajoutée");
      onTermine?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-5">
      {!modification && (
        <div className="space-y-2">
          <Label htmlFor="recherche">Exercice réalisé sur cette machine</Label>
          {exerciceChoisi ? (
            <div className="flex items-center gap-3 bg-carte border border-filet rounded-lg p-3">
              {exerciceChoisi.slug && (
                <IllustrationExercice
                  slug={exerciceChoisi.slug}
                  nom={exerciceChoisi.nom}
                  className="w-9 h-9 shrink-0 text-encre-2"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-encre text-sm font-medium">{exerciceChoisi.nom}</p>
                <p className="text-encre-3 text-xs">{libellePilier(exerciceChoisi.pilier)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setExerciseId("")}>
                Changer
              </Button>
            </div>
          ) : (
            <>
              <Input
                id="recherche"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher : développé, squat, tirage…"
              />
              <div className="max-h-64 overflow-y-auto space-y-1 border border-filet rounded-lg p-1">
                {resultats.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setExerciseId(e.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-papier-2 text-left"
                  >
                    {e.slug && (
                      <IllustrationExercice slug={e.slug} nom={e.nom} className="w-8 h-8 shrink-0 text-encre-3" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-encre text-sm truncate">{e.nom}</span>
                      <span className="block text-encre-3 text-xs">{libellePilier(e.pilier)}</span>
                    </span>
                    {e.dejaPresent && (
                      <span className="text-[10px] text-feu-orange shrink-0">déjà dans la salle</span>
                    )}
                  </button>
                ))}
                {resultats.length === 0 && (
                  <p className="text-encre-3 text-sm p-3">Aucun exercice ne correspond.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="machineNom">
          Nom sur place <span className="text-encre-3 font-normal">(facultatif)</span>
        </Label>
        <Input
          id="machineNom"
          value={machineNom}
          onChange={(e) => setMachineNom(e.target.value)}
          placeholder="Matrix Perfect Squat, rack 2, Pec Fly réglage 1…"
        />
        <p className="text-encre-3 text-xs">
          Utile pour un appareil, dont le réglage fait partie de l&apos;identité. Pour une barre ou
          des haltères, laisse vide : le nom de l&apos;exercice suffit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Convention de charge</Label>
          <Select value={conventionCharge} onValueChange={(v) => setConventionCharge(v ?? "pile_affichee")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONVENTIONS_CHARGE.map((c) => (
                <SelectItem key={c} value={c}>{LIBELLES_CONVENTION[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Poulie</Label>
          <Select value={typePoulie} onValueChange={(v) => setTypePoulie(v ?? "na")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES_POULIE.map((t) => (
                <SelectItem key={t} value={t}>{LIBELLES_POULIE[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="increments">Incréments possibles (kg)</Label>
        <Input
          id="increments"
          value={increments}
          onChange={(e) => setIncrements(e.target.value)}
          placeholder="2.5, 5, 10"
        />
        <div className="flex flex-wrap gap-2">
          {INCREMENTS_COURANTS.map((p) => (
            <button
              key={p.libelle}
              type="button"
              onClick={() => setIncrements(p.valeurs.join(", "))}
              className="px-2.5 py-1 rounded-full text-xs border border-filet bg-carte text-encre-2 hover:text-encre"
            >
              {p.libelle}
            </button>
          ))}
        </div>
        <p className="text-encre-3 text-xs">
          Les sauts réellement disponibles. C&apos;est ce qui détermine la charge proposée à la séance suivante.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="poidsNonCompte">Poids non compté (kg)</Label>
          <Input
            id="poidsNonCompte"
            inputMode="decimal"
            value={poidsNonCompte}
            onChange={(e) => setPoidsNonCompte(e.target.value)}
            placeholder="30.4"
          />
          <p className="text-encre-3 text-xs">Chariot à vide, barre guidée…</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="chargeMax">Charge max (kg)</Label>
          <Input
            id="chargeMax"
            inputMode="decimal"
            value={chargeMax}
            onChange={(e) => setChargeMax(e.target.value)}
            placeholder="100"
          />
          <p className="text-encre-3 text-xs">Plafond de la pile, si elle en a un.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Souvent occupée aux heures de pointe, siège réglé au cran 4…"
          className="bg-carte border-filet text-encre"
        />
      </div>

      <Button className="w-full h-12" onClick={enregistrer} disabled={envoi}>
        {envoi ? "Enregistrement…" : modification ? "Mettre à jour" : "Ajouter la machine"}
      </Button>
    </div>
  );
}
