"use client";
import { useRef, useState } from "react";
import { directionDuGeste, indexApresGeste, indexValide } from "./navigation-seances";
import { libelleCycle } from "@/lib/referentiels/cycle";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import {
  CHOIX_CIBLE_EFFORT,
  NON_PRESCRIT,
  choixDepuisCible,
  cibleDepuisChoix,
  libelleCibleEffort,
} from "./cible-effort";
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
  /** `semaineActuelle` n'est plus transmise : elle vaut 1 et ne bouge pas. */
  bloc: { id: string; nom: string; typeCycle: string } | null;
  seances: SeanceProgramme[];
  machines: MachineDisponible[];
}

export function GestionProgramme({ bloc, seances, machines }: Props) {
  const router = useRouter();
  /**
   * Une séance à la fois.
   *
   * L'édition avancée dépliait les quatre séances, chacune avec tous ses
   * exercices et leurs réglages : un ruban de plusieurs écrans où l'on ne
   * savait plus quelle séance on modifiait, et où corriger la séance D
   * supposait de faire défiler A, B et C. La capacité d'édition ne change pas
   * — c'est la quantité montrée d'un coup qui change.
   *
   * `indexValide` recadre quand la liste bouge : après la suppression de la
   * séance affichée, l'index désignait le vide et l'écran annonçait « aucune
   * séance » alors qu'il en restait trois.
   */
  const [indexSeance, setIndexSeance] = useState(0);
  const courante = seances[indexValide(indexSeance, seances.length)] ?? null;
  const depart = useRef<{ x: number; y: number } | null>(null);

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
  const [tempo, setTempo] = useState("3010");
  const [repos, setRepos] = useState(120);

  // Le menu s'ouvrait sur « RPE 8 » sans option vide : tout exercice ajouté à
  // la main partait donc avec une prescription que personne n'avait formulée.
  const [choixEffort, setChoixEffort] = useState<string>(NON_PRESCRIT);

  const [editionEffort, setEditionEffort] = useState<ExerciceProgramme | null>(null);

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
          rpeCible: cibleDepuisChoix(choixEffort),
          tempo: tempo || null,
          reposSecondes: repos,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Exercice ajouté");
      setAjoutPour(null);
      setInstanceId("");
      setRecherche("");
      // Sans cette remise à zéro, la cible du dernier exercice deviendrait le
      // défaut du suivant — une prescription qui se propage toute seule.
      setChoixEffort(NON_PRESCRIT);
      router.refresh();
    } catch {
      toast.error("Ajout impossible");
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * Change la cible d'effort d'un exercice déjà programmé.
   *
   * `rpeCible` est envoyé même quand il vaut `null` : c'est la clé présente,
   * pas sa valeur, qui dit au serveur de toucher à la cible.
   */
  const changerEffort = async (ligne: ExerciceProgramme, choix: string) => {
    setEnvoi(true);
    try {
      const res = await fetch(`/api/programme/exercices/${ligne.ligneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rpeCible: cibleDepuisChoix(choix) }),
      });
      if (!res.ok) throw new Error();
      toast.success("Effort cible mis à jour");
      setEditionEffort(null);
      router.refresh();
    } catch {
      toast.error("Modification impossible");
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
      <div className="bg-carte border border-filet rounded-lg p-4">
        <p className="text-encre-2 text-sm">
          Aucun bloc actif. Crée un bloc pour commencer à programmer tes séances.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-carte border border-filet rounded-lg p-4">
        <p className="text-encre font-medium">{bloc.nom}</p>
        {/* Ni `type_cycle` brut, ni `semaine_actuelle` : cette colonne est
            écrite à 1 et jamais incrémentée. La semaine réelle se déduit de la
            date de début, et se lit en haut de l'écran. */}
        <p className="text-encre-3 text-sm mt-0.5">{libelleCycle(bloc.typeCycle).libelle}</p>
      </div>

      {/* Les onglets : la séance ouverte est nommée, les autres sont à un
          appui — ou à un glissement. La rangée défile si le bloc en compte
          beaucoup, plutôt que de se comprimer jusqu'à l'illisible. */}
      {seances.length > 1 && (
        <div
          role="tablist"
          aria-label="Séances du bloc"
          className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
        >
          {seances.map((s, i) => {
            const actif = s.id === courante?.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={actif}
                onClick={() => setIndexSeance(i)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  actif ? "bg-encre text-papier border-encre" : "bg-carte text-encre-2 border-filet"
                }`}
              >
                {s.lettre}
              </button>
            );
          })}
        </div>
      )}

      {courante && (
        <section
          key={courante.id}
          className="space-y-2"
          /* Le glissement double les onglets sans les remplacer : un geste
             n'est pas découvrable, un onglet si. `directionDuGeste` refuse
             tout ce qui ressemble à un défilement vertical. */
          onTouchStart={(e) => {
            const t = e.touches[0];
            depart.current = t ? { x: t.clientX, y: t.clientY } : null;
          }}
          onTouchEnd={(e) => {
            const t = e.changedTouches[0];
            if (!t || !depart.current) return;
            const direction = directionDuGeste(
              t.clientX - depart.current.x,
              t.clientY - depart.current.y,
            );
            depart.current = null;
            if (direction) {
              setIndexSeance((i) => indexApresGeste(indexValide(i, seances.length), direction, seances.length));
            }
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-encre font-semibold min-w-0">
              <span className="text-encre-3 mr-2">{courante.lettre}</span>
              {courante.nom}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setAjoutPour(courante)}>
              <Plus className="w-4 h-4 mr-1" />
              Exercice
            </Button>
          </div>

          {/* Le repère de position : sans lui, on ne sait pas combien de
              séances existent ni où l'on se trouve dans le bloc. */}
          {seances.length > 1 && (
            <p className="text-encre-3 text-xs">
              Séance <span className="chiffres">{indexValide(indexSeance, seances.length) + 1}</span> sur{" "}
              <span className="chiffres">{seances.length}</span> — glisse pour changer.
            </p>
          )}

          {courante.exercices.length === 0 ? (
            <p className="text-encre-3 text-sm bg-carte border border-filet rounded-lg p-3">
              Séance vide — elle ne proposera aucun exercice.
            </p>
          ) : (
            <div className="space-y-2">
              {courante.exercices.map((e) => (
                <div key={e.ligneId} className="bg-carte border border-filet rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-encre-3 text-xs font-mono mt-1 w-4 shrink-0">{e.ordre}</span>
                    {e.exerciceSlug && (
                      <IllustrationExercice
                        slug={e.exerciceSlug}
                        nom={e.exerciceNom}
                        className="w-9 h-9 shrink-0 text-encre-2"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-encre text-sm font-medium">{e.exerciceNom}</p>
                      <p className="text-encre-3 text-xs">{e.machineNom}</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                          {e.seriesCibles} × {e.fourchetteRepsMin}-{e.fourchetteRepsMax}
                        </Badge>
                        {/* Toujours affiché, avec ou sans cible : une ligne
                            muette se lisait comme un oubli, pas comme une
                            décision. Le badge est le point d'entrée de
                            l'édition — il n'y en avait aucun. */}
                        <button type="button" onClick={() => setEditionEffort(e)}
                          aria-label={`Modifier l'effort cible de ${e.exerciceNom}`}>
                          <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                            {libelleCibleEffort(e.rpeCible)}
                          </Badge>
                        </button>
                        {e.tempo && (
                          <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                            tempo {e.tempo}
                          </Badge>
                        )}
                        {e.reposSecondes !== null && (
                          <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                            {e.reposSecondes}s
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Retirer ${e.exerciceNom}`}
                      onClick={() => retirer(e)}>
                      <Trash2 className="w-4 h-4 text-encre-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {seances.length === 0 && (
        <p className="text-encre-3 text-sm bg-carte border border-filet rounded-lg p-3">
          Ce bloc n&apos;a aucune séance. Ajoute la première ci-dessous.
        </p>
      )}

      <Button variant="outline" className="w-full bg-carte border-filet"
        onClick={() => setCreationSeance(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Ajouter une séance
      </Button>

      <Drawer open={creationSeance} onOpenChange={setCreationSeance}>
        <DrawerContent className="bg-papier border-filet text-encre">
          <DrawerHeader><DrawerTitle className="text-encre">Nouvelle séance</DrawerTitle></DrawerHeader>
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
        <DrawerContent className="bg-papier border-filet text-encre max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="text-encre">Ajouter à « {ajoutPour?.nom} »</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <Label>Machine</Label>
              {instanceId ? (
                <div className="flex items-center justify-between gap-2 bg-carte border border-filet rounded-lg p-3">
                  <span className="text-sm text-encre min-w-0 truncate">
                    {machines.find((m) => m.id === instanceId)?.exerciceNom}
                    <span className="text-encre-3"> · {machines.find((m) => m.id === instanceId)?.machineNom}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setInstanceId("")}>Changer</Button>
                </div>
              ) : (
                <>
                  <Input value={recherche} onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Chercher une machine…" />
                  <div className="max-h-56 overflow-y-auto space-y-1 border border-filet rounded-lg p-1">
                    {machinesFiltrees.slice(0, 40).map((m) => (
                      <button key={m.id} type="button" onClick={() => setInstanceId(m.id)}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-papier-2 text-left">
                        {m.exerciceSlug && (
                          <IllustrationExercice slug={m.exerciceSlug} nom={m.exerciceNom}
                            className="w-8 h-8 shrink-0 text-encre-3" />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-encre text-sm truncate">{m.exerciceNom}</span>
                          <span className="block text-encre-3 text-xs truncate">{m.machineNom} · {m.salleNom}</span>
                        </span>
                      </button>
                    ))}
                    {machinesFiltrees.length === 0 && (
                      <p className="text-encre-3 text-sm p-3">
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

            {/* L'effort se choisit en réserve — personne ne sait dire « 7,5 »,
                tout le monde sait dire « 2 reps de la fin ». Le RPE reste ce
                qui part en base. */}
            <div className="space-y-2">
              <Label>Effort cible</Label>
              <Select value={choixEffort} onValueChange={(v) => setChoixEffort(v ?? NON_PRESCRIT)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHOIX_CIBLE_EFFORT.map((c) => (
                    <SelectItem key={c.valeur} value={c.valeur}>{c.libelle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

      {/* Corriger une cible imposait jusqu'ici de retirer l'exercice et de le
          recréer — au prix de son rang et du lien de l'historique vers sa
          ligne d'origine. */}
      <Drawer open={editionEffort !== null} onOpenChange={(o) => !o && setEditionEffort(null)}>
        <DrawerContent className="bg-papier border-filet text-encre">
          <DrawerHeader>
            <DrawerTitle className="text-encre">
              Effort cible — {editionEffort?.exerciceNom}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            {CHOIX_CIBLE_EFFORT.map((c) => {
              const actuel = editionEffort ? choixDepuisCible(editionEffort.rpeCible) : NON_PRESCRIT;
              return (
                <Button key={c.valeur} variant="outline" disabled={envoi}
                  aria-pressed={c.valeur === actuel}
                  className={`w-full h-12 justify-start bg-carte border-filet ${
                    c.valeur === actuel ? "text-encre font-semibold" : "text-encre-2"
                  }`}
                  onClick={() => editionEffort && changerEffort(editionEffort, c.valeur)}>
                  {c.libelle}
                </Button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
