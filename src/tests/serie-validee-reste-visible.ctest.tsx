import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

/**
 * LE DEADLIFT QUI PERDAIT SA PREMIÈRE SÉRIE.
 *
 * Constaté sur iPhone, en séance. Deux séries prescrites, S1 et S2 visibles ;
 * on valide S1, le compteur passe bien à 1/2 — et S1 disparaît de la carte.
 *
 * La série était pourtant bien enregistrée : le défaut était de REPRÉSENTATION.
 * Le Live passait à la carte le résultat de `slotsARemplir`, c'est-à-dire les
 * slots ENCORE LIBRES, en croyant lui passer les lignes à rendre. Cette liste
 * rétrécit à chaque validation par construction.
 *
 * POURQUOI CES TESTS RENDENT VRAIMENT LES COMPOSANTS
 *
 * Une fonction pure ne pouvait pas attraper ce défaut : `slotsARemplir` était
 * juste, `avancement` était juste, le store était juste. C'est l'écran qui
 * mentait. Ces tests rendent donc les composants réels, cliquent sur les vrais
 * boutons, et lisent ce que l'utilisateur aurait vu.
 */

// Le réseau n'a rien à faire ici : le store pousse chaque série au serveur, et
// c'est la persistance qui est testée ailleurs, en intégration.
vi.mock("@/components/session/serie-en-vol", () => ({
  pousserSerie: () => {},
  retirerSerieEnVol: () => {},
  revisionSuivante: () => Date.now(),
}));

// Le contexte d'exécution (tempo, réglages, note) part chercher le serveur au
// montage. Sans lui la carte s'affiche simplement sans ces lignes.
vi.mock("@/components/session/useContexteExecution", () => ({
  useContexteExecution: () => ({ contexte: null, remplacer: () => {} }),
}));

const { TableauSeries } = await import("@/components/session/TableauSeries");
const { LecteurExercice } = await import("@/components/session/LecteurExercice");
const { useSessionStore } = await import("@/stores/sessionStore");

const A = "instance-a";
const B = "instance-b";

const DEADLIFT = {
  id: A,
  nom: "Deadlift",
  machineNom: "Barre olympique",
  seriesCibles: 2,
  fourchetteRepsMin: 8,
  fourchetteRepsMax: 12,
  incrementsPossibles: [2.5],
  chargeSuggeree: 60,
  rpeCible: 8,
  reposSecondes: 120,
};

/** La séance en cours, remise à zéro avant chaque test. */
function demarrerLaSeance() {
  useSessionStore.setState({ active: null });
  useSessionStore.getState().start({
    id: "seance-1",
    seanceTemplateId: "modele-1",
    gymId: "salle-1",
  });
}

beforeEach(demarrerLaSeance);

const liste = (exercice = DEADLIFT) =>
  render(
    <TableauSeries
      exercice={exercice as never}
      rpeReduction={0}
      onSerieValidee={() => {}}
    />,
  );

const focus = (exercice = DEADLIFT) =>
  render(
    <LecteurExercice
      exercice={exercice as never}
      rpeReduction={0}
      modeReserve={false}
      onSerieValidee={() => {}}
      onSuivant={null}
    />,
  );

/** Les numéros de série que l'écran propose de valider, dans l'ordre. */
const aValider = () =>
  screen
    .queryAllByRole("button", { name: /^Valider la série \d+$/ })
    .map((b) => Number(b.getAttribute("aria-label")!.match(/\d+/)![0]));

/** Les numéros de série que l'écran présente comme faites. */
const modifiables = () =>
  screen
    .queryAllByRole("button", { name: /^Modifier la série \d+$/ })
    .map((b) => Number(b.getAttribute("aria-label")!.match(/\d+/)![0]));

