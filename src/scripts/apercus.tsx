/**
 * Les huit vues du Live qu'il faut regarder avant de dire que la refonte tient.
 *
 * Lancé par `tsx src/scripts/apercus.tsx` après un `next build` — c'est la
 * feuille de styles compilée par ce build qui est injectée. Voir
 * `apercu-live.tsx` pour ce que ce harnais rend, et ce qu'il ne rend pas.
 */
// EN PREMIER : installe le DOM simulé avant que React ne soit chargé.
import "./dom-simule";
import { ecrire, rendre } from "./apercu-live";
import { LecteurExercice } from "@/components/session/LecteurExercice";
import { TableauSeries } from "@/components/session/TableauSeries";
import { RestTimer } from "@/components/session/RestTimer";
import { VueFocus } from "@/components/session/VueFocus";
import { useSessionStore, type DraftSet } from "@/stores/sessionStore";
import { avancement } from "@/lib/live/vue-live";

const A = "instance-a";
const B = "instance-b";

const DEADLIFT = {
  id: A,
  nom: "Deadlift",
  machineNom: "Barre olympique",
  slug: "deadlift",
  seriesCibles: 3,
  fourchetteRepsMin: 8,
  fourchetteRepsMax: 12,
  incrementsPossibles: [2.5],
  chargeSuggeree: 60,
  rpeCible: 8,
  reposSecondes: 120,
  historique: [
    { charge: 57.5, reps: 10 },
    { charge: 57.5, reps: 9 },
    { charge: 57.5, reps: 8 },
  ],
};

const PRESSE = {
  ...DEADLIFT,
  id: "instance-presse",
  slug: "machine-shoulder-press",
  nom: "Shoulder Press",
  machineNom: "Technogym Pure",
  seriesCibles: 3,
  chargeSuggeree: 32.5,
  historique: [],
  raisonSubstitution: "Machine occupée — remplacée à 19 h 12",
};

const TIRAGE = {
  ...DEADLIFT,
  id: "instance-tirage",
  slug: "seated-row",
  nom: "Tirage horizontal",
  machineNom: "Hammer Strength",
  seriesCibles: 2,
  chargeSuggeree: 45,
  messageProgression: "+2,5 kg — trois séries dans la fourchette la dernière fois",
  motifProgression: "progression" as const,
};

/** Repose la séance dans l'état voulu avant chaque rendu. */
function seance(sets: DraftSet[] = [], lignees: { origine: string; instances: string[] }[] = []) {
  useSessionStore.setState({ active: null });
  useSessionStore.getState().start({
    id: "seance-apercu",
    seanceTemplateId: "modele",
    gymId: "salle",
  });
  useSessionStore.setState((s) => ({
    active: s.active ? { ...s.active, sets, lignees } : s.active,
  }));
}

const fait = (instance: string, n: number, charge: number, reps: number, rpe: number): DraftSet => ({
  exerciseInstanceId: instance,
  numeroSerie: n,
  charge,
  repsEffectuees: reps,
  rpeEffectif: rpe,
  validatedAt: Date.now(),
});

const rien = () => {};

/** L'en-tête collant, tel que la page le rend — État et Temps compris. */
const entete = `
<header class="live-session-header sticky z-20 bg-papier border-b border-filet px-4 py-2" style="top:var(--marge-haut)">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-2 min-w-0">
      <button class="inline-flex items-center justify-center size-9 rounded-md" aria-label="Quitter la séance">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--encre-2)"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <h1 class="text-lg font-semibold text-encre truncate">Poussée A</h1>
    </div>
    <span class="flex items-center gap-2 text-xs text-encre-3 shrink-0">
      <span class="chiffres">1/6</span> exercices
    </span>
  </div>
  <nav class="live-session-persistent" aria-label="Ajustements permanents de la séance">
    <div class="live-time-context"><div class="text-xs text-encre-3 chiffres">0:12:34 · cible 55 min</div></div>
    <div class="live-persistent-actions">
      <button class="live-persistent-action">État</button>
      <button class="live-persistent-action">Temps</button>
    </div>
  </nav>
</header>`;

const enveloppe = (contenu: string, pad = true) =>
  `<div class="live-session min-h-screen bg-papier" style="padding-top:var(--marge-haut)">
     ${entete}
     <main class="${pad ? "px-4 py-4 space-y-3" : ""}">${contenu}</main>
   </div>`;

const etatsDe = (exercices: { id: string; nom: string; seriesCibles: number }[]) =>
  avancement(
    exercices.map((e) => ({ id: e.id, nom: e.nom, seriesCibles: e.seriesCibles })),
    useSessionStore.getState().active?.sets ?? [],
    useSessionStore.getState().active?.lignees ?? [],
  );

