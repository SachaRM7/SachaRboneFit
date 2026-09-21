"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
  Dumbbell,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import {
  newBlankDraft,
  normalizeDraftExercises,
  saveSessionDraftSchema,
  type SessionDraft,
  type SessionDraftExercise,
  type SessionScope,
} from "@/lib/session-composer/draft";

export interface ComposerGym {
  id: string;
  name: string;
}

export interface ComposerMachine {
  id: string;
  gymId: string;
  name: string;
  machineName: string;
  pillar: string;
  slug: string | null;
}

export interface ComposerSource {
  id: string;
  name: string;
  letter: string;
  exercises: Array<Omit<SessionDraftExercise, "clientId" | "order">>;
}

function initialDraft(defaultGymId: string, source: ComposerSource | null): SessionDraft {
  if (!source) return newBlankDraft(defaultGymId) as SessionDraft;
  return {
    id: crypto.randomUUID(),
    origin: "duplicate",
    sourceTemplateId: source.id,
    name: `${source.name} — alternative`,
    letter: "ALT",
    gymId: defaultGymId,
    durationMinutes: 45,
    exercises: source.exercises.map((exercise, order) => ({
      ...exercise,
      clientId: crypto.randomUUID(),
      order,
    })),
  };
}

function updateExercise(
  draft: SessionDraft,
  clientId: string,
  update: Partial<SessionDraftExercise>,
): SessionDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.clientId === clientId ? { ...exercise, ...update } : exercise,
    ),
  };
}

/**
 * Le kg visé d'un exercice du brouillon.
 *
 * `null` veut dire « aucun poids décidé » et aucun zéro n'est fabriqué : un
 * champ vide n'est pas une charge de 0 kg. La valeur traverse le schéma
 * partagé, qui la déclare facultative — un brouillon sans charge reste valide.
 */
function chargeCibleDe(exercise: SessionDraftExercise): number | null {
  const charge = exercise.chargeCible;
  return typeof charge === "number" && Number.isFinite(charge) ? charge : null;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count > 1 ? pluralForm : singular;
}

