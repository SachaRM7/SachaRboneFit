"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import {
  CHOIX_CIBLE_EFFORT,
  NON_PRESCRIT,
  cibleDepuisChoix,
  choixDepuisCible,
  libelleCibleEffort,
} from "@/components/programme/cible-effort";
import type { SeanceProgrammeDetail } from "@/services/seance-template";

interface MachineOption {
  id: string;
  exerciseId: string;
  nom: string;
  slug: string | null;
  machineNom: string;
  salleNom: string;
}

interface ConfigurationDraft {
  series: string;
  repsMin: string;
  repsMax: string;
  effort: string;
  tempo: string;
  repos: string;
  charge: string;
}

interface DraftExercise {
  clientId: string;
  lineId: string | null;
  exerciseInstanceId: string;
  exerciseId: string;
  nom: string;
  slug: string | null;
  machineNom: string;
  salleNom: string;
  configuration: ConfigurationDraft;
}

function configurationDepuis(exercice: SeanceProgrammeDetail["exercices"][number]): ConfigurationDraft {
  return {
    series: String(exercice.seriesCibles),
    repsMin: String(exercice.fourchetteRepsMin),
    repsMax: String(exercice.fourchetteRepsMax),
    effort: choixDepuisCible(exercice.rpeCible),
    tempo: exercice.tempo ?? "",
    repos: exercice.reposSecondes === null ? "" : String(exercice.reposSecondes),
    charge: exercice.chargeCible === null ? "" : String(exercice.chargeCible),
  };
}

function brouillonDepuis(detail: SeanceProgrammeDetail): DraftExercise[] {
  return detail.exercices.map((exercice) => ({
    clientId: exercice.ligneId,
    lineId: exercice.ligneId,
    exerciseInstanceId: exercice.exerciseInstanceId,
    exerciseId: exercice.exerciseId,
    nom: exercice.nom,
    slug: exercice.slug,
    machineNom: exercice.machineNom,
    salleNom: exercice.salleNom,
    configuration: configurationDepuis(exercice),
  }));
}

function nombreOuAbsent(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function configurationPourApi(configuration: ConfigurationDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    rpeCible: cibleDepuisChoix(configuration.effort),
    tempo: configuration.tempo.trim() || null,
    reposSecondes: nombreOuAbsent(configuration.repos) ?? null,
    chargeCible: nombreOuAbsent(configuration.charge) ?? null,
  };
  const series = nombreOuAbsent(configuration.series);
  const repsMin = nombreOuAbsent(configuration.repsMin);
  const repsMax = nombreOuAbsent(configuration.repsMax);
  if (series !== undefined) payload.seriesCibles = series;
  if (repsMin !== undefined) payload.fourchetteRepsMin = repsMin;
  if (repsMax !== undefined) payload.fourchetteRepsMax = repsMax;
  return payload;
}

function configurationVide(): ConfigurationDraft {
  return {
    series: "",
    repsMin: "",
    repsMax: "",
    effort: NON_PRESCRIT,
    tempo: "",
    repos: "",
    charge: "",
  };
}

