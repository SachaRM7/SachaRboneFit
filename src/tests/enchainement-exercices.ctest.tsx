import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

/**
 * LA DERNIÈRE SÉRIE ENCHAÎNE TOUTE SEULE.
 *
 * « Exercice suivant » demandait un appui qui n'apporte aucune décision : on
 * vient de finir l'exercice, il n'y a rien d'autre à faire. Le repos monte
 * devant, et l'exercice suivant est déjà chargé derrière — au moment où l'on
 * referme la feuille, on est au bon endroit sans avoir rien touché.
 *
 * CE QUE CES TESTS VÉRIFIENT VRAIMENT
 *
 * Pas le hook isolé : le CÂBLAGE. `useSaisieSeries` décide qu'une validation
 * termine l'exercice, et c'est l'écran qui en tire l'enchaînement. Un test du
 * seul hook laisserait passer un écran qui ignore le signal.
 *
 * Le harnais ci-dessous rejoue donc la logique de la page — `lancerRepos` —
 * autour du vrai `VueFocus`, avec le vrai store.
 */

vi.mock("@/components/session/serie-en-vol", () => ({
  pousserSerie: () => {},
  retirerSerieEnVol: () => {},
  revisionSuivante: () => Date.now(),
}));
vi.mock("@/components/session/useContexteExecution", () => ({
  useContexteExecution: () => ({ contexte: null, remplacer: () => {} }),
}));

const { VueFocus } = await import("@/components/session/VueFocus");
const { useSessionStore } = await import("@/stores/sessionStore");
const { avancement } = await import("@/lib/live/vue-live");
type SerieValidee = import("@/components/session/useSaisieSeries").SerieValidee;

const A = "instance-a";
const B = "instance-b";

const exo = (id: string, nom: string, seriesCibles: number) => ({
  id,
  nom,
  machineNom: nom,
  seriesCibles,
  fourchetteRepsMin: 8,
  fourchetteRepsMax: 12,
  incrementsPossibles: [2.5],
  chargeSuggeree: id === A ? 60 : 32.5,
  rpeCible: 8,
  reposSecondes: 120,
});

/**
 * L'écran de séance, réduit à ce que ce test observe.
 *
 * `lancerRepos` reproduit EXACTEMENT l'ordre de la page : démarrer le repos sur
 * l'exercice qui vient d'être terminé — la sémantique historique de
 * `repos_reel_secondes` en dépend — PUIS naviguer.
 */
function EcranDeSeance({ exercices }: { exercices: ReturnType<typeof exo>[] }) {
  const { active, startRest, setCurrentExerciseIndex } = useSessionStore();
  const [timerVisible, setTimerVisible] = useState(false);
  const index = active?.currentExerciseIndex ?? 0;

  const etats = avancement(
    exercices.map((e) => ({ id: e.id, nom: e.nom, seriesCibles: e.seriesCibles })),
    active?.sets ?? [],
    active?.lignees ?? [],
  );

  const lancerRepos = ({ reposSecondes, exerciceTermine }: SerieValidee) => {
    const indexTermine = active?.currentExerciseIndex ?? 0;
    if (reposSecondes && reposSecondes > 0) {
      startRest(reposSecondes, indexTermine);
      setTimerVisible(true);
    }
    if (!exerciceTermine) return;
    const suivant = indexTermine + 1;
    if (suivant < exercices.length) setCurrentExerciseIndex(suivant);
  };

  return (
    <>
      <VueFocus
        exercices={exercices as never}
        etats={etats}
        courant={index}
        onNaviguer={setCurrentExerciseIndex}
        rpeReduction={() => 0}
        modeReserve={false}
        onSerieValidee={lancerRepos}
      />
      {timerVisible && <div data-testid="repos">Repos en cours</div>}
    </>
  );
}

function demarrer() {
  useSessionStore.setState({ active: null });
  useSessionStore.getState().start({
    id: "seance-1",
    seanceTemplateId: "modele",
    gymId: "salle",
  });
}

beforeEach(demarrer);

const valider = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "J’ai fini ma série" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer la série" }));
};

