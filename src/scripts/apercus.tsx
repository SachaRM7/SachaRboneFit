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
import { MascotteCoach } from "@/components/coach/MascotteCoach";
import { ETATS_MASCOTTE } from "@/lib/coach/mascotte-assets";
import { CarteAujourdhui } from "@/components/dashboard/CarteAujourdhui";
import { mascotteDeLAccueil } from "@/lib/coach/accueil-mascotte";
import type { NomEtat } from "@/lib/engine/etat-du-jour";
import { SOSMachineOccupee } from "@/components/session/SOSMachineOccupee";
import { SOSTempsDepasse } from "@/components/session/SOSTempsDepasse";
import { RemplacerExercice } from "@/components/session/RemplacerExercice";
import { FicheExecution } from "@/components/session/FicheExecution";
import { ClotureSeance } from "@/components/session/ClotureSeance";
import { FICHES_TECHNIQUES } from "@/lib/referentiels/fiches-techniques";

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

const PARC_REMPLACEMENT = [
  {
    id: "bench-instance", gymId: "salle", exerciseId: "bench-exercise",
    nom: "Bench Press", machineNom: "Banc olympique", categorieRole: "pilier" as const,
    profilTension: "mi_range", type: "polyarticulaire", equipement: "barre",
    musclesPrincipaux: ["pectoraux"], pilier: "P1_poussee", slug: "bench-press",
  },
  {
    id: "chest-instance", gymId: "salle", exerciseId: "chest-exercise",
    nom: "Chest Press", machineNom: "Presse guidée", categorieRole: "substitut" as const,
    profilTension: "mi_range", type: "polyarticulaire", equipement: "machine",
    musclesPrincipaux: ["pectoraux"], pilier: "P1_poussee", slug: "machine-chest-press",
  },
];

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

/**
 * La coque du Live, dans l'ordre exact de la page.
 *
 * `avantMain` reçoit ce que la page rend ENTRE l'en-tête et `<main>` — le
 * bandeau d'adaptation, le constat de séance. L'empiler dans `main` donnerait
 * des interlignes que l'application n'a pas, et ferait mesurer une hauteur
 * fausse : c'est exactement le genre d'écart qui pousse à corriger un défaut
 * qui n'existe que dans le harnais.
 */
const enveloppe = (contenu: string, pad = true, avantMain = "") =>
  `<div class="live-session min-h-screen bg-papier" style="padding-top:var(--marge-haut)">
     ${entete}
     ${avantMain}
     <main class="${pad ? "px-4 py-4 space-y-3" : ""}">${contenu}</main>
   </div>`;

const etatsDe = (exercices: { id: string; nom: string; seriesCibles: number }[]) =>
  avancement(
    exercices.map((e) => ({ id: e.id, nom: e.nom, seriesCibles: e.seriesCibles })),
    useSessionStore.getState().active?.sets ?? [],
    useSessionStore.getState().active?.lignees ?? [],
  );

