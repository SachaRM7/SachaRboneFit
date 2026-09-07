"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import {
  SYMPTOMES_GENERAUX, NOTE_SYMPTOME_MAX, libelleSymptome,
  type SymptomeDeclare, type SymptomeGeneral,
} from "@/lib/referentiels/symptomes";

/**
 * Déclarer un symptôme général avant la séance — en trois gestes.
 *
 * Bâti sur le modèle de `CourbaturesModal`, volontairement : c'est le geste que
 * l'écran enseigne déjà. Un formulaire d'un autre genre juste en dessous
 * demanderait de réapprendre quelque chose au moment où l'on veut aller vite.
 *
 * CE QUE CET ÉCRAN NE DEMANDE PAS : depuis quand, à quelle fréquence, si c'est
 * déjà arrivé, ce qu'on a mangé. Chacune de ces questions serait un pas vers
 * l'anamnèse, et la seule chose que l'application saura en faire, c'est
 * proposer d'alléger ou d'arrêter. Le type et l'intensité y suffisent.
 *
 * La liste vient du référentiel partagé. Recopier six chaînes ici aurait produit
 * un second vocabulaire, invisible du moteur et de la règle de prudence.
 */

interface Props {
  value: SymptomeDeclare[];
  onChange: (value: SymptomeDeclare[]) => void;
}

export function SymptomesModal({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("");
  const [intensite, setIntensite] = useState([3]);
  const [note, setNote] = useState("");

  const ajouter = () => {
    if (!type) return;
    // Un même symptôme deux fois n'apprend rien de plus : on remplace.
    const sans = value.filter((s) => s.symptome !== type);
    const texte = note.trim();
    onChange([...sans, {
      symptome: type as SymptomeGeneral,
      intensite: intensite[0]!,
      // Absente plutôt que vide : une note blanche traverserait tout jusqu'au
      // contexte du modèle sans rien y ajouter.
      ...(texte ? { note: texte } : {}),
      moment: "avant_seance",
    }]);
    setType("");
    setIntensite([3]);
    setNote("");
  };

  const retirer = (symptome: string) =>
    onChange(value.filter((s) => s.symptome !== symptome));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex items-center justify-start w-full px-3 py-2 text-sm border border-filet rounded-md bg-carte text-encre-2 cursor-pointer hover:bg-papier-2 hover:text-encre">
          <Plus className="w-4 h-4 mr-2" />
          {value.length === 0
            ? "Ajouter un symptôme"
            : `${value.length} symptôme${value.length > 1 ? "s" : ""}`}
        </span>
      </DialogTrigger>
      <DialogContent className="bg-papier border-filet text-encre">
        <DialogHeader>
          <DialogTitle className="text-encre">Symptômes généraux</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {value.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {value.map((s) => (
                <Badge key={s.symptome} variant="outline" className="border-filet text-encre pr-1.5">
                  {libelleSymptome(s.symptome)} ({s.intensite}/10)
                  <button
                    onClick={() => retirer(s.symptome)}
                    className="ml-1.5 p-0.5"
                    aria-label={`Retirer ${libelleSymptome(s.symptome)}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-encre-2 text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v ?? "")}>
              <SelectTrigger className="bg-carte border-filet text-encre">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent className="bg-papier border-filet text-encre">
                {SYMPTOMES_GENERAUX.map((s) => (
                  <SelectItem key={s.valeur} value={s.valeur}>{s.libelle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-encre-2 text-xs">Intensité</Label>
              <span className="text-encre text-sm chiffres tabular-nums">{intensite[0]}/10</span>
            </div>
            <Slider
              value={intensite}
              onValueChange={(v) => setIntensite(Array.isArray(v) ? v : [v])}
              min={1} max={10} step={1}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-encre-2 text-xs">Note (facultative)</Label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_SYMPTOME_MAX))}
              maxLength={NOTE_SYMPTOME_MAX}
              placeholder="Depuis ce matin…"
              className="w-full px-3 py-2 text-sm rounded-md bg-carte border border-filet text-encre placeholder:text-encre-3"
            />
          </div>

          <Button className="w-full bg-encre text-papier" onClick={ajouter} disabled={!type}>
            Ajouter
          </Button>

          {/*
            La phrase qui tient toute la précaution de ce lot. L'application
            consigne un ressenti ; elle ne l'explique pas, et elle n'est pas en
            position de le faire.
          */}
          <p className="text-encre-3 text-xs">
            Ce que tu ressens est consigné pour adapter la séance. Ce n&apos;est pas un
            avis médical.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