const exerciceAffiche = () =>
  document.querySelector(".lecteur-titre h2")?.textContent;

describe("valider la dernière série passe à l'exercice suivant", () => {
  const exercices = [exo(A, "Deadlift", 2), exo(B, "Shoulder Press", 2)];

  beforeEach(() => {
    // S1 de A est déjà faite : la validation suivante termine l'exercice.
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A,
      numeroSerie: 1,
      charge: 60,
      repsEffectuees: 10,
      rpeEffectif: 8,
    });
  });

  it("part bien de Deadlift, série 2", () => {
    render(<EcranDeSeance exercices={exercices} />);
    expect(exerciceAffiche()).toBe("Deadlift");
    expect(document.querySelector(".serie-en-cours-titre")?.textContent)
      .toContain("2");
  });

  it("après validation : le repos monte ET l'exercice suivant est derrière", async () => {
    render(<EcranDeSeance exercices={exercices} />);
    await valider();

    expect(screen.getByTestId("repos"), "le repos ne s'est pas lancé")
      .toBeInTheDocument();
    // Le cœur de la finition : plus aucun appui sur « Exercice suivant ».
    expect(exerciceAffiche(), "l'écran est resté sur Deadlift").toBe("Shoulder Press");
    expect(useSessionStore.getState().active?.currentExerciseIndex).toBe(1);
  });

  it("et la série validée est bien persistée", async () => {
    render(<EcranDeSeance exercices={exercices} />);
    await valider();

    const sets = useSessionStore.getState().active!.sets;
    expect(sets.filter((s) => s.exerciseInstanceId === A)).toHaveLength(2);
    expect(sets.find((s) => s.numeroSerie === 2)?.charge).toBe(60);
  });

  it("le repos reste rattaché à l'exercice TERMINÉ, pas au suivant", async () => {
    /*
     * `intervalleDepuisLaSeriePrecedente` compare `restExerciseIndex` à
     * l'exercice courant pour décider si l'intervalle mesuré veut dire quelque
     * chose. Rattacher le repos au suivant changerait silencieusement le sens
     * de `repos_reel_secondes` : deux séances de part et d'autre de ce lot
     * cesseraient d'être comparables.
     */
    render(<EcranDeSeance exercices={exercices} />);
    await valider();

    expect(useSessionStore.getState().active?.restExerciseIndex).toBe(0);
    expect(useSessionStore.getState().active?.currentExerciseIndex).toBe(1);
  });

  it("aucun bouton « Exercice suivant » n'est nécessaire", async () => {
    render(<EcranDeSeance exercices={exercices} />);
    await valider();
    /* `.lecteur-suivant` et non le rôle : la flèche de navigation porte le même
       intitulé, et elle, elle existe toujours. */
    expect(document.querySelector(".lecteur-suivant")).toBeNull();
  });
});

describe("mais pas une série trop tôt", () => {
  const exercices = [exo(A, "Deadlift", 3), exo(B, "Shoulder Press", 2)];

  it("valider S2 sur trois séries garde l'exercice courant", async () => {
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A, numeroSerie: 1, charge: 60, repsEffectuees: 10, rpeEffectif: 8,
    });
    render(<EcranDeSeance exercices={exercices} />);

    await valider();

    expect(exerciceAffiche(), "l'écran a enchaîné une série trop tôt").toBe("Deadlift");
    expect(useSessionStore.getState().active?.currentExerciseIndex).toBe(0);
    // S3 devient la série courante, et le repos tourne normalement.
    expect(document.querySelector(".serie-en-cours-titre")?.textContent).toContain("3");
    expect(screen.getByTestId("repos")).toBeInTheDocument();
  });
});

