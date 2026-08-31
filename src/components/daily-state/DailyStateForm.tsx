"use client";
import { useEffect, useState } from "react";
import { messageErreur } from "@/lib/messages";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { MATERIEL_PORTABLE, LIBELLES_PORTABLE } from "@/lib/referentiels/capacites";

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
  const [sommeil, setSommeil] = useState(7);
  const [energie, setEnergie] = useState(5);
  const [jeune, setJeune] = useState(false);
  const [shiftRecent, setShiftRecent] = useState(false);
  const [shiftType, setShiftType] = useState<"jour" | "nuit" | "aucun">("aucun");
  const [dernierRepas, setDernierRepas] = useState<string | null>(null);
  const [horairePrevu, setHorairePrevu] = useState<string | null>(null);

  // Matériel emporté aujourd'hui. Pré-coché sur les habitudes : quelqu'un qui a
  // toujours ses élastiques dans son sac ne doit pas le redire chaque fois.
  const [materielApporte, setMaterielApporte] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((d) => {
        const habituel = d?.user?.materielPersonnelHabituel;
        if (Array.isArray(habituel) && habituel.length > 0) setMaterielApporte(habituel);
      })
      .catch(() => {});
  }, []);

  // Le chargement des salles ignorait tout ce qui n'etait pas un tableau : une
  // API en erreur laissait la liste vide, sans le moindre message. L'ecran
  // devenait un cul-de-sac — pas de salle selectionnable, donc pas de seance —
  // et rien ne distinguait « la requete a echoue » de « tu n'as aucune salle ».
  const [erreurSalles, setErreurSalles] = useState<string | null>(null);
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const reponse = await fetch("/api/gyms");
        const corps = await reponse.json().catch(() => null);
        if (annule) return;
        if (!reponse.ok || !Array.isArray(corps)) {
          setErreurSalles(messageErreur("charger tes lieux", corps?.error, reponse.status));
          return;
        }
        setGyms(corps);
      } catch (cause) {
        if (!annule) setErreurSalles(cause instanceof Error ? cause.message : "Requête impossible");
      }
    })();
    return () => { annule = true; };
  }, []);

  // Load existing daily state
  useEffect(() => {
    fetch(`/api/daily-state?date=${initialDate}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.id) {
          setSommeil(data.sommeilHeures ?? 7);
          setJeune(data.jeuneBool ?? false);
          setShiftRecent(data.shiftRecentBool ?? false);
          setShiftType((data.shiftType as "jour" | "nuit" | "aucun") ?? "aucun");
          setEnergie(data.energieDepart ?? 5);
          setDernierRepas(data.dernierRepasHeure ?? null);
          setHorairePrevu(data.horaireSeancePrevu ?? null);
          if (data.courbatures) setCourbatures(data.courbatures);
          if (data.gymId) setDefaultGymId(data.gymId);
          // Un état déjà saisi aujourd'hui l'emporte sur les habitudes.
          if (Array.isArray(data.materielApporte)) setMaterielApporte(data.materielApporte);
        }
      });
  }, [initialDate]);

  const onSubmit = async () => {
    if (!defaultGymId) {
      toast.error("Sélectionne une salle");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        date: initialDate,
        gymId: defaultGymId,
        sommeilHeures: sommeil,
        jeuneBool: jeune,
        shiftRecentBool: shiftRecent,
        shiftType: shiftRecent ? shiftType : "aucun",
        energieDepart: energie,
        courbatures,
        materielApporte,
        dernierRepasHeure: dernierRepas,
        horaireSeancePrevu: horairePrevu,
      };

      const res = await fetch("/api/daily-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }

      const state = await res.json();
      // Ce qu'on emporte change rarement : on le retient pour la fois suivante.
      fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materielPersonnelHabituel: materielApporte }),
      }).catch(() => {});
      toast.success("État du jour enregistré");
      router.push(`/session/start?date=${initialDate}&dailyStateId=${state.id}&gymId=${defaultGymId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const HOURS = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="space-y-6 p-4 max-w-md mx-auto">
      {/* Salle */}
      <div>
        <Label className="text-encre-2 text-xs mb-2 block">Salle du jour</Label>
        <Select value={defaultGymId} onValueChange={(v) => { if (v) setDefaultGymId(v); }}>
          <SelectTrigger className="bg-carte border-filet text-encre">
            <SelectValue placeholder="Choisir une salle" />
          </SelectTrigger>
          <SelectContent className="bg-carte border-filet text-encre">
            {gyms.map(gym => (
              <SelectItem key={gym.id} value={gym.id}>{gym.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {erreurSalles && (
          <p className="mt-2 text-perte text-xs">
            Salles non chargées — <span className="chiffres">{erreurSalles}</span>
          </p>
        )}

        {!erreurSalles && gyms.length === 0 && (
          <p className="mt-2 text-encre-3 text-xs">
            Aucune salle enregistrée.{" "}
            <Link href="/gyms" className="text-encre underline underline-offset-2">
              En créer une
            </Link>{" "}
            pour pouvoir démarrer une séance.
          </p>
        )}
      </div>

      {/* Sommeil */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label className="text-encre-2 text-xs">Sommeil</Label>
          <span className="text-encre font-medium">{sommeil}h</span>
        </div>
        <Slider
          value={[sommeil]}
          onValueChange={(v) => setSommeil(Array.isArray(v) ? v[0]! : v)}
          min={0}
          max={12}
          step={0.5}
          className="w-full"
        />
        <div className="flex justify-between mt-1">
          <span className="text-encre-3 text-xs">0h</span>
          <span className="text-encre-3 text-xs">12h</span>
        </div>
      </div>

      {/* Jeûne */}
      <div className="flex items-center justify-between">
        <Label className="text-encre-2">Jeûne</Label>
        <Switch checked={jeune} onCheckedChange={(v) => setJeune(v)} />
      </div>

      {/* Shift récent */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-encre-2">Shift récent (48h)</Label>
          <Switch checked={shiftRecent} onCheckedChange={(v) => setShiftRecent(v)} />
        </div>
        {shiftRecent && (
          <div className="flex gap-2 pl-4">
            {(["jour", "nuit"] as const).map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={type}
                  checked={shiftType === type}
                  onChange={() => setShiftType(type)}
                  className="text-encre"
                />
                <span className="text-encre-2 text-sm capitalize">{type}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Énergie départ */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label className="text-encre-2 text-xs">Énergie au réveil</Label>
          <span className="text-encre font-medium">{energie}/10</span>
        </div>
        <Slider
          value={[energie]}
          onValueChange={(v) => setEnergie(Array.isArray(v) ? v[0]! : v)}
          min={1}
          max={10}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between mt-1">
          <span className="text-encre-3 text-xs">1</span>
          <span className="text-encre-3 text-xs">10</span>
        </div>
      </div>

      {/* Matériel personnel emporté : il s'ajoute à celui du lieu pour aujourd'hui. */}
      <div>
        <Label className="text-encre-2 text-xs mb-2 block">Matériel personnel aujourd&apos;hui</Label>
        <div className="flex flex-wrap gap-2">
          {MATERIEL_PORTABLE.map((m) => {
            const actif = materielApporte.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={actif}
                onClick={() =>
                  setMaterielApporte((liste) =>
                    liste.includes(m) ? liste.filter((x) => x !== m) : [...liste, m],
                  )
                }
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  actif
                    ? "border-encre bg-encre text-papier"
                    : "border-filet bg-carte text-encre-2 hover:text-encre"
                }`}
              >
                {LIBELLES_PORTABLE[m]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Courbatures */}
      <div>
        <Label className="text-encre-2 text-xs mb-2 block">Courbatures</Label>
        <CourbaturesModal value={courbatures} onChange={setCourbatures} />
      </div>

      {/* Dernier repas */}
      <div>
        <Label className="text-encre-2 text-xs mb-2 block">Dernier repas</Label>
        <Select value={dernierRepas || "none"} onValueChange={(v) => setDernierRepas(v === "none" ? null : v)}>
          <SelectTrigger className="bg-carte border-filet text-encre">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent className="bg-carte border-filet text-encre">
            <SelectItem value="none">Non renseigné</SelectItem>
            {HOURS.filter(h => h >= 6 && h <= 23).map(h => (
              <SelectItem key={h} value={`${h.toString().padStart(2, "0")}:00`}>{h}h</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Horaire prévu */}
      <div>
        <Label className="text-encre-2 text-xs mb-2 block">Horaire séance prévu</Label>
        <Select value={horairePrevu || "none"} onValueChange={(v) => setHorairePrevu(v === "none" ? null : v)}>
          <SelectTrigger className="bg-carte border-filet text-encre">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent className="bg-carte border-filet text-encre">
            <SelectItem value="none">Non renseigné</SelectItem>
            {HOURS.filter(h => h >= 5 && h <= 23).map(h => (
              <SelectItem key={h} value={`${h.toString().padStart(2, "0")}:00`}>{h}h</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={onSubmit}
        disabled={loading}
        className="w-full h-14 text-base bg-encre text-papier hover:bg-filet"
      >
        {loading ? "Enregistrement..." : "Valider → Voir la séance ajustée"}
      </Button>
    </div>
  );
}