/** Aperçu isolé de la carte du jour et de son état coach ; pas la Home entière. */
function accueil(etat: NomEtat, feuJour: "vert" | "orange" | "rouge" | null) {
  const etatDuJour = {
    etat,
    salle: { id: "salle", nom: "Basic Fit République" },
    seance: { templateId: "t1", lettre: "A", nom: "Haut du corps" },
    action: { type: "demarrer_seance", href: "#", templateId: "t1" },
    enAttenteDeDonnees: false,
  };
  const mascotte = mascotteDeLAccueil({ etat, feuJour });
  return rendre(<div className="home-coach">
    <header className="home-greeting"><h1>Salut Sacha.</h1>{mascotte && <MascotteCoach etat={mascotte} presence="normale" />}</header>
    <CarteAujourdhui etat={etatDuJour as never} />
  </div>);
}

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
  /*
   * « 6-repos » a été RETIRÉE, et c'est volontaire.
   *
   * Elle rendait la feuille de repos SANS mascotte — un état que l'écran ne
   * produit plus : `page.tsx` place toujours `.repos-mascotte` dans
   * `.repos-panneau` quand le minuteur est ouvert. Une scène qui photographie
   * une composition disparue ne contrôle rien ; elle donne seulement l'air de
   * contrôler quelque chose. La feuille de repos est couverte par
   * « 10-mascotte-repos », qui elle correspond à l'application.
   */
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
  {
    nom: "9-focus-serie-en-plus",
    titre: "Focus — série ajoutée hors prescription",
    rendu: () => {
      // Deux prescrites, faites, plus une troisième ajoutée à la main : c'est
      // la seule situation où la poubelle apparaît.
      seance([fait(TIRAGE.id, 1, 45, 10, 7), fait(TIRAGE.id, 2, 45, 9, 8)]);
      return enveloppe(
        rendre(
          <LecteurExercice
            exercice={TIRAGE as never}
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
          // On appuie sur « Série en plus », comme le ferait l'athlète : c'est
          // le seul chemin vers cet état, et le seul honnête.
          (hote) => {
            const boutons = [...hote.querySelectorAll("button")];
            boutons
              .find((b) => b.textContent?.includes("Série en plus"))
              ?.click();
          },
        ),
      );
    },
  },
  {
    nom: "10-mascotte-repos",
    titre: "Repos — la mascotte accompagne le minuteur",
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
      <div class="repos-feuille"><div class="repos-panneau">
        <div class="repos-mascotte">${rendre(
          /* `forte`, comme `page.tsx`. Une scène qui rend une AUTRE taille que
             l'application mesure autre chose que l'application — c'est
             exactement ainsi que ce harnais a déjà menti trois fois. */
          <MascotteCoach etat="repos" taille="normal" presence="forte" />,
        )}</div>
        ${rendre(
          <RestTimer
            durationSeconds={120}
            onComplete={rien}
            onSkip={rien}
            onExtend={rien}
            prochaine="Shoulder Press · Série 1 · 32,5 × 8"
          />,
        )}
      </div></div>`;
    },
  },
  {
    nom: "11-mascotte-constat",
    titre: "Constat de séance — intervention",
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
          />,
        ),
        true,
        `<div class="px-4 pb-1"><div class="coach-constat">${rendre(
          <MascotteCoach etat="intervention" taille="compact" presence="discrete" />,
        )}
          <div class="min-w-0 flex-1">
            <p class="text-encre text-sm font-medium">Cette série a été plus dure que visé</p>
            <p class="text-encre-2 text-xs mt-0.5">Effort ressenti 10 pour une cible de 8, sur le Deadlift.</p>
            <button class="coach-constat-action">En parler au coach</button>
          </div>
          <button class="coach-constat-fermer" aria-label="Masquer ce constat">×</button>
        </div></div>`,
      );
    },
  },
  {
    nom: "12-mascotte-planche",
    titre: "Les treize états, côte à côte",
    rendu: () => {
      // La planche de contrôle : elle sert à vérifier que chaque fichier se
      // charge et se lit à la taille où il est employé.
      seance();
      return enveloppe(
        `<div class="mascotte-planche">${ETATS_MASCOTTE.map(
          (e) =>
            `<figure>${rendre(
              <MascotteCoach etat={e} taille="normal" presence="normale" />,
            )}<figcaption>${e}</figcaption></figure>`,
        ).join("")}</div>`,
      );
    },
  },
  {
    nom: "13-accueil-ready",
    titre: "Aujourd'hui — séance prête, le Coach dit « on y va »",
    rendu: () => accueil("prete", "vert"),
  },
  {
    nom: "14-accueil-attention",
    titre: "Aujourd'hui — feu rouge, le Coach dit d'abord de récupérer",
    rendu: () => accueil("prete", "rouge"),
  },
  {
    nom: "15-accueil-debrief",
    titre: "Aujourd'hui — la séance est faite, il reste le bilan",
    rendu: () => accueil("deja_entraine", "vert"),
  },
  {
    nom: "16-lot-b-machine-occupee",
    titre: "Lot B — machine occupée",
    rendu: () => {
      seance([fait(A, 1, 60, 10, 7)]);
      return `${enveloppe(rendre(<LecteurExercice exercice={DEADLIFT as never} rpeReduction={0} modeReserve={false} onSerieValidee={rien} onSuivant={rien} />))}
        ${rendre(
          <SOSMachineOccupee
            exercicesDeLaSeance={[
              { id: A, nom: "Deadlift", machineNom: "Barre olympique", seriesFaites: 1, seriesCibles: 3 },
              { id: B, nom: "Chest Press", machineNom: "Presse guidée", seriesFaites: 0, seriesCibles: 2 },
            ]}
            exerciseInstanceId={A}
            gymId="salle"
            allInstances={[]}
            templateExerciseIds={[A, B]}
            musclesCourbatures={[]}
            onClose={rien}
            onDefer={rien}
            onSubstitute={rien}
          />,
        )}`;
    },
  },
  {
    nom: "17-lot-b-remplacement-simple",
    titre: "Lot B — remplacement guidé",
    rendu: () => {
      seance();
      const modal = rendre(
        <RemplacerExercice
          sessionLogId="seance-apercu"
          exerciceId="bench-instance"
          exerciceNom="Bench Press"
          pilier="P1_poussee"
          profilTension="mi_range"
          gymId="salle"
          parcSalle={PARC_REMPLACEMENT}
          dejaAuProgramme={["bench-instance"]}
          debutant
          onRemplace={rien}
        />,
        [
          (hote) => [...hote.querySelectorAll("button")]
            .find((b) => b.textContent?.trim() === "Remplacer")?.click(),
          (hote) => [...hote.querySelectorAll("button")]
            .find((b) => b.textContent?.trim() === "Trop compliqué")?.click(),
        ],
      );
      return enveloppe(modal);
    },
  },
  {
    nom: "18-lot-b-voir-comment-faire",
    titre: "Lot B — technique avant confirmation",
    rendu: () => {
      seance();
      return enveloppe(rendre(
        <FicheExecution
          contexte={{
            exerciseInstanceId: "chest-instance",
            exerciseId: "chest-exercise",
            fiche: FICHES_TECHNIQUES["machine-chest-press"]!,
            tempo: { tempo: { excentrique: 3, pauseEtire: 0, concentrique: 1, pauseContracte: 0 }, brut: "3-0-1-0", origine: "exercice" },
            reglages: [],
            resumeReglages: null,
            note: null,
            musclesPrincipaux: ["pectoraux"],
            musclesSecondaires: ["epaules", "triceps"],
            peutDecrire: false,
          }}
          nom="Chest Press"
          onFermer={rien}
          onEnregistre={rien}
        />,
        (hote) => [...hote.querySelectorAll("button")]
          .find((b) => b.textContent?.includes("Comment faire"))?.click(),
      ));
    },
  },
  {
    nom: "19-lot-b-exercice-reporte",
    titre: "Lot B — exercice reporté retrouvé",
    rendu: () => {
      seance([fait(A, 1, 60, 10, 7)]);
      useSessionStore.getState().deferExercise(A);
      return enveloppe(rendre(
        <LecteurExercice
          exercice={DEADLIFT as never}
          rpeReduction={0}
          modeReserve={false}
          onSerieValidee={rien}
          onSuivant={rien}
          reporte
        />,
      ));
    },
  },
  {
    nom: "20-lot-b-temps",
    titre: "Lot B — budget de temps",
    rendu: () => {
      seance();
      return `${enveloppe(rendre(<LecteurExercice exercice={DEADLIFT as never} rpeReduction={0} modeReserve={false} onSerieValidee={rien} onSuivant={rien} />))}
        ${rendre(
          <SOSTempsDepasse
            dureeActuelleMin={38}
            dureeCibleMin={60}
            exercicesRestants={[
              { exercise_instance_id: A, nom: "Deadlift", muscles_principaux: ["fessiers"], categorie_role: "pilier", statut: "en_cours", ordre: 1 },
              { exercise_instance_id: B, nom: "Cable Curl", muscles_principaux: ["biceps"], categorie_role: "accessoire", statut: "à_venir", ordre: 2 },
            ]}
            seriesRestantesPar={{ [A]: 2, [B]: 8 }}
            reposSecondesPar={{ [A]: 120, [B]: 90 }}
            onClose={rien}
            onApply={rien}
            onIncident={rien}
          />,
          (hote) => [...hote.querySelectorAll("button")]
            .find((b) => b.textContent?.trim() === "15 min")?.click(),
        )}`;
    },
  },
  {
    nom: "21-lot-b-fin-seance",
    titre: "Lot B — vraie fin de séance",
    rendu: () => {
      seance();
      return enveloppe(rendre(<ClotureSeance onTerminer={rien} />));
    },
  },
];

for (const largeur of [320, 390, 430]) {
  for (const s of scenes) {
    const f = ecrire(s.nom, s.titre, s.rendu(), largeur);
    console.log(f);
  }
}