describe("le dernier exercice de la séance ne mène nulle part", () => {
  const exercices = [exo(A, "Deadlift", 2), exo(B, "Shoulder Press", 2)];

  it("reste sur l'état « exercice terminé », sans index inventé", async () => {
    // On se place sur le DERNIER exercice, avec sa première série faite.
    useSessionStore.getState().setCurrentExerciseIndex(1);
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: B, numeroSerie: 1, charge: 32.5, repsEffectuees: 10, rpeEffectif: 8,
    });
    render(<EcranDeSeance exercices={exercices} />);

    await valider();

    expect(exerciceAffiche()).toBe("Shoulder Press");
    // Aucun index hors du tableau : c'est ce qui ferait planter le rendu.
    expect(useSessionStore.getState().active?.currentExerciseIndex).toBe(1);
    expect(screen.getByText("Exercice terminé")).toBeInTheDocument();
    // Le dernier exercice n'a pas de suivant : le bouton de fin n'existe pas.
    expect(document.querySelector(".lecteur-suivant")).toBeNull();
  });
});

describe("la poubelle vit sur la série ajoutée", () => {
  const exercices = [exo(A, "Deadlift", 2), exo(B, "Shoulder Press", 2)];

  const ajouter = () =>
    userEvent.setup().click(screen.getByRole("button", { name: /Série en plus/ }));

  it("aucune poubelle sur une série prescrite", () => {
    render(<EcranDeSeance exercices={exercices} />);
    expect(screen.queryByRole("button", { name: /Supprimer la série/ })).toBeNull();
  });

  it("ajouter S3 fait apparaître la poubelle DANS sa carte", async () => {
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A, numeroSerie: 1, charge: 60, repsEffectuees: 10, rpeEffectif: 8,
    });
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A, numeroSerie: 2, charge: 60, repsEffectuees: 9, rpeEffectif: 9,
    });
    render(<EcranDeSeance exercices={exercices} />);
    await ajouter();

    const poubelle = screen.getByRole("button", { name: "Supprimer la série 3" });
    expect(poubelle.closest(".serie-en-cours"), "la poubelle n'est pas dans la carte de la série")
      .not.toBeNull();

    // L'ancien lien de pied de carte a disparu.
    expect(screen.queryByRole("button", { name: /Retirer la série/ })).toBeNull();
  });

  it("cliquer la poubelle retire S3 sans toucher au reste", async () => {
    const user = userEvent.setup();
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A, numeroSerie: 1, charge: 60, repsEffectuees: 10, rpeEffectif: 8,
    });
    useSessionStore.getState().upsertSet({
      exerciseInstanceId: A, numeroSerie: 2, charge: 60, repsEffectuees: 9, rpeEffectif: 9,
    });
    render(<EcranDeSeance exercices={exercices} />);
    await ajouter();
    await user.click(screen.getByRole("button", { name: "Supprimer la série 3" }));

    // L'exercice redevient terminé : S3 n'existe plus.
    expect(screen.queryByRole("button", { name: "Supprimer la série 3" })).toBeNull();
    expect(screen.getByText("Exercice terminé")).toBeInTheDocument();

    // La prescription n'a pas bougé, S1 et S2 non plus.
    const sets = useSessionStore.getState().active!.sets;
    expect(sets.filter((s) => s.exerciseInstanceId === A)).toHaveLength(2);
    expect(sets.map((s) => s.numeroSerie).sort()).toEqual([1, 2]);
    expect(exercices[0]!.seriesCibles, "la prescription a été réécrite").toBe(2);
  });

  it("une série ajoutée DÉJÀ VALIDÉE se retire aussi, et part du store", async () => {
    const user = userEvent.setup();
    for (const n of [1, 2]) {
      useSessionStore.getState().upsertSet({
        exerciseInstanceId: A, numeroSerie: n, charge: 60, repsEffectuees: 10, rpeEffectif: 8,
      });
    }
    render(<EcranDeSeance exercices={exercices} />);
    await ajouter();
    await valider();

    // S3 est validée : elle est passée en résumé, et reste la dernière
    // retirable. C'est `retirerLaDerniereSerie` — la même logique — qui agit.
    expect(useSessionStore.getState().active!.sets).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Supprimer la série 3" }));

    const sets = useSessionStore.getState().active!.sets;
    expect(sets, "la série validée n'a pas été retirée du store").toHaveLength(2);
    expect(sets.some((s) => s.numeroSerie === 3), "S3 a ressuscité").toBe(false);
  });
});
