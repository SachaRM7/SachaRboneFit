"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dailyStateSchema, type DailyStateInput } from "@/lib/validators/daily-state";
import { CourbaturesModal, type Courbature } from "./CourbaturesModal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface DailyStateFormProps {
  initialDate: string;
  preselectedGymId?: string;
}

export function DailyStateForm({ initialDate, preselectedGymId }: DailyStateFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [courbatures, setCourbatures] = useState<Courbature[]>([]);
  const [gyms, setGyms] = useState<{ id: string; nom: string }[]>([]);
  const [defaultGymId, setDefaultGymId] = useState<string>(preselectedGymId || "");

  // Fetch gyms
  useEffect(() => {
    fetch("/api/gyms")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setGyms(data);
      });
  }, []);

  // Load existing daily state for this date
  useEffect(() => {
    fetch(`/api/daily-state?date=${initialDate}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.id) {
          setValue("sommeilHeures", data.sommeilHeures ?? 7);
          setValue("jeuneBool", data.jeuneBool ?? false);
          setValue("shiftRecentBool", data.shiftRecentBool ?? false);
          setValue("shiftType", data.shiftType ?? "aucun");
          setValue("energieDepart", data.energieDepart ?? 5);
          setValue("dernierRepasHeure", data.dernierRepasHeure ?? null);
          setValue("horaireSeancePrevu", data.horaireSeancePrevu ?? null);
          if (data.courbatures) setCourbatures(data.courbatures);
          if (data.gymId) setDefaultGymId(data.gymId);
        }
      });
  }, [initialDate]);

  const { register, setValue, watch, formState: { errors } } = useForm<DailyStateInput>({
    resolver: zodResolver(dailyStateSchema),
    defaultValues: {
      date: initialDate,
      sommeilHeures: 7,
      jeuneBool: false,
      shiftRecentBool: false,
      shiftType: "aucun",
      energieDepart: 5,
      courbatures: [],
    },
  });

  const sommeilHeures = watch("sommeilHeures");
  const jeunebool = watch("jeuneBool");
  const shiftRecentBool = watch("shiftRecentBool");
  const shiftType = watch("shiftType");
  const energieDepart = watch("energieDepart");

  const onSubmit = async (data: DailyStateInput) => {
    if (!defaultGymId) {
      toast.error("Sélectionne une salle");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/daily-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, date: initialDate, courbatures }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }

      const state = await res.json();
      toast.success("État du jour enregistré");
      router.push(`/session/start?date=${initialDate}&dailyStateId=${state.id}&gymId=${defaultGymId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0-24

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ date: initialDate, sommeilHeures, jeuneBool: jeunebool, shiftRecentBool, shiftType, energieDepart, courbatures, dernierRepasHeure: null, horaireSeancePrevu: null }); }} className="space-y-6 p-4 max-w-md mx-auto">

      {/* Salle */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">Salle du jour</Label>
        <Select value={defaultGymId} onValueChange={(v) => { if (v) setDefaultGymId(v); }}>
          <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
            <SelectValue placeholder="Choisir une salle" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
            {gyms.map(gym => (
              <SelectItem key={gym.id} value={gym.id}>{gym.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sommeil */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label className="text-zinc-400 text-xs">Sommeil</Label>
          <span className="text-white font-medium">{sommeilHeures}h</span>
        </div>
        <Slider
          value={[sommeilHeures ?? 7]}
          onValueChange={(v) => setValue("sommeilHeures", (v as readonly number[])[0]!)}
          min={0}
          max={12}
          step={0.5}
          className="w-full"
        />
        <div className="flex justify-between mt-1">
          <span className="text-zinc-600 text-xs">0h</span>
          <span className="text-zinc-600 text-xs">12h</span>
        </div>
      </div>

      {/* Jeûne */}
      <div className="flex items-center justify-between">
        <Label className="text-zinc-300">Jeûne</Label>
        <Switch
          checked={jeunebool ?? false}
          onCheckedChange={(v) => setValue("jeuneBool", v)}
        />
      </div>

      {/* Shift récent */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-zinc-300">Shift récent (48h)</Label>
          <Switch
            checked={shiftRecentBool ?? false}
            onCheckedChange={(v) => setValue("shiftRecentBool", v)}
          />
        </div>
        {shiftRecentBool && (
          <div className="flex gap-2 pl-4">
            {(["jour", "nuit"] as const).map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={type}
                  checked={shiftType === type}
                  onChange={() => setValue("shiftType", type)}
                  className="text-white"
                />
                <span className="text-zinc-300 text-sm capitalize">{type}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Énergie départ */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label className="text-zinc-400 text-xs">Énergie au réveil</Label>
          <span className="text-white font-medium">{energieDepart ?? 5}/10</span>
        </div>
        <Slider
          value={[energieDepart ?? 5]}
          onValueChange={(v) => setValue("energieDepart", (v as readonly number[])[0]!)}
          min={1}
          max={10}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between mt-1">
          <span className="text-zinc-600 text-xs">1</span>
          <span className="text-zinc-600 text-xs">10</span>
        </div>
      </div>

      {/* Courbatures */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">Courbatures</Label>
        <CourbaturesModal value={courbatures} onChange={setCourbatures} />
      </div>

      {/* Dernier repas */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">Dernier repas</Label>
        <Select
          value={watch("dernierRepasHeure") || "none"}
          onValueChange={(v) => setValue("dernierRepasHeure", v === "none" ? null : v)}
        >
          <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
            <SelectItem value="none">Non renseigné</SelectItem>
            {HOURS.filter(h => h >= 6 && h <= 23).map(h => (
              <SelectItem key={h} value={`${h.toString().padStart(2, "0")}:00`}>
                {h}h
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Horaire prévu */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">Horaire séance prévu</Label>
        <Select
          value={watch("horaireSeancePrevu") || "none"}
          onValueChange={(v) => setValue("horaireSeancePrevu", v === "none" ? null : v)}
        >
          <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
            <SelectItem value="none">Non renseigné</SelectItem>
            {HOURS.filter(h => h >= 5 && h <= 23).map(h => (
              <SelectItem key={h} value={`${h.toString().padStart(2, "0")}:00`}>
                {h}h
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full h-14 text-base bg-white text-black hover:bg-zinc-200"
      >
        {loading ? "Enregistrement..." : "Valider → Voir la séance ajustée"}
      </Button>
    </form>
  );
}