export function SessionEditor({
  detail,
  machines,
}: {
  detail: SeanceProgrammeDetail;
  machines: MachineOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => brouillonDepuis(detail));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newMachineId, setNewMachineId] = useState("");
  const [newConfiguration, setNewConfiguration] = useState(configurationVide);
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const editing = draft.find((exercise) => exercise.clientId === editingId) ?? null;
  const selectedMachine = machines.find((machine) => machine.id === newMachineId) ?? null;

  function updateConfiguration(clientId: string, configuration: ConfigurationDraft) {
    setDraft((current) => current.map((exercise) => (
      exercise.clientId === clientId ? { ...exercise, configuration } : exercise
    )));
  }

  function move(clientId: string, delta: -1 | 1) {
    setDraft((current) => {
      const index = current.findIndex((exercise) => exercise.clientId === clientId);
      const destination = index + delta;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      const moving = next[index]!;
      next[index] = next[destination]!;
      next[destination] = moving;
      return next;
    });
  }

  function reorderTo(clientId: string, destinationId: string) {
    setDraft((current) => {
      const sourceIndex = current.findIndex((exercise) => exercise.clientId === clientId);
      const destinationIndex = current.findIndex((exercise) => exercise.clientId === destinationId);
      if (sourceIndex < 0 || destinationIndex < 0 || sourceIndex === destinationIndex) return current;

      const next = [...current];
      const [moving] = next.splice(sourceIndex, 1);
      if (!moving) return current;
      next.splice(destinationIndex, 0, moving);
      return next;
    });
  }

  function startDragging(event: React.PointerEvent<HTMLButtonElement>, clientId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(clientId);
    setDragOverId(clientId);
  }

  function dragOver(event: React.PointerEvent<HTMLButtonElement>) {
    if (!draggingId || event.buttons === 0) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-editor-exercise-id]");
    const destinationId = target?.dataset.editorExerciseId;
    if (!destinationId || destinationId === draggingId) return;
    reorderTo(draggingId, destinationId);
    setDragOverId(destinationId);
  }

  function stopDragging(event?: React.PointerEvent<HTMLButtonElement>) {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingId(null);
    setDragOverId(null);
  }

  function keyboardMove(event: React.KeyboardEvent<HTMLButtonElement>, clientId: string) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    move(clientId, event.key === "ArrowUp" ? -1 : 1);
  }

  function remove(clientId: string) {
    const exercise = draft.find((item) => item.clientId === clientId);
    if (!exercise || !window.confirm(`Retirer « ${exercise.nom} » de cette séance ?`)) return;
    setDraft((current) => current.filter((item) => item.clientId !== clientId));
    if (editingId === clientId) setEditingId(null);
  }

  function addExercise() {
    if (!selectedMachine) {
      toast.error("Choisis un exercice");
      return;
    }
    setDraft((current) => [...current, {
      clientId: crypto.randomUUID(),
      lineId: null,
      exerciseInstanceId: selectedMachine.id,
      exerciseId: selectedMachine.exerciseId,
      nom: selectedMachine.nom,
      slug: selectedMachine.slug,
      machineNom: selectedMachine.machineNom,
      salleNom: selectedMachine.salleNom,
      configuration: newConfiguration,
    }]);
    setAdding(false);
    setNewMachineId("");
    setNewConfiguration(configurationVide());
  }

  async function sauvegarder() {
    setSaving(true);
    try {
      const deleted = detail.exercices.filter((exercise) => !draft.some((item) => item.lineId === exercise.ligneId));
      for (const exercise of deleted) {
        await request(`/api/programme/exercices/${exercise.ligneId}`, { method: "DELETE" });
      }

      const persistedIds: string[] = [];
      for (const [index, exercise] of draft.entries()) {
        const configuration = configurationPourApi(exercise.configuration);
        if (exercise.lineId) {
          await request(`/api/programme/exercices/${exercise.lineId}`, {
            method: "PATCH",
            body: JSON.stringify(configuration),
          });
          persistedIds[index] = exercise.lineId;
        } else {
          const created = await request("/api/programme/seances", {
            method: "POST",
            body: JSON.stringify({
              seanceTemplateId: detail.id,
              exerciseInstanceId: exercise.exerciseInstanceId,
              ...configuration,
            }),
          });
          if (!created || typeof created !== "object" || !("id" in created) || typeof created.id !== "string") {
            throw new Error("L’exercice ajouté n’a pas été confirmé par le serveur");
          }
          persistedIds[index] = created.id;
        }
      }

      // Les créations sont ajoutées en fin de séance par l'API. Une seconde
      // passe applique l'ordre du brouillon aux lignes existantes comme aux
      // nouvelles, sans dupliquer la logique de réordonnancement métier.
      for (const [index, lineId] of persistedIds.entries()) {
        await request(`/api/programme/exercices/${lineId}`, {
          method: "PATCH",
          body: JSON.stringify({ ordre: index + 1 }),
        });
      }

      toast.success("Séance enregistrée");
      router.push(`/sessions/new/${detail.id}/details`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer la séance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh bg-papier px-4 pb-[calc(var(--barre-nav)+6rem)] pt-4 text-encre">
      <header className="flex items-center gap-3 py-2">
        <Link href={`/sessions/new/${detail.id}/details`} prefetch={false} aria-label="Retour à la séance" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-carte shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-encre-2">{detail.programmeNom}</p>
          <h1 className="truncate font-heading text-xl font-semibold">Modifier {detail.nom}</h1>
        </div>
        <button type="button" onClick={() => void sauvegarder()} disabled={saving} className="text-sm font-semibold text-primary disabled:opacity-50">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </header>

      <section className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre-3">{detail.programmeNom} · {detail.lettre}</p>
          <h2 className="mt-1 font-heading text-2xl font-semibold">{detail.nom}</h2>
          <p className="mt-1 text-sm text-encre-3">Ajoute, retire ou ouvre un exercice pour modifier ses réglages.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-filet bg-carte px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre">
          <Plus className="size-4" aria-hidden /> Exercice
        </button>
      </section>

      <section className="mt-5 space-y-2.5" aria-label="Exercices à modifier">
        {draft.length === 0 && (
          <div className="rounded-[1.5rem] border border-dashed border-encre-3/40 bg-carte p-5 text-sm text-encre-3">
            Aucun exercice dans cette séance. Ajoute le premier avec le bouton ci-dessus.
          </div>
        )}
        {draft.map((exercise, index) => (
          <div
            key={exercise.clientId}
            data-editor-exercise-id={exercise.clientId}
            className={`rounded-[1.35rem] border bg-carte p-3.5 transition-[border-color,box-shadow,opacity] ${
              dragOverId === exercise.clientId && draggingId !== exercise.clientId
                ? "border-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
                : "border-filet"
            } ${draggingId === exercise.clientId ? "opacity-70 shadow-lg" : ""}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 text-sm text-encre-3 chiffres">{index + 1}</span>
              {exercise.slug ? <IllustrationExercice slug={exercise.slug} nom={exercise.nom} className="size-11 shrink-0 text-encre-2" /> : <span className="size-11 shrink-0 rounded-xl bg-papier-2" />}
              <button type="button" onClick={() => setEditingId(exercise.clientId)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre focus-visible:ring-offset-2 focus-visible:ring-offset-carte">
                <span className="block font-medium">{exercise.nom}</span>
                <span className="block truncate text-xs text-encre-3">{exercise.machineNom}{exercise.salleNom ? ` · ${exercise.salleNom}` : ""}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <Prescription>{exercise.configuration.series || "—"} × {exercise.configuration.repsMin || "—"}-{exercise.configuration.repsMax || "—"}</Prescription>
                  <Prescription>{libelleCibleEffort(cibleDepuisChoix(exercise.configuration.effort))}</Prescription>
                  {exercise.configuration.tempo && <Prescription>tempo {exercise.configuration.tempo}</Prescription>}
                  {exercise.configuration.repos && <Prescription>{exercise.configuration.repos}s</Prescription>}
                  {exercise.configuration.charge && <Prescription>{exercise.configuration.charge} kg</Prescription>}
                </span>
              </button>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label={`Maintenir pour déplacer ${exercise.nom}`}
                  aria-pressed={draggingId === exercise.clientId}
                  title="Maintiens pour déplacer"
                  className="grid size-10 touch-none cursor-grab place-items-center rounded-xl text-encre-3 hover:bg-papier-2 active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  onPointerDown={(event) => startDragging(event, exercise.clientId)}
                  onPointerMove={dragOver}
                  onPointerUp={stopDragging}
                  onPointerCancel={stopDragging}
                  onKeyDown={(event) => keyboardMove(event, exercise.clientId)}
                >
                  <GripVertical className="size-5" aria-hidden />
                </button>
                <button type="button" onClick={() => remove(exercise.clientId)} aria-label={`Supprimer ${exercise.nom}`} className="grid size-9 place-items-center rounded-xl text-perte hover:bg-perte/10"><Trash2 className="size-4" aria-hidden /></button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <button type="button" onClick={() => setAdding(true)} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[1.35rem] border border-dashed border-encre-3/40 bg-carte text-sm font-medium text-encre-2">
        <Plus className="size-5" aria-hidden /> Ajouter un exercice
      </button>

      <Drawer open={editing !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DrawerContent className="max-h-[90dvh] rounded-t-[2rem] border-filet bg-papier pb-[env(safe-area-inset-bottom)] text-encre">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading text-xl">Configurer l&apos;exercice</DrawerTitle>
            <DrawerDescription>{editing?.nom}</DrawerDescription>
          </DrawerHeader>
          {editing && (
            <div className="space-y-4 overflow-y-auto px-4 pb-6">
              <ConfigurationFields value={editing.configuration} onChange={(value) => updateConfiguration(editing.clientId, value)} prefix="editing" />
              <Button type="button" className="h-12 w-full rounded-full" onClick={() => setEditingId(null)}>Appliquer</Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={adding} onOpenChange={setAdding}>
        <DrawerContent className="max-h-[92dvh] rounded-t-[2rem] border-filet bg-papier pb-[env(safe-area-inset-bottom)] text-encre">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading text-xl">Ajouter un exercice</DrawerTitle>
            <DrawerDescription>Les paramètres restent modifiables avant l&apos;enregistrement de la séance.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-6">
            <div className="space-y-2">
              <Label htmlFor="new-exercise">Exercice / machine</Label>
              <select id="new-exercise" value={newMachineId} onChange={(event) => setNewMachineId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/50">
                <option value="">Choisir un exercice</option>
                {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.nom} · {machine.machineNom}{machine.salleNom ? ` · ${machine.salleNom}` : ""}</option>)}
              </select>
            </div>
            <ConfigurationFields value={newConfiguration} onChange={setNewConfiguration} prefix="new" />
            <Button type="button" className="h-12 w-full rounded-full" onClick={addExercise} disabled={!selectedMachine}>Ajouter à la séance</Button>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

async function request(url: string, init: RequestInit & { body?: string } = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Modification impossible");
  return payload;
}

function ConfigurationFields({
  value,
  onChange,
  prefix,
}: {
  value: ConfigurationDraft;
  onChange: (value: ConfigurationDraft) => void;
  prefix: string;
}) {
  const field = (key: keyof ConfigurationDraft, label: string, inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"] = "numeric") => (
    <div className="space-y-1.5">
      <Label htmlFor={`${prefix}-${key}`} className="text-xs text-encre-2">{label}</Label>
      <Input id={`${prefix}-${key}`} value={value[key]} inputMode={inputMode} onChange={(event) => onChange({ ...value, [key]: event.target.value })} className="h-11 bg-carte" />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        {field("series", "Séries")}
        {field("repsMin", "Reps min")}
        {field("repsMax", "Reps max")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-effort`} className="text-xs text-encre-2">Effort cible</Label>
        <Select value={value.effort} onValueChange={(effort) => onChange({ ...value, effort: effort ?? NON_PRESCRIT })}>
          <SelectTrigger id={`${prefix}-effort`} className="h-11 bg-carte"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHOIX_CIBLE_EFFORT.map((choice) => <SelectItem key={choice.valeur} value={choice.valeur}>{choice.libelle}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {field("tempo", "Tempo", "text")}
        {field("repos", "Repos (s)")}
        {field("charge", "Charge (kg)", "decimal")}
      </div>
      <p className="text-xs leading-relaxed text-encre-3">Les champs laissés vides utilisent les repères habituels du programme.</p>
    </div>
  );
}

function Prescription({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-filet px-2 py-1 text-[0.68rem] text-encre-2">{children}</span>;
}
