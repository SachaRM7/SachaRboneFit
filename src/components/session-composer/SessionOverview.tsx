import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Clock3,
  Dumbbell,
  Edit3,
  MoreHorizontal,
} from "lucide-react";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { libelleCibleEffort } from "@/components/programme/cible-effort";
import type { SeanceProgrammeDetail } from "@/services/seance-template";

export function SessionOverview({
  detail,
  defaultGymId,
}: {
  detail: SeanceProgrammeDetail;
  defaultGymId: string;
}) {
  const returnTo = `/sessions/new/${detail.id}/details`;
  const startUrl = `/sessions/new/${detail.id}${defaultGymId ? `?gymId=${encodeURIComponent(defaultGymId)}` : ""}`;

  return (
    <main className="min-h-dvh bg-papier px-4 pb-[calc(var(--barre-nav)+6rem)] pt-4 text-encre">
      <DeclarerContexte ecran="programme" typeEntite="seance" entiteId={detail.id} />

      <header className="flex items-center gap-3 py-2">
        <Link
          href="/sessions/new"
          aria-label="Retour aux séances"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-carte shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-encre-2">Séances</p>
          <h1 className="truncate font-heading text-xl font-semibold">{detail.nom}</h1>
        </div>
        <Link
          href={`/sessions/new/${detail.id}/edit`}
          prefetch={false}
          aria-label={`Modifier ${detail.nom}`}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-filet bg-carte text-encre-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre"
        >
          <MoreHorizontal className="size-5" aria-hidden />
        </Link>
      </header>

      <section className="mt-5 space-y-1" aria-labelledby="session-overview-title">
        <div className="flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-papier-2 font-heading text-xl font-semibold">
            {detail.ordreDansSemaine.toString().padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre-3">
              {detail.programmeNom} · séance {detail.ordreDansSemaine}
            </p>
            <h2 id="session-overview-title" className="font-heading text-3xl font-semibold tracking-tight">
              {detail.nom}
            </h2>
            <p className="text-base text-encre-2">
              {detail.muscles.length > 0
                ? detail.muscles.slice(0, 4).map(libelleMuscle).join(" · ")
                : "Les muscles seront précisés avec les exercices"}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-3 divide-x divide-filet-doux rounded-[1.5rem] bg-[#e9efe8] px-2 py-4 dark:bg-papier-2" aria-label="Résumé de la séance">
        <Metric icon={<Dumbbell aria-hidden />} value={`${detail.exercices.length}`} label="exercices" />
        <Metric icon={<Clock3 aria-hidden />} value={`~ ${detail.dureeEstimeeMinutes} min`} label="durée estimée" />
        <Metric icon={<BarChart3 aria-hidden />} value={`${detail.seriesTotales}`} label="séries" />
      </section>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-encre-3">Les exercices</p>
        <span className="text-sm text-encre-3">{detail.exercices.length} au total</span>
      </div>

      {detail.exercices.length === 0 ? (
        <section className="mt-3 rounded-[1.5rem] border border-filet bg-carte p-5">
          <p className="font-medium">Cette séance est encore vide.</p>
          <p className="mt-1 text-sm text-encre-3">Ajoute un premier exercice pour pouvoir la démarrer.</p>
          <Link href={`/sessions/new/${detail.id}/edit`} prefetch={false} className="mt-4 flex h-11 items-center justify-center rounded-full bg-encre font-medium text-papier">
            Ajouter un exercice
          </Link>
        </section>
      ) : (
        <div className="mt-3 space-y-2.5">
          {detail.exercices.map((exercice) => (
            <Link
              key={exercice.ligneId}
              href={`/exercises/${exercice.exerciseId}?from=${encodeURIComponent(returnTo)}`}
              prefetch={false}
              aria-label={`Voir le détail de ${exercice.nom}`}
              className="group flex items-center gap-3 rounded-[1.35rem] border border-filet bg-carte p-3.5 transition-colors hover:border-encre-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre"
            >
              <span className="w-5 shrink-0 text-center text-sm text-encre-3 chiffres">{exercice.ordre}</span>
              {exercice.slug ? (
                <IllustrationExercice slug={exercice.slug} nom={exercice.nom} className="size-12 shrink-0 text-encre-2" />
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-papier-2"><Dumbbell className="size-5 text-encre-3" aria-hidden /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{exercice.nom}</span>
                <span className="block truncate text-xs text-encre-3">{exercice.machineNom}{exercice.salleNom ? ` · ${exercice.salleNom}` : ""}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <Prescription>{exercice.seriesCibles} × {exercice.fourchetteRepsMin}-{exercice.fourchetteRepsMax}</Prescription>
                  <Prescription>{libelleCibleEffort(exercice.rpeCible)}</Prescription>
                  {exercice.tempo && <Prescription>tempo {exercice.tempo}</Prescription>}
                  {exercice.reposSecondes !== null && <Prescription>{exercice.reposSecondes}s</Prescription>}
                  {exercice.chargeCible !== null && <Prescription>{exercice.chargeCible} kg</Prescription>}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-encre-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 pointer-events-none">
        <div className="mx-auto flex max-w-2xl gap-2 rounded-[1.5rem] border border-filet bg-papier/95 p-2 shadow-[0_-10px_30px_rgba(20,30,24,.1)] backdrop-blur pointer-events-auto">
          <Link href={`/sessions/new/${detail.id}/edit`} prefetch={false} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-filet bg-carte px-3 text-sm font-medium text-encre-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre">
            <Edit3 className="size-4" aria-hidden /> Modifier
          </Link>
          <Link href={startUrl} prefetch={false} className="flex h-12 flex-[1.25] items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-encre">
            Démarrer la séance <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </main>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-1 text-center">
      <span className="text-encre-2 [&_svg]:size-4">{icon}</span>
      <span className="text-sm font-medium chiffres">{value}</span>
      <span className="text-[0.68rem] leading-tight text-encre-3">{label}</span>
    </div>
  );
}

function Prescription({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-filet px-2 py-1 text-[0.68rem] text-encre-2">{children}</span>;
}
