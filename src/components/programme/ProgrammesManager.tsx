"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Plus, Search, Trash2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { CreationBlocForm } from "./CreationBlocForm";

export interface ProgrammeResume {
  id: string;
  nom: string;
  actif: boolean;
  typeCycle: string;
}

export function ProgrammesManager({
  programmes,
  selectedId,
  selectedSessionCount = 0,
  selectedExerciseCount = 0,
}: {
  programmes: ProgrammeResume[];
  selectedId: string | null;
  selectedSessionCount?: number;
  selectedExerciseCount?: number;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => programmes.find((programme) => programme.id === selectedId) ?? null,
    [programmes, selectedId],
  );
  const filteredProgrammes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr-FR");
    if (!normalized) return programmes;
    return programmes.filter((programme) => programme.nom.toLocaleLowerCase("fr-FR").includes(normalized));
  }, [programmes, query]);
  const buildSteps = selected ? [
    { label: "Objectif", complete: selected.typeCycle !== "non_defini" },
    { label: "Séances", complete: selectedSessionCount > 0 },
    { label: "Exercices & réglages", complete: selectedExerciseCount > 0 },
    { label: "Activation", complete: selected.actif },
  ] : [];
  const currentStep = buildSteps.findIndex((step) => !step.complete);

  async function activate(programmeId: string) {
    setPending(`activate:${programmeId}`);
    try {
      const response = await fetch(`/api/programme/blocs/${programmeId}`, { method: "PATCH" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Activation impossible");
      toast.success("Programme actif mis à jour");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Activation impossible");
    } finally {
      setPending(null);
    }
  }

  async function removeProgram(programme: ProgrammeResume) {
    const suite = programme.actif
      ? " Un autre programme prendra automatiquement le relais s'il en reste un."
      : "";
    if (!confirm(`Supprimer « ${programme.nom} » ? Ses séances passées resteront dans ton historique.${suite}`)) {
      return;
    }

    setPending(`delete:${programme.id}`);
    try {
      const response = await fetch(`/api/programme/blocs/${programme.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Suppression impossible");
      toast.success("Programme supprimé");
      router.push("/programme");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-filet bg-carte p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-encre-3">Mes programmes</p>
          <div className="flex items-center gap-1">
            {programmes.length > 5 && (
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => setSearchOpen((value) => !value)} aria-label="Rechercher un programme">
                <Search className="size-4" aria-hidden />
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setCreating((value) => !value)}>
              <Plus className="size-4" aria-hidden /> Nouveau
            </Button>
          </div>
        </div>

        {searchOpen && programmes.length > 5 && (
          <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-filet bg-papier px-3">
            <Search className="size-4 shrink-0 text-encre-3" aria-hidden />
            <span className="sr-only">Rechercher un programme</span>
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du programme" autoFocus />
          </label>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {filteredProgrammes.map((programme) => {
            const selectedProgramme = programme.id === selectedId;
            return (
              <Link
                key={programme.id}
                href={`/programme?bloc=${programme.id}`}
                aria-current={selectedProgramme ? "page" : undefined}
                className={`min-w-[12rem] rounded-2xl border p-3 transition-colors ${selectedProgramme ? "border-encre bg-papier-2" : "border-filet bg-carte"}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-medium text-encre">{programme.nom}</span>
                  <span className="flex shrink-0 gap-1">
                    {programme.actif && (
                      <span className="rounded-full bg-encre px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-papier">
                        Actif
                      </span>
                    )}
                    {selectedProgramme && (
                      <span className="rounded-full border border-encre/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-encre-2">
                        Consulté
                      </span>
                    )}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-encre-3">
                  {programme.actif ? "Pilote la rotation" : "Programme enregistré"}
                </span>
              </Link>
            );
          })}
          {programmes.length === 0 && <p className="text-sm text-encre-3">Aucun programme enregistré.</p>}
          {programmes.length > 0 && filteredProgrammes.length === 0 && <p className="py-3 text-sm text-encre-3">Aucun programme ne correspond.</p>}
        </div>

        {selected && (
          <div className="mt-4 border-t border-filet pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-encre-3">Construction</p>
                <p className="mt-1 text-sm text-encre-2">Tu vois ce qui est prêt et ce qui reste à préciser.</p>
              </div>
              <span className="text-xs tabular-nums text-encre-3">{buildSteps.filter((step) => step.complete).length}/4</span>
            </div>
            <ol className="grid grid-cols-4 gap-1" aria-label="Étapes de construction du programme">
              {buildSteps.map((step, index) => {
                const active = index === currentStep;
                return (
                  <li key={step.label} className={`min-w-0 rounded-xl px-2 py-2 ${step.complete ? "bg-encre text-papier" : active ? "bg-brand-soft text-encre" : "bg-papier-2 text-encre-3"}`} aria-current={active ? "step" : undefined}>
                    <span className="mb-1 flex h-4 items-center text-[10px] font-semibold tabular-nums">{step.complete ? <CheckCircle2 className="size-3.5" aria-hidden /> : String(index + 1).padStart(2, "0")}</span>
                    <span className="block text-[10px] font-medium leading-tight">{step.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {selected && (
          <div className="mt-3 flex items-center justify-end gap-2">
            {!selected.actif && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => void activate(selected.id)}
                disabled={pending !== null}
              >
                {pending === `activate:${selected.id}` ? "Activation…" : "Rendre actif"}
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-perte"
              aria-label={`Supprimer le programme ${selected.nom}`}
              onClick={() => void removeProgram(selected)}
              disabled={pending !== null}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {creating && (
        <CreationBlocForm actifParDefaut={programmes.length === 0} onCreated={() => setCreating(false)} />
      )}
    </div>
  );
}
