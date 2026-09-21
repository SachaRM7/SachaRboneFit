"use client";

import Link from "next/link";
import { ArrowRight, Check, Copy, Dumbbell, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeclarerContexte, useCoach } from "@/components/coach/ContexteCoach";

interface TemplateSummary {
  id: string;
  /** Repère VISUEL déjà résolu depuis le programme parent actuel. */
  marker: string;
  name: string;
}

interface NextTemplateSummary extends TemplateSummary {
  programName: string;
  programType: string;
  position: number;
  total: number;
}

interface ProgrammeSummary {
  id: string;
  nom: string;
  actif: boolean;
}

export function SessionHub({
  blockName,
  programmes,
  selectedProgrammeId,
  next,
  defaultGymId,
  templates,
  current,
}: {
  /** Le nom du programme AFFICHÉ — celui dont les séances sont listées. */
  blockName: string | null;
  programmes: ProgrammeSummary[];
  selectedProgrammeId: string | null;
  /** La prochaine séance de la ROTATION, indépendante du programme affiché. */
  next: NextTemplateSummary | null;
  defaultGymId: string;
  templates: TemplateSummary[];
  current: { sessionId: string; templateId: string; gymId: string | null } | null;
}) {
  const { ouvrir } = useCoach();
  const currentUrl = current
    ? `/sessions/new/${current.templateId}?${new URLSearchParams({
        sessionId: current.sessionId,
        ...(current.gymId ? { gymId: current.gymId } : {}),
      })}`
    : null;

  return (
    <main className="min-h-dvh bg-papier px-4 pb-28 pt-5 text-encre">
      <DeclarerContexte ecran="programme" />

      <header className="mb-7 space-y-1">
        <p className="eyebrow">Ton entraînement</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Séances</h1>
        {blockName && <p className="text-sm text-encre-3">{blockName}</p>}
      </header>

      {/* Le programme s'affiche ici sans devenir actif : consulter les séances
          d'un autre programme ne doit pas détourner la rotation. Chaque tuile
          dit donc son état — actif, sélectionné ou simplement enregistré — et
          la sélection vit dans l'URL, donc elle se retrouve au retour. */}
      {programmes.length > 1 && (
        <nav
          aria-label="Choisir un programme"
          className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          {programmes.map((programme) => {
            const selectionne = programme.id === selectedProgrammeId;
            const description = selectionne
              ? (programme.actif ? "Actif · ses séances" : "Sélectionné · rotation inchangée")
              : (programme.actif ? "Programme actif" : "Programme enregistré");
            return (
              <Link
                key={programme.id}
                href={`/sessions/new?programme=${programme.id}`}
                prefetch={false}
                aria-current={selectionne ? "true" : undefined}
                className={`flex min-w-[10.5rem] shrink-0 flex-col gap-0.5 rounded-2xl border p-3 transition-colors ${
                  selectionne ? "border-encre bg-papier-2" : "border-filet bg-carte"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-encre">
                  <span className="truncate">{programme.nom}</span>
                  {programme.actif && <Check className="size-3.5 shrink-0 text-gain" aria-hidden />}
                </span>
                <span className="text-xs text-encre-3">{description}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {currentUrl ? (
        <section className="mb-5 overflow-hidden rounded-[1.75rem] bg-encre p-5 text-papier shadow-sm">
          <p className="mb-8 text-xs font-semibold uppercase tracking-[0.18em] text-papier/65">Séance en cours</p>
          <h2 className="font-heading text-2xl font-semibold">Tu peux reprendre exactement où tu en étais.</h2>
          <Link href={currentUrl} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-papier px-5 font-medium text-encre hover:bg-papier/90">
            Reprendre la séance <ArrowRight aria-hidden />
          </Link>
        </section>
      ) : next ? (
        <section className="mb-5 rounded-[1.75rem] border border-filet bg-carte p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre-3">Prochaine séance</p>
              <h2 className="mt-3 font-heading text-2xl font-semibold">{next.name}</h2>
              <p className="mt-1 text-sm text-encre-3">
                {next.programType === "libre"
                  ? "Séance libre"
                  : `${next.programName} · séance ${next.position}/${next.total}`}
              </p>
            </div>
            <span className="grid size-12 place-items-center rounded-2xl bg-papier-2 font-heading text-lg font-semibold">{next.marker}</span>
          </div>
            <Link href={`/sessions/new/${next.id}?gymId=${defaultGymId}`} prefetch={false} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90">
            Commencer <ArrowRight aria-hidden />
          </Link>
        </section>
      ) : (
        <section className="mb-5 rounded-[1.75rem] border border-filet bg-carte p-5">
          <Dumbbell className="mb-4 text-encre-3" aria-hidden />
          <h2 className="font-heading text-xl font-semibold">Aucune séance n&apos;est encore prévue.</h2>
          <p className="mt-2 text-sm text-encre-3">Construis celle qui correspond à ton envie du jour.</p>
        </section>
      )}

      <section className="mb-8 rounded-[1.75rem] bg-[#e9efe8] p-5 text-encre dark:bg-papier-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre-3">Prends le contrôle</p>
        <h2 className="mt-2 font-heading text-xl font-semibold">Crée la séance que tu veux faire.</h2>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <Link href="/sessions/compose" className="flex h-12 items-center justify-between rounded-full bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90">
            <span className="flex items-center gap-2"><Plus aria-hidden /> Composer moi-même</span>
            <ArrowRight aria-hidden />
          </Link>
          <Button type="button" variant="outline" className="h-12 justify-between rounded-full border-filet bg-carte px-5" onClick={() => ouvrir("construire_seance")}> 
            <span className="flex items-center gap-2"><Sparkles aria-hidden /> Demander au Coach</span>
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </section>

      {templates.length > 0 && (
        <section aria-labelledby="programmed-sessions">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre-3">Ton programme</p>
              <h2 id="programmed-sessions" className="mt-1 font-heading text-xl font-semibold">Partir d&apos;une base</h2>
            </div>
            <Link href="/programme" className="text-sm font-medium text-encre-2 underline-offset-4 hover:underline">Voir le programme</Link>
          </div>
          <div className="space-y-2.5">
            {templates.map((template) => (
              <article key={template.id} className="flex items-center gap-3 rounded-2xl border border-filet bg-carte p-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-papier-2 font-heading font-semibold">{template.marker}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{template.name}</h3>
                  {next?.id === template.id && <p className="text-xs text-gain">Prochaine dans la rotation</p>}
                </div>
                <Link href={`/sessions/compose?source=${template.id}`} prefetch={false} aria-label={`Dupliquer ${template.name}`} className="flex h-9 items-center gap-1 rounded-full px-2.5 text-[0.8rem] font-medium text-encre-2 hover:bg-muted">
                  <Copy className="size-3.5" aria-hidden /> Dupliquer
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Un programme sans séance se dit : une section absente se lirait comme
          une page qui n'a rien chargé. */}
      {templates.length === 0 && (
        <p className="rounded-2xl border border-filet bg-carte p-4 text-sm text-encre-3">
          {blockName ? `« ${blockName} » n'a encore aucune séance.` : "Aucune séance à afficher."}
        </p>
      )}
    </main>
  );
}