export function SessionComposer({
  defaultGymId,
  gyms,
  machines,
  source,
  nextTemplate,
  hasActiveProgram,
}: {
  defaultGymId: string;
  gyms: ComposerGym[];
  machines: ComposerMachine[];
  source: ComposerSource | null;
  nextTemplate: { id: string; name: string } | null;
  hasActiveProgram: boolean;
}) {
  const router = useRouter();
  const storageKey = `sportperso-session-draft:${source?.id ?? "blank"}`;
  const [draft, setDraft] = useState<SessionDraft>(() => initialDraft(defaultGymId, source));
  const [hydrated, setHydrated] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<SessionScope["type"] | null>(null);

  /* Le stockage navigateur est une source externe et ne peut être lu pendant
     le rendu serveur. Sa valeur est donc restaurée après hydratation. */
  /* eslint-disable react-hooks/set-state-in-effect -- synchronisation initiale avec localStorage */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        const result = saveSessionDraftSchema.shape.draft.safeParse(parsed);
        if (result.success) setDraft(result.data);
      }
    } catch {
      // Le brouillon mémoire reste utilisable si le stockage local est bloqué.
    }
    setHydrated(true);
  }, [storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Une navigation conserve toujours l'état courant ; seule la reprise après
      // fermeture du navigateur devient indisponible.
    }
  }, [draft, hydrated, storageKey]);

  const selected = useMemo(
    () => new Set(draft.exercises.map((exercise) => exercise.exerciseInstanceId)),
    [draft.exercises],
  );
  const available = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return machines
      .filter((machine) => machine.gymId === draft.gymId && !selected.has(machine.id))
      .filter((machine) => !normalized || `${machine.name} ${machine.machineName} ${machine.pillar}`.toLocaleLowerCase("fr").includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [draft.gymId, machines, query, selected]);

  function addMachine(machine: ComposerMachine) {
    setDraft((current) => ({
      ...current,
      exercises: [...current.exercises, {
        clientId: crypto.randomUUID(),
        exerciseInstanceId: machine.id,
        order: current.exercises.length,
        sets: 3,
        repMin: 8,
        repMax: 12,
        targetRir: 3,
        tempo: null,
        restSeconds: 120,
      }],
    }));
    setPickerOpen(false);
    setQuery("");
  }

  function move(clientId: string, delta: -1 | 1) {
    setDraft((current) => {
      const exercises = normalizeDraftExercises(current.exercises);
      const index = exercises.findIndex((exercise) => exercise.clientId === clientId);
      const destination = index + delta;
      if (index < 0 || destination < 0 || destination >= exercises.length) return current;
      const moving = exercises[index]!;
      const displaced = exercises[destination]!;
      exercises[index] = displaced;
      exercises[destination] = moving;
      return { ...current, exercises: exercises.map((exercise, order) => ({ ...exercise, order })) };
    });
  }

  function remove(clientId: string) {
    setDraft((current) => ({
      ...current,
      exercises: normalizeDraftExercises(current.exercises.filter((exercise) => exercise.clientId !== clientId)),
    }));
  }

  /** La charge visée, en kg — facultative, et vide par défaut. */
  function definirCharge(clientId: string, chargeCible: number | null) {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.clientId === clientId ? { ...exercise, chargeCible } : exercise,
      ),
    }));
  }

  function openScope() {
    const parsed = saveSessionDraftSchema.shape.draft.safeParse(draft);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Complète la séance avant de continuer.";
      toast.error(first);
      return;
    }
    setScopeOpen(true);
  }

  async function save(scope: SessionScope) {
    setSaving(scope.type);
    try {
      const response = await fetch("/api/session-composer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, scope }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Enregistrement impossible");
      window.localStorage.removeItem(storageKey);
      toast.success(scope.type === "program" ? "Séance ajoutée au programme" : "Séance prête");
      router.push(payload.startUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
      setSaving(null);
    }
  }

  const totalSets = draft.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);

  return (
    <main className="min-h-dvh bg-papier px-4 pb-28 text-encre">
      <header className="flex items-center gap-3 py-4">
        <Link href="/sessions/new" aria-label="Retour aux séances" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-carte shadow-sm">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-encre-3">{source ? "À partir d'une séance" : "Page blanche"}</p>
          <h1 className="truncate font-heading text-xl font-semibold">Composer une séance</h1>
        </div>
      </header>

      {gyms.length === 0 ? (
        <section className="mt-6 rounded-[1.75rem] border border-filet bg-carte p-5">
          <Dumbbell className="mb-4 text-encre-3" aria-hidden />
          <h2 className="font-heading text-xl font-semibold">Décris d&apos;abord un lieu d&apos;entraînement.</h2>
          <p className="mt-2 text-sm text-encre-3">Le composeur ne propose que le matériel réellement disponible.</p>
          <Link href="/gyms/new" className="mt-5 flex h-12 items-center justify-center gap-2 rounded-full bg-encre px-5 font-medium text-papier">
            Ajouter un lieu <ArrowRight aria-hidden />
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-3 rounded-[1.75rem] border border-filet bg-carte p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-2">
                <Label htmlFor="session-name">Nom de la séance</Label>
                <Input id="session-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Durée visée</Label>
                <div className="relative">
                  <Input id="duration" type="number" inputMode="numeric" min={10} max={240} value={draft.durationMinutes ?? ""} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value ? Number(event.target.value) : null }))} className="pr-11" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-encre-3">min</span>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="gym">Lieu</Label>
              <select
                id="gym"
                value={draft.gymId}
                onChange={(event) => setDraft((current) => ({ ...current, gymId: event.target.value, exercises: [] }))}
                className="h-11 w-full rounded-xl border border-input bg-transparent px-3.5 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 md:text-sm"
              >
                <option value="" disabled>Choisir un lieu</option>
                {gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
              </select>
              {draft.exercises.length > 0 && <p className="text-xs text-encre-3">Changer de lieu retire les exercices du brouillon.</p>}
            </div>
          </section>

          <section className="mt-7" aria-labelledby="draft-exercises">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-encre-3">Composition</p>
                <h2 id="draft-exercises" className="mt-1 font-heading text-xl font-semibold">{draft.exercises.length} {plural(draft.exercises.length, "exercice")}</h2>
              </div>
              {totalSets > 0 && <p className="text-sm text-encre-3">{totalSets} {plural(totalSets, "série")}</p>}
            </div>

            <div className="space-y-2.5">
              {draft.exercises.map((exercise, index) => {
                const machine = machines.find((item) => item.id === exercise.exerciseInstanceId);
                const chargeKg = chargeCibleDe(exercise);
                return (
                  <details key={exercise.clientId} className="group rounded-2xl border border-filet bg-carte open:shadow-sm">
                    <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-papier-2 text-sm font-semibold chiffres">{index + 1}</span>
                      {machine?.slug && <IllustrationExercice slug={machine.slug} nom={machine.name} className="size-10 shrink-0 text-encre-2" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{machine?.name ?? "Exercice indisponible"}</span>
                        <span className="mt-0.5 block truncate text-xs text-encre-3">{exercise.sets} × {exercise.repMin}–{exercise.repMax} · {exercise.targetRir === null ? "réserve libre" : `${exercise.targetRir} en réserve`} · {exercise.restSeconds}s{chargeKg !== null ? ` · ${chargeKg} kg` : ""}</span>
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-encre-3 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>

                    <div className="border-t border-filet-doux px-3.5 pb-4 pt-3">
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(exercise.clientId, -1)} disabled={index === 0} aria-label="Monter l'exercice"><ArrowUp aria-hidden /></Button>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(exercise.clientId, 1)} disabled={index === draft.exercises.length - 1} aria-label="Descendre l'exercice"><ArrowDown aria-hidden /></Button>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="text-perte" onClick={() => remove(exercise.clientId)}><Trash2 aria-hidden /> Retirer</Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        <NumberField label="Séries" value={exercise.sets} min={1} max={12} onChange={(sets) => setDraft((current) => updateExercise(current, exercise.clientId, { sets }))} />
                        <NumberField label="Reps min" value={exercise.repMin} min={1} max={50} onChange={(repMin) => setDraft((current) => updateExercise(current, exercise.clientId, { repMin }))} />
                        <NumberField label="Reps max" value={exercise.repMax} min={1} max={50} onChange={(repMax) => setDraft((current) => updateExercise(current, exercise.clientId, { repMax }))} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <label className="space-y-1.5 text-xs font-medium text-encre-2">Réserve cible
                          <select value={exercise.targetRir ?? "none"} onChange={(event) => setDraft((current) => updateExercise(current, exercise.clientId, { targetRir: event.target.value === "none" ? null : Number(event.target.value) }))} className="h-10 w-full rounded-xl border border-input bg-transparent px-2 text-sm">
                            <option value="none">Libre</option>
                            {[5, 4, 3, 2, 1, 0].map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1.5 text-xs font-medium text-encre-2">Tempo
                          <Input value={exercise.tempo ?? ""} onChange={(event) => setDraft((current) => updateExercise(current, exercise.clientId, { tempo: event.target.value || null }))} placeholder="3-0-1-0" className="h-10 px-2.5" />
                        </label>
                        <NumberField label="Repos (s)" value={exercise.restSeconds} min={0} max={900} onChange={(restSeconds) => setDraft((current) => updateExercise(current, exercise.clientId, { restSeconds }))} />
                        {/* Facultatif, et vide par défaut : la charge n'est pas
                            déduite d'un profil ni d'un coefficient — seule
                            une personne sait ce qu'elle compte mettre sur la
                            machine, et elle peut aussi ne rien décider. */}
                        <label className="space-y-1.5 text-xs font-medium text-encre-2">Charge (kg) · Facultatif
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={chargeKg === null ? "" : String(chargeKg)}
                            placeholder="—"
                            className="h-10 px-2.5"
                            onChange={(event) => {
                              const brut = event.target.value.trim().replace(",", ".");
                              const nombre = brut === "" ? null : Number(brut);
                              definirCharge(exercise.clientId, nombre !== null && Number.isFinite(nombre) ? nombre : null);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            <button type="button" onClick={() => setPickerOpen(true)} disabled={!draft.gymId} className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-encre-3/40 bg-carte text-sm font-medium text-encre-2 disabled:opacity-50">
              <Plus aria-hidden /> Ajouter un exercice
            </button>
          </section>

          <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mt-7 rounded-[1.5rem] border border-filet bg-carte/95 p-2.5 shadow-[0_12px_35px_rgba(20,30,24,.18)] backdrop-blur">
            <Button type="button" className="h-12 w-full rounded-full text-base" onClick={openScope} disabled={draft.exercises.length === 0}>
              Choisir comment l&apos;utiliser <ArrowRight aria-hidden />
            </Button>
          </div>
        </>
      )}

      <Drawer open={pickerOpen} onOpenChange={setPickerOpen}>
        <DrawerContent className="max-h-[88dvh] rounded-t-[2rem] border-filet bg-papier pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading text-xl text-encre">Ajouter un exercice</DrawerTitle>
            <DrawerDescription>Uniquement le matériel du lieu choisi.</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-encre-3" aria-hidden />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un exercice" className="pl-9" autoFocus />
            </div>
            <div className="space-y-2">
              {available.map((machine) => (
                <button key={machine.id} type="button" onClick={() => addMachine(machine)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-filet bg-carte p-3 text-left">
                  {machine.slug ? <IllustrationExercice slug={machine.slug} nom={machine.name} className="size-10 shrink-0 text-encre-2" /> : <Dumbbell className="size-6 shrink-0 text-encre-3" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{machine.name}</span>
                    <span className="block truncate text-xs text-encre-3">{machine.machineName}{machine.pillar ? ` · ${machine.pillar}` : ""}</span>
                  </span>
                  <Plus className="size-5 text-encre-3" aria-hidden />
                </button>
              ))}
              {available.length === 0 && <p className="rounded-2xl bg-carte p-5 text-sm text-encre-3">Aucun autre exercice ne correspond.</p>}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={scopeOpen} onOpenChange={setScopeOpen}>
        <DrawerContent className="max-h-[90dvh] rounded-t-[2rem] border-filet bg-papier pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading text-xl text-encre">Que doit devenir cette séance ?</DrawerTitle>
            <DrawerDescription>Tu choisis sa portée avant tout enregistrement.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2.5 overflow-y-auto px-4 pb-6">
            <ScopeButton icon={<Clock3 />} title="Faire aujourd'hui" description="Démarre cette séance sans changer ta rotation." pending={saving === "today"} disabled={saving !== null} onClick={() => void save({ type: "today" })} />
            <ScopeButton icon={<ArrowRight />} title="Remplacer la séance prévue" description={nextTemplate ? `Prend la place de « ${nextTemplate.name} » pour ce passage seulement.` : "Aucune séance prévue à remplacer."} pending={saving === "replace_next"} disabled={saving !== null || !nextTemplate} onClick={() => nextTemplate && void save({ type: "replace_next", rotationTemplateId: nextTemplate.id })} />
            <ScopeButton icon={<Check />} title="Ajouter à mon programme" description="Devient une nouvelle séance permanente dans ta rotation." pending={saving === "program"} disabled={saving !== null || !hasActiveProgram} onClick={() => void save({ type: "program" })} />
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1.5 text-xs font-medium text-encre-2">{label}
      <Input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 px-2.5" />
    </label>
  );
}

function ScopeButton({ icon, title, description, pending, disabled, onClick }: { icon: React.ReactNode; title: string; description: string; pending: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-filet bg-carte p-4 text-left disabled:opacity-45">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-papier-2 text-encre [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-encre">{pending ? "Enregistrement…" : title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-encre-3">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-encre-3" aria-hidden />
    </button>
  );
}