describe("cas 1 — valider S1 ne la fait pas disparaître", () => {
  it("les deux séries sont là avant la validation", () => {
    liste();
    expect(aValider()).toEqual([1, 2]);
  });

  it("après validation, S1 est TOUJOURS présente — et S2 reste à faire", async () => {
    const user = userEvent.setup();
    liste();

    await user.click(screen.getByRole("button", { name: "Valider la série 1" }));

    // Le cœur du défaut : avant correction, S1 n'était plus rendue du tout.
    expect(modifiables(), "S1 a disparu de la carte").toEqual([1]);
    expect(aValider(), "S2 devrait rester à faire").toEqual([2]);
  });

  it("et le compteur dit bien 1/2", async () => {
    const user = userEvent.setup();
    const { container } = liste();

    await user.click(screen.getByRole("button", { name: "Valider la série 1" }));

    expect(container.querySelector(".live-carte-compteur")?.textContent)
      .toBe("1/2");
  });

  it("la série validée reste LISIBLE, pas seulement présente", async () => {
    const user = userEvent.setup();
    const { container } = liste();

    await user.click(screen.getByRole("button", { name: "Valider la série 1" }));

    // 60 kg × 8 : ce qui a été enregistré, affiché tel quel.
    const validee = container.querySelector('[data-etat="validee"]');
    expect(validee?.textContent).toContain("60");
    expect(validee?.textContent).toContain("8");
  });
});

describe("cas 2 — rouvrir S1 rend les valeurs réellement enregistrées", () => {
  it("la charge corrigée revient dans le champ, et non la proposition", async () => {
    const user = userEvent.setup();
    liste();

    // On saisit 72,5 au lieu des 60 proposés, puis on valide.
    const charge = screen.getByLabelText("Charge série 1");
    await user.clear(charge);
    await user.type(charge, "72.5");
    await user.click(screen.getByRole("button", { name: "Valider la série 1" }));

    // Rouvrir : le brouillon repart de ce qui est en base, pas de la
    // proposition du moteur — sinon corriger une série l'effacerait.
    await user.click(screen.getByRole("button", { name: "Modifier la série 1" }));

    expect(screen.getByLabelText("Charge série 1")).toHaveValue("72.5");
    expect(aValider()).toEqual([1, 2]);
  });

  it("et la correction est bien celle qui part au store", async () => {
    const user = userEvent.setup();
    liste();

    const charge = screen.getByLabelText("Charge série 1");
    await user.clear(charge);
    await user.type(charge, "72.5");
    await user.click(screen.getByRole("button", { name: "Valider la série 1" }));

    const enregistree = useSessionStore
      .getState()
      .active!.sets.find((s) => s.numeroSerie === 1);
    expect(enregistree?.charge).toBe(72.5);
  });
});

describe("cas 3 et 4 — Focus et Liste montrent exactement le même état", () => {
  it("valider en Focus, relire en Liste", async () => {
    const user = userEvent.setup();
    const vue = focus();

    await user.click(screen.getByRole("button", { name: /Valider la série/ }));
    vue.unmount();

    // Changer de vue ne recharge rien : c'est le même store.
    liste();
    expect(modifiables(), "la série validée en Focus manque en Liste").toEqual([1]);
    expect(aValider()).toEqual([2]);
  });

  it("modifier en Liste, retrouver la valeur en Focus", async () => {
    const user = userEvent.setup();
    const vue = liste();

    const charge = screen.getByLabelText("Charge série 1");
    await user.clear(charge);
    await user.type(charge, "65");
    await user.click(screen.getByRole("button", { name: "Valider la série 1" }));
    vue.unmount();

    focus();
    // Le Focus replie la série faite en résumé : la valeur doit s'y lire.
    const faite = document.querySelector(".lecteur-faites li");
    expect(faite?.textContent).toContain("65");
  });

  it("et une série rouverte en Liste redevient à faire en Focus", async () => {
    const user = userEvent.setup();
    const vue = liste();

    await user.click(screen.getByRole("button", { name: "Valider la série 1" }));
    await user.click(screen.getByRole("button", { name: "Modifier la série 1" }));
    vue.unmount();

    focus();
    // La série en cours redevient la 1 : c'est la première non validée.
    expect(document.querySelector(".serie-en-cours-titre")?.textContent)
      .toContain("1");
  });
});