const scenes: { nom: string; titre: string; rendu: () => string }[] = [
  {
    nom: "1-focus-premiere-serie",
    titre: "Focus — première série",
    rendu: () => {
      seance();
      const exercices = [DEADLIFT, PRESSE, TIRAGE];
      return enveloppe(
        rendre(
          <VueFocus
            exercices={exercices as never}
            etats={etatsDe(exercices)}
            courant={0}
            onNaviguer={rien}
            rpeReduction={() => 0}
            onSerieValidee={rien}
            actions={() => (
              <>
                <button>↔ Remplacer l&apos;exercice</button>
                <button>Machine occupée</button>
                <button>Douleur</button>
              </>
            )}
          />,
        ),
      );
    },
  },
  {
    nom: "2-focus-serie-terminee",
    titre: "Focus — une série terminée",
    rendu: () => {
      seance([fait(A, 1, 60, 10, 7)]);
      return enveloppe(
        rendre(
          <LecteurExercice
            exercice={DEADLIFT as never}
            rpeReduction={0}
            modeReserve={false}
            onSerieValidee={rien}
            onSuivant={rien}
            actions={
              <>
                <button>↔ Remplacer l&apos;exercice</button>
                <button>Machine occupée</button>
                <button>Douleur</button>
              </>
            }
          />,
        ),
      );
    },
  },
  {
    nom: "3-focus-exercice-termine",
    titre: "Focus — exercice terminé",
    rendu: () => {
      seance([fait(A, 1, 60, 10, 7), fait(A, 2, 60, 9, 8), fait(A, 3, 57.5, 8, 9)]);
      return enveloppe(
        rendre(
          <LecteurExercice
            exercice={DEADLIFT as never}
            rpeReduction={0}
            modeReserve={false}
            onSerieValidee={rien}
            onSuivant={rien}
            actions={
              <>
                <button>↔ Remplacer l&apos;exercice</button>
                <button>Machine occupée</button>
                <button>Douleur</button>
              </>
            }
          />,
        ),
      );
    },
  },
  {
    nom: "4-liste-plusieurs-exercices",
    titre: "Liste — plusieurs exercices",
    rendu: () => {
      seance([fait(A, 1, 60, 10, 7), fait(A, 2, 60, 9, 8), fait(A, 3, 57.5, 8, 9)]);
      return enveloppe(
        [DEADLIFT, PRESSE, TIRAGE]
          .map((e) =>
            rendre(
              <TableauSeries
                exercice={e as never}
                rpeReduction={0}
                onSerieValidee={rien}
                actions={
                  <>
                    <button>↔ Remplacer l&apos;exercice</button>
                    <button>Machine occupée</button>
                    <button>Douleur</button>
                  </>
                }
              />,
            ),
          )
          .join(""),
      );
    },
  },
  {
    nom: "5-liste-validee-et-en-cours",
    titre: "Liste — série validée + série en cours",
    rendu: () => {
      seance([fait(A, 1, 60, 10, 7)]);
      return enveloppe(
        rendre(
          <TableauSeries
            exercice={DEADLIFT as never}
            rpeReduction={0}
            onSerieValidee={rien}
            actions={
              <>
                <button>↔ Remplacer l&apos;exercice</button>
                <button>Machine occupée</button>
                <button>Douleur</button>
              </>
            }
          />,
        ),
      );
    },
  },
  {
    nom: "6-repos",
    titre: "Repos",
    rendu: () => {
      seance([fait(A, 1, 60, 10, 7)]);
      return `${enveloppe(
        rendre(
          <TableauSeries
            exercice={DEADLIFT as never}
            rpeReduction={0}
            onSerieValidee={rien}
          />,
        ),
      )}
      <div class="repos-feuille"><div class="repos-panneau">${rendre(
        <RestTimer
          durationSeconds={120}
          onComplete={rien}
          onSkip={rien}
          onExtend={rien}
          prochaine="Série 2 · 60 × 8"
        />,
      )}</div></div>`;
    },
  },
  {
    nom: "7-focus-calibration",
    titre: "Focus — calibration (RIR)",
    rendu: () => {
      seance([fait(B, 1, 32.5, 11, 7)]);
      return enveloppe(
        `<details class="live-calibration"><summary><span class="eyebrow">Calibration</span>Après la série, indique combien de reps il te restait.</summary><p>C'est cette réponse qui fixera tes charges.</p></details>` +
          rendre(
            <LecteurExercice
              exercice={{ ...PRESSE, id: B } as never}
              rpeReduction={0}
              modeReserve
              onSerieValidee={rien}
              onSuivant={rien}
              actions={
                <>
                  <button>↔ Remplacer l&apos;exercice</button>
                  <button>Machine occupée</button>
                  <button>Douleur</button>
                </>
              }
            />,
          ),
      );
    },
  },
  {
    nom: "8-liste-apres-substitution",
    titre: "Liste — après substitution A → B",
    rendu: () => {
      // S1 faite sur A, puis passage sur B : B ne demande que S2 et S3, et
      // affiche 1/3 — c'est le cas que la lignée protège.
      seance([fait(A, 1, 60, 10, 7)], [{ origine: A, instances: [A, B] }]);
      return enveloppe(
        rendre(
          <TableauSeries
            exercice={{ ...DEADLIFT, id: B, machineNom: "Trap bar", historique: [] } as never}
            rpeReduction={0}
            onSerieValidee={rien}
            actions={
              <>
                <button>↔ Remplacer l&apos;exercice</button>
                <button>Machine occupée</button>
                <button>Douleur</button>
              </>
            }
          />,
        ),
      );
    },
  },
];

for (const largeur of [320, 390]) {
  for (const s of scenes) {
    const f = ecrire(s.nom, s.titre, s.rendu(), largeur);
    console.log(f);
  }
}
