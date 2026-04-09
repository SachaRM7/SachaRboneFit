"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

export const MUSCLES = [
  "Pectoraux", "Dorsaux", "Trapèzes", "Épaules",
  "Biceps", "Triceps", "Avant-bras",
  "Quadriceps", "Ischio-jambiers", "Fessiers", "Adducteurs",
  "Mollets", "Abdominaux", "Lombaires",
] as const;

export type Courbature = { muscle: string; intensite: number };

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
        <span className="inline-flex items-center justify-start w-full px-3 py-2 text-sm border border-zinc-700 rounded-md bg-zinc-900 text-zinc-300 cursor-pointer hover:bg-zinc-800 hover:text-white">
          <Plus className="w-4 h-4 mr-2" />
          {value.length === 0 ? "Ajouter des courbatures" : `${value.length} courbature(s)`}
        </span>
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Courbatures</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing courbatures */}
          {value.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {value.map(c => (
                <Badge key={c.muscle} variant="outline" className="border-zinc-700 text-white pr-1.5">
                  {c.muscle} ({c.intensite}/10)
                  <button
                    onClick={() => removeCourbature(c.muscle)}
                    className="ml-1 text-zinc-400 hover:text-white"
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
              <Label className="text-zinc-400 text-xs mb-1 block">Muscle</Label>
              <Select value={selectedMuscle} onValueChange={(v) => setSelectedMuscle(v ?? "")}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue placeholder="Choisir un muscle" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {MUSCLES.filter(m => !value.some(c => c.muscle === m)).map(muscle => (
                    <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-zinc-400 text-xs mb-2 block">Intensité: {intensite[0]}/10</Label>
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
              className="w-full bg-white text-black hover:bg-zinc-200"
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
