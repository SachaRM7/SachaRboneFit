"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { Plus, Trash2 } from "lucide-react";

export interface ExerciceProgramme {
  ligneId: string;
  ordre: number;
  machineNom: string;
  exerciceNom: string;
  exerciceSlug: string | null;
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number | null;
  tempo: string | null;
  reposSecondes: number | null;
}

export interface SeanceProgramme {
  id: string;
  lettre: string;
  nom: string;
  ordreDansSemaine: number;
  exercices: ExerciceProgramme[];
}

export interface MachineDisponible {
  id: string;
  machineNom: string;
  exerciceNom: string;
  exerciceSlug: string | null;
  salleNom: string;
  pilier: string;
}

interface Props {
  bloc: { id: string; nom: string; typeCycle: string; semaineActuelle: number | null } | null;
  seances: SeanceProgramme[];
  machines: MachineDisponible[];
}

export function GestionProgramme({ bloc, seances, machines }: Props) {
  const router = useRouter();
  const [creationSeance, setCreationSeance] = useState(false);
  const [ajoutPour, setAjoutPour] = useState<SeanceProgramme | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [lettre, setLettre] = useState("");
  const [nomSeance, setNomSeance] = useState("");

  const [instanceId, setInstanceId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [series, setSeries] = useState(4);
  const [repsMin, setRepsMin] = useState(8);
  const [repsMax, setRepsMax] = useState(10);
  const [rpe, setRpe] = useState(8);
  const [tempo, setTempo] = useState("3010");
  const [repos, setRepos] = useState(120);

  const creerSeance = async () => {
    if (!bloc) return;
    if (!lettre.trim() || !nomSeance.trim()) {
      toast.error("Renseigne une lettre et un nom");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/programme/seances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: bloc.id, lettre: lettre.trim().toUpperCase(), nom: nomSeance.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Séance créée");
      setCreationSeance(false);
      setLettre("");
      setNomSeance("");
      router.refresh();
    } catch {
      toast.error("Création impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const ajouterExercice = async () => {
    if (!ajoutPour || !instanceId) {
      toast.error("Choisis une machine");
      return;
    }
    if (repsMin > repsMax) {
      toast.error("La fourchette de répétitions est inversée");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/programme/seances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seanceTemplateId: ajoutPour.id,
          exerciseInstanceId: instanceId,
          seriesCibles: series,
          fourchetteRepsMin: repsMin,
          fourchetteRepsMax: repsMax,
          rpeCible: rpe,
          tempo: tempo || null,
          reposSecondes: repos,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Exercice ajouté");
      setAjoutPour(null);
      setInstanceId("");
      setRecherche("");
      router.refresh();
    } catch {
      toast.error("Ajout impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (ligne: ExerciceProgramme) => {
    if (!confirm(`Retirer « ${ligne.exerciceNom} » de la séance ?`)) return;
    try {
      const res = await fetch(`/api/programme/exercices/${ligne.ligneId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Exercice retiré");
      router.refresh();
    } catch {
      toast.error("Suppression impossible");
    }
  };

  const machinesFiltrees = recherche.trim()
    ? machines.filter((m) =>
        `${m.exerciceNom} ${m.machineNom} ${m.pilier}`.toLowerCase().includes(recherche.trim().toLowerCase()),
      )
    : machines;

  if (!bloc) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <p className="text-zinc-400 text-sm">
          Aucun bloc actif. Crée un bloc pour commencer à programmer tes séances.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <p className="text-white font-medium">{bloc.nom}</p>
        <p className="text-zinc-500 text-sm mt-0.5">
          Cycle {bloc.typeCycle}
          {bloc.semaineActuelle ? ` · semaine ${bloc.semaineActuelle}` : ""}
        </p>
      </div>

      {seances.map((s) => (
        <section key={s.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-white font-semibold">
              <span className="text-zinc-500 mr-2">{s.lettre}</span>
              {s.nom}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setAjoutPour(s)}>
              <Plus className="w-4 h-4 mr-1" />
              Exercice
            </Button>
          </div>

          {s.exercices.length === 0 ? (
            <p className="text-zinc-500 text-sm bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              Séance vide — elle ne proposera aucun exercice.
            </p>
          ) : (
            <div className="space-y-2">
              {s.exercices.map((e) => (
                <div key={e.ligneId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-zinc-600 text-xs font-mono mt-1 w-4 shrink-0">{e.ordre}</span>
                    {e.exerciceSlug && (
                      <IllustrationExercice
                        slug={e.exerciceSlug}
                        nom={e.exerciceNom}
                        className="w-9 h-9 shrink-0 text-zinc-400"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{e.exerciceNom}</p>
                      <p className="text-zinc-500 text-xs">{e.machineNom}</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                          {e.seriesCibles} × {e.fourchetteRepsMin}-{e.fourchetteRepsMax}
                        </Badge>
                        {e.rpeCible && (
                          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                            RPE {e.rpeCible}
                          </Badge>
                        )}
                        {e.tempo && (
                          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                            tempo {e.tempo}
                          </Badge>
                        )}
                        {e.reposSecondes !== null && (
                          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                            {e.reposSecondes}s
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Retirer ${e.exerciceNom}`}
                      onClick={() => retirer(e)}>
                      <Trash2 className="w-4 h-4 text-zinc-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <Button variant="outline" className="w-full bg-zinc-900 border-zinc-700"
        onClick={() => setCreationSeance(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Ajouter une séance
      </Button>

      <Drawer open={creationSeance} onOpenChange={setCreationSeance}>
        <DrawerContent className="bg-zinc-950 border-zinc-800 text-white">
          <DrawerHeader><DrawerTitle className="text-white">Nouvelle séance</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lettre">Lettre</Label>
              <Input id="lettre" value={lettre} maxLength={3}
                onChange={(e) => setLettre(e.target.value)} placeholder="D" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomSeance">Nom</Label>
              <Input id="nomSeance" value={nomSeance}
                onChange={(e) => setNomSeance(e.target.value)} placeholder="Séance D — Dos + Biceps" />
            </div>
            <Button className="w-full h-12" onClick={creerSeance} disabled={envoi}>
              {envoi ? "Création…" : "Créer la séance"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={ajoutPour !== null} onOpenChange={(o) => !o && setAjoutPour(null)}>
        <DrawerContent className="bg-zinc-950 border-zinc-800 text-white max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="text-white">Ajouter à « {ajoutPour?.nom} »</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <Label>Machine</Label>
              {instanceId ? (
                <div className="flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-3">
                  <span className="text-sm text-white min-w-0 truncate">
                    {machines.find((m) => m.id === instanceId)?.exerciceNom}
                    <span className="text-zinc-500"> · {machines.find((m) => m.id === instanceId)?.machineNom}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setInstanceId("")}>Changer</Button>
                </div>
              ) : (
                <>
                  <Input value={recherche} onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Chercher une machine…" />
                  <div className="max-h-56 overflow-y-auto space-y-1 border border-zinc-800 rounded-lg p-1">
                    {machinesFiltrees.slice(0, 40).map((m) => (
                      <button key={m.id} type="button" onClick={() => setInstanceId(m.id)}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800 text-left">
                        {m.exerciceSlug && (
                          <IllustrationExercice slug={m.exerciceSlug} nom={m.exerciceNom}
                            className="w-8 h-8 shrink-0 text-zinc-500" />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-white text-sm truncate">{m.exerciceNom}</span>
                          <span className="block text-zinc-500 text-xs truncate">{m.machineNom} · {m.salleNom}</span>
                        </span>
                      </button>
                    ))}
                    {machinesFiltrees.length === 0 && (
                      <p className="text-zinc-500 text-sm p-3">
                        Aucune machine. Équipe d&apos;abord une salle.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="series">Séries</Label>
                <Input id="series" type="number" min={1} max={12} value={series}
                  onChange={(e) => setSeries(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repsMin">Reps min</Label>
                <Input id="repsMin" type="number" min={1} max={50} value={repsMin}
                  onChange={(e) => setRepsMin(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repsMax">Reps max</Label>
                <Input id="repsMax" type="number" min={1} max={50} value={repsMax}
                  onChange={(e) => setRepsMax(Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>RPE cible</Label>
                <Select value={String(rpe)} onValueChange={(v) => setRpe(Number(v ?? 8))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => (
                      <SelectItem key={v} value={String(v)}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tempo">Tempo</Label>
                <Input id="tempo" value={tempo} maxLength={10}
                  onChange={(e) => setTempo(e.target.value)} placeholder="3010" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repos">Repos (s)</Label>
                <Input id="repos" type="number" min={0} max={900} value={repos}
                  onChange={(e) => setRepos(Number(e.target.value))} />
              </div>
            </div>

            <Button className="w-full h-12" onClick={ajouterExercice} disabled={envoi}>
              {envoi ? "Ajout…" : "Ajouter l'exercice"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
