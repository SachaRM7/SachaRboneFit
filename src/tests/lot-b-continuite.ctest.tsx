import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SOSMachineOccupee } from "@/components/session/SOSMachineOccupee";
import { SOSTempsDepasse } from "@/components/session/SOSTempsDepasse";
import { RemplacerExercice } from "@/components/session/RemplacerExercice";
import { ClotureSeance } from "@/components/session/ClotureSeance";

describe("Lot B — gestes de continuité", () => {
  it("Machine occupée reporte explicitement l'exercice choisi", async () => {
    const user = userEvent.setup();
    const reporter = vi.fn();
    render(
      <SOSMachineOccupee
        exercicesDeLaSeance={[
          { id: "a", nom: "Chest Press", seriesFaites: 1, seriesCibles: 2 },
          { id: "b", nom: "Row", seriesFaites: 0, seriesCibles: 2 },
        ]}
        exerciseInstanceId="a"
        gymId="gym"
        allInstances={[]}
        templateExerciseIds={["a", "b"]}
        musclesCourbatures={[]}
        onClose={() => {}}
        onDefer={reporter}
        onSubstitute={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Je fais autre chose et j.y reviens/ }));
    expect(reporter).toHaveBeenCalledWith("a", "Chest Press");
  });

  it("Temps propose 15/30/45 et transmet le budget restant au moteur", async () => {
    const user = userEvent.setup();
    const appliquer = vi.fn();
    render(
      <SOSTempsDepasse
        dureeActuelleMin={40}
        dureeCibleMin={60}
        exercicesRestants={[
          {
            exercise_instance_id: "a",
            nom: "Accessoire",
            muscles_principaux: ["biceps"],
            categorie_role: "accessoire",
            statut: "en_cours",
            ordre: 1,
          },
        ]}
        seriesRestantesPar={{ a: 2 }}
        reposSecondesPar={{ a: 60 }}
        onClose={() => {}}
        onApply={appliquer}
        onIncident={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "15 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45 min" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "15 min" }));
    await user.click(screen.getByRole("button", { name: "Adapter" }));
    expect(appliquer).toHaveBeenCalledWith(
      expect.objectContaining({ minutesRestantes: 15 }),
    );
  });

  it("Temps n'adapte que le futur et ne retire jamais l'exercice principal", async () => {
    const user = userEvent.setup();
    const appliquer = vi.fn();
    render(
      <SOSTempsDepasse
        dureeActuelleMin={35}
        dureeCibleMin={60}
        exercicesRestants={[
          {
            exercise_instance_id: "principal",
            nom: "Leg Press",
            muscles_principaux: ["quadriceps"],
            categorie_role: "pilier",
            statut: "en_cours",
            ordre: 1,
          },
          {
            exercise_instance_id: "accessoire",
            nom: "Leg Extension",
            muscles_principaux: ["quadriceps"],
            categorie_role: "accessoire",
            statut: "à_venir",
            ordre: 2,
          },
        ]}
        seriesRestantesPar={{ principal: 2, accessoire: 10 }}
        reposSecondesPar={{ principal: 120, accessoire: 90 }}
        onClose={() => {}}
        onApply={appliquer}
        onIncident={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "15 min" }));
    expect(screen.getByText("Leg Extension")).toBeInTheDocument();
    expect(screen.getByText(/séries déjà faites et les exercices principaux restent intacts/i))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adapter" }));
    expect(appliquer).toHaveBeenCalledWith({
      exercicesCoupes: ["Leg Extension"],
      minutesRestantes: 15,
    });
  });

  it("Temps annonce honnêtement quand le budget ne change pas le programme", async () => {
    const user = userEvent.setup();
    render(
      <SOSTempsDepasse
        dureeActuelleMin={10}
        dureeCibleMin={60}
        exercicesRestants={[]}
        onClose={() => {}}
        onApply={() => {}}
        onIncident={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "45 min" }));
    expect(screen.getByText("Aucun exercice à retirer. Le programme reste intact."))
      .toBeInTheDocument();
  });

  it("le Live ne rend le CTA de fin que derrière l'autorité de complétion", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "src/app/(app)/sessions/new/[templateId]/page.tsx",
        "utf8",
      ),
    );
    expect(source).toContain("seanceTerminee &&");
    expect(source).toContain("<ClotureSeance");
    expect(source).toContain("reportesIncomplets");
    render(<ClotureSeance onTerminer={() => {}} />);
    expect(screen.getByText("Toutes les séries prévues sont faites.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminer la séance" })).toBeInTheDocument();
  });

  it("Trop compliqué rend une recommandation simple, expliquée et consultable", async () => {
    const user = userEvent.setup();
    const base = {
      id: "base",
      gymId: "gym",
      exerciseId: "exercise-base",
      nom: "Bench Press",
      machineNom: "Banc",
      categorieRole: "pilier" as const,
      profilTension: "mi_range",
      type: "polyarticulaire",
      equipement: "barre",
      musclesPrincipaux: ["pectoraux"],
      pilier: "P1_poussee",
      slug: "bench-press",
    };
    const simple = {
      ...base,
      id: "simple",
      exerciseId: "exercise-simple",
      nom: "Machine Chest Press",
      machineNom: "Presse guidée",
      categorieRole: "substitut" as const,
      equipement: "machine",
      slug: "machine-chest-press",
    };
    render(
      <RemplacerExercice
        sessionLogId="session"
        exerciceId="base"
        exerciceNom="Bench Press"
        pilier="P1_poussee"
        profilTension="mi_range"
        gymId="gym"
        parcSalle={[base, simple]}
        dejaAuProgramme={["base"]}
        debutant
        onRemplace={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remplacer" }));
    await user.click(screen.getByRole("button", { name: "Trop compliqué" }));

    expect(screen.getByText("Recommandé")).toBeInTheDocument();
    expect(screen.getByText("Plus simple à apprendre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir comment faire" })).toBeInTheDocument();
  });

  it("Voir comment faire revient au choix sans perdre la raison sélectionnée", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    const base = {
      id: "base",
      gymId: "gym",
      exerciseId: "exercise-base",
      nom: "Bench Press",
      machineNom: "Banc",
      categorieRole: "pilier" as const,
      profilTension: "mi_range",
      type: "polyarticulaire",
      equipement: "barre",
      musclesPrincipaux: ["pectoraux"],
      pilier: "P1_poussee",
      slug: "bench-press",
    };
    const simple = {
      ...base,
      id: "simple",
      exerciseId: "exercise-simple",
      nom: "Machine Chest Press",
      machineNom: "Presse guidée",
      categorieRole: "substitut" as const,
      equipement: "machine",
      slug: "machine-chest-press",
    };
    render(
      <RemplacerExercice
        sessionLogId="session"
        exerciceId="base"
        exerciceNom="Bench Press"
        pilier="P1_poussee"
        profilTension="mi_range"
        gymId="gym"
        parcSalle={[base, simple]}
        dejaAuProgramme={["base"]}
        debutant
        onRemplace={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remplacer" }));
    await user.click(screen.getByRole("button", { name: "Trop compliqué" }));
    await user.click(screen.getByRole("button", { name: "Voir comment faire" }));
    expect(screen.getByText("Chargement de la technique…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retour aux choix" }));
    expect(screen.getByText("Plus simple à apprendre")).toBeInTheDocument();
  });

  it("dit honnêtement quand aucun remplacement guidé ne convient", async () => {
    const user = userEvent.setup();
    const base = {
      id: "base",
      gymId: "gym",
      exerciseId: "exercise-base",
      nom: "Romanian Deadlift",
      machineNom: "Barre",
      categorieRole: "pilier" as const,
      profilTension: "stretch",
      type: "polyarticulaire",
      equipement: "barre",
      musclesPrincipaux: ["ischios"],
      pilier: "P3_hinge",
      slug: "romanian-deadlift",
    };
    render(
      <RemplacerExercice
        sessionLogId="session"
        exerciceId="base"
        exerciceNom="Romanian Deadlift"
        pilier="P3_hinge"
        profilTension="stretch"
        gymId="gym"
        parcSalle={[base]}
        dejaAuProgramme={["base"]}
        debutant
        onRemplace={() => {}}
        onReporter={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remplacer" }));
    await user.click(screen.getByRole("button", { name: "Trop compliqué" }));
    expect(screen.getByText(/pas de remplacement plus simple suffisamment documenté/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Faire un autre exercice et y revenir" })).toBeInTheDocument();
  });
});