describe("cas 5 — la substitution ne fabrique jamais une quatrième série", () => {
  const TROIS = { ...DEADLIFT, seriesCibles: 3 };
  const SUR_B = { ...TROIS, id: B, machineNom: "Trap bar" };

  /** S1 faite sur A, puis A remplacée par B. */
  function substituerApresUneSerie() {
    const store = useSessionStore.getState();
    store.upsertSet({
      exerciseInstanceId: A,
      numeroSerie: 1,
      repsEffectuees: 10,
      charge: 60,
      rpeEffectif: 8,
    });
    store.noterSubstitution(A, B);
  }

  it("B ne demande que S2 et S3", () => {
    substituerApresUneSerie();
    liste(SUR_B as never);

    expect(aValider()).toEqual([2, 3]);
    // S1 a été faite sur A : elle ne devient pas une performance de B.
    expect(modifiables()).toEqual([]);
  });

  it("et B affiche 1/3, pas 0/3 — la série de A compte pour le slot", () => {
    substituerApresUneSerie();
    const { container } = liste(SUR_B as never);

    expect(container.querySelector(".live-carte-compteur")?.textContent)
      .toBe("1/3");
  });

  it("B validant S2 garde S2 affichée et S3 à faire", async () => {
    const user = userEvent.setup();
    substituerApresUneSerie();
    liste(SUR_B as never);

    await user.click(screen.getByRole("button", { name: "Valider la série 2" }));

    expect(modifiables(), "S2 a disparu après validation").toEqual([2]);
    expect(aValider()).toEqual([3]);
  });

  it("l'avancement global passe à 2/3, et pas une série de plus", async () => {
    const user = userEvent.setup();
    substituerApresUneSerie();
    const { container } = liste(SUR_B as never);

    await user.click(screen.getByRole("button", { name: "Valider la série 2" }));

    expect(container.querySelector(".live-carte-compteur")?.textContent)
      .toBe("2/3");

    // Trois séries prescrites, deux réalisées, chacune sur sa machine réelle.
    const sets = useSessionStore.getState().active!.sets;
    expect(sets).toHaveLength(2);
    expect(sets.map((s) => `${s.numeroSerie}:${s.exerciseInstanceId}`).sort())
      .toEqual([`1:${A}`, `2:${B}`]);
  });

  it("aucune quatrième série n'est jamais proposée", async () => {
    const user = userEvent.setup();
    substituerApresUneSerie();
    liste(SUR_B as never);

    await user.click(screen.getByRole("button", { name: "Valider la série 2" }));
    await user.click(screen.getByRole("button", { name: "Valider la série 3" }));

    expect(aValider()).toEqual([]);
    expect(modifiables()).toEqual([2, 3]);
    expect(useSessionStore.getState().active!.sets).toHaveLength(3);
  });
});

describe("la fin d'un exercice est un état, pas un formulaire vide", () => {
  it("le Focus annonce l'exercice terminé et garde les résultats", async () => {
    const user = userEvent.setup();
    focus();

    await user.click(screen.getByRole("button", { name: /Valider la série/ }));
    await user.click(screen.getByRole("button", { name: /Valider la série/ }));

    expect(screen.getByText("Exercice terminé")).toBeInTheDocument();
    // Les deux séries restent lisibles sous leur forme compacte.
    expect(document.querySelectorAll(".lecteur-faites li")).toHaveLength(2);
    // Et plus aucune saisie ouverte : il n'y a plus de série à faire.
    expect(document.querySelector(".serie-en-cours")).toBeNull();
  });

  it("mais rien ne change d'exercice sans consentement", async () => {
    const user = userEvent.setup();
    const suivant = vi.fn();
    render(
      <LecteurExercice
        exercice={DEADLIFT as never}
        rpeReduction={0}
        modeReserve={false}
        onSerieValidee={() => {}}
        onSuivant={suivant}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Valider la série/ }));
    await user.click(screen.getByRole("button", { name: /Valider la série/ }));

    // Le bouton existe — il n'a pas été déclenché tout seul.
    const aller = screen.getByRole("button", { name: /Exercice suivant/ });
    expect(suivant).not.toHaveBeenCalled();
    await user.click(aller);
    expect(suivant).toHaveBeenCalledOnce();
  });

  it("et le slot rempli sur une AUTRE machine se dit, sans rien redemander", () => {
    const store = useSessionStore.getState();
    for (const n of [1, 2]) {
      store.upsertSet({
        exerciseInstanceId: A,
        numeroSerie: n,
        repsEffectuees: 10,
        charge: 60,
        rpeEffectif: 8,
      });
    }
    store.noterSubstitution(A, B);

    liste({ ...DEADLIFT, id: B } as never);

    expect(aValider(), "B redemande des séries déjà faites").toEqual([]);
    expect(screen.getByText(/faites sur une autre machine/)).toBeInTheDocument();
  });
});

