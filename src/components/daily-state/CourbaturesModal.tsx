"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MUSCLES as REFERENTIEL_MUSCLES, LIBELLES, type Muscle } from "@/lib/referentiels/muscles";
import { Plus, X } from "lucide-react";

// La liste vient du referentiel : elle etait auparavant redigee ici dans un
// vocabulaire propre a l'interface, qui ne correspondait a aucun autre.
// On stocke la valeur canonique et on affiche le libelle.
export const MUSCLES = REFERENTIEL_MUSCLES;

export type Courbature = { muscle: Muscle | string; intensite: number };

interface CourbaturesModalProps {
  value: Courbature[];
  onChange: (value: Courbature[]) => void;
}

export function CourbaturesModal({ value, onChange }: CourbaturesModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<string>("");
  const [intensite, setIntensite] = useState([5]);

  const addCourbature = () => {
    if (!selectedMuscle) return;
    if (value.some(c => c.muscle === selectedMuscle)) return; // already added
    onChange([...value, { muscle: selectedMuscle, intensite: intensite[0]! }]);
    setSelectedMuscle("");
    setIntensite([5]);
  };

  const removeCourbature = (muscle: string) => {
    onChange(value.filter(c => c.muscle !== muscle));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <span className="inline-flex items-center justify-start w-full px-3 py-2 text-sm border border-filet rounded-md bg-carte text-encre-2 cursor-pointer hover:bg-papier-2 hover:text-encre">
          <Plus className="w-4 h-4 mr-2" />
          {value.length === 0 ? "Ajouter des courbatures" : `${value.length} courbature(s)`}
        </span>
      </DialogTrigger>
      <DialogContent className="bg-papier border-filet text-encre">
        <DialogHeader>
          <DialogTitle className="text-encre">Courbatures</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing courbatures */}
          {value.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {value.map(c => (
                <Badge key={c.muscle} variant="outline" className="border-filet text-encre pr-1.5">
                  {LIBELLES[c.muscle as Muscle] ?? c.muscle} ({c.intensite}/10)
                  <button
                    onClick={() => removeCourbature(c.muscle)}
                    className="ml-1 text-encre-2 hover:text-encre"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Add new */}
          <div className="space-y-3">
            <div>
              <Label className="text-encre-2 text-xs mb-1 block">Muscle</Label>
              <Select value={selectedMuscle} onValueChange={(v) => setSelectedMuscle(v ?? "")}>
                <SelectTrigger className="bg-carte border-filet text-encre">
                  <SelectValue placeholder="Choisir un muscle" />
                </SelectTrigger>
                <SelectContent className="bg-carte border-filet text-encre">
                  {MUSCLES.filter(m => !value.some(c => c.muscle === m)).map(muscle => (
                    <SelectItem key={muscle} value={muscle}>{LIBELLES[muscle]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-encre-2 text-xs mb-2 block">Intensité: {intensite[0]}/10</Label>
              <Slider
                value={intensite}
                onValueChange={(v) => setIntensite(Array.isArray(v) ? [...v] : [v])}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
            </div>

            <Button
              onClick={addCourbature}
              disabled={!selectedMuscle}
              className="w-full bg-encre text-papier hover:bg-filet"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