describe("le Focus n'affiche qu'UNE représentation éditable de la série", () => {
  it("un seul champ de charge, pas une saisie rapide doublée d'un tableau", () => {
    focus();
    expect(screen.getAllByLabelText(/^Charge série \d+$/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Répétitions série \d+$/)).toHaveLength(1);
  });

  it("et les crans de l'appareil pilotent cette seule valeur", async () => {
    const user = userEvent.setup();
    focus();

    const charge = screen.getByLabelText("Charge série 1");
    expect(charge).toHaveValue("60");

    await user.click(
      screen.getByRole("button", { name: "Charge : un cran au-dessus" }),
    );
    // 2,5 est l'incrément de l'appareil — pas une valeur écrite dans l'écran.
    expect(charge).toHaveValue("62.5");
  });

  it("la série en cours domine, et les séries faites sont repliées", async () => {
    const user = userEvent.setup();
    focus({ ...DEADLIFT, seriesCibles: 3 } as never);

    await user.click(screen.getByRole("button", { name: /Valider la série/ }));

    const enCours = document.querySelector(".serie-en-cours");
    expect(enCours?.textContent).toContain("2");
    // La série faite est là, sans ses champs.
    const faites = document.querySelectorAll(".lecteur-faites li");
    expect(faites).toHaveLength(1);
    expect(within(faites[0] as HTMLElement).getByRole("button", { name: /Modifier/ }))
      .toBeInTheDocument();
  });
});

describe("série supplémentaire — même vérité en Focus et Liste", () => {
  it("annonce immédiatement la série, sans afficher 3 sur 2", async () => {
    const user = userEvent.setup();
    const annonce = vi.spyOn(toast, "success").mockImplementation(() => "toast-id");
    const vue = focus();
    await user.click(screen.getByRole("button", { name: "Série en plus" }));

    expect(annonce).toHaveBeenCalledWith("SÉRIE 3 AJOUTÉE");
    expect(useSessionStore.getState().active?.additionalSetCounts?.[A]).toBe(1);
    vue.unmount();
    liste();
    expect(screen.getByText("Supplémentaire")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("3 sur 2");
  });

  it("reste visible après un changement de vue puis se retire sans changer la prescription", async () => {
    const user = userEvent.setup();
    const vue = focus();
    await user.click(screen.getByRole("button", { name: "Série en plus" }));
    vue.unmount();

    liste();
    expect(screen.getByText("Supplémentaire")).toBeInTheDocument();
    expect(document.querySelector(".live-carte-prescription")?.textContent).toContain("2 ×");
    await user.click(screen.getByRole("button", { name: "Supprimer la série 3" }));
    expect(screen.queryByText("Supplémentaire")).not.toBeInTheDocument();
  });

  it("peut être validée puis supprimée sans laisser de série fantôme dans le store", async () => {
    const user = userEvent.setup();
    focus();
    await user.click(screen.getByRole("button", { name: "Série en plus" }));
    await user.click(screen.getByRole("button", { name: "Valider la série" }));
    await user.click(screen.getByRole("button", { name: "Valider la série" }));
    await user.click(screen.getByRole("button", { name: "Valider la série" }));

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Supprimer la série 3" }));
    expect(useSessionStore.getState().active?.sets.some((s) => s.numeroSerie === 3)).toBe(false);
    expect(useSessionStore.getState().active?.additionalSetCounts?.[A]).toBe(0);
  });
});

describe("report — état de navigation, jamais réécriture de l'exécution", () => {
  it("conserve la série déjà faite et revient après hydratation", () => {
    const store = useSessionStore.getState();
    store.upsertSet({
      exerciseInstanceId: A,
      numeroSerie: 1,
      repsEffectuees: 8,
      charge: 60,
      rpeEffectif: 8,
    });
    store.deferExercise(A);
    store.hydraterDeferredExercises([A]);

    expect(useSessionStore.getState().active?.sets).toEqual([
      expect.objectContaining({ exerciseInstanceId: A, numeroSerie: 1, charge: 60 }),
    ]);
    expect(useSessionStore.getState().active?.deferredExerciseIds).toEqual([A]);
  });

  it("suit la lignée quand un exercice reporté est ensuite remplacé", () => {
    const store = useSessionStore.getState();
    store.deferExercise(A);
    store.noterSubstitution(A, B);
    expect(useSessionStore.getState().active?.deferredExerciseIds).toEqual([B]);
    expect(useSessionStore.getState().active?.lignees?.[0]?.instances).toEqual([A, B]);
  });
});
