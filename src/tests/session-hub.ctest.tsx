import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FournisseurCoach, useCoach } from "@/components/coach/ContexteCoach";
import { SessionHub } from "@/components/session-composer/SessionHub";

const templates = [
  { id: "a", marker: "A", name: "Poussée" },
  { id: "b", marker: "B", name: "Tirage" },
];

const programmes = [
  { id: "bloc-1", nom: "Cycle force", actif: true },
  { id: "bloc-2", nom: "Volume", actif: false },
];

function CoachState() {
  const { ouvert, contexte } = useCoach();
  return <output aria-label="Coach state">{ouvert ? contexte?.sujet : "fermé"}</output>;
}

function renderHub(current: Parameters<typeof SessionHub>[0]["current"] = null) {
  return render(
    <FournisseurCoach>
      <SessionHub
        blockName="Cycle force"
        programmes={programmes}
        selectedProgrammeId="bloc-1"
        next={{ id: "b", marker: "B", name: "Tirage", programName: "Cycle force", programType: "force", position: 2, total: 2 }}
        defaultGymId="gym-1"
        templates={templates}
        current={current}
      />
      <CoachState />
    </FournisseurCoach>,
  );
}

describe("centre de contrôle Séances", () => {
  it("rend la séance prévue et la création immédiatement accessibles", () => {
    renderHub();
    expect(screen.getByRole("heading", { name: "Tirage", level: 2 })).toBeVisible();
    expect(screen.getByRole("link", { name: /Commencer/ })).toHaveAttribute("href", "/sessions/new/b?gymId=gym-1");
    expect(screen.getByRole("link", { name: /Composer moi-même/ })).toHaveAttribute("href", "/sessions/compose");
    expect(screen.getByRole("link", { name: "Voir le détail de Poussée" })).toHaveAttribute("href", "/sessions/new/a/details");
    expect(screen.getByRole("link", { name: "Dupliquer Poussée" })).toHaveAttribute("href", "/sessions/compose?source=a");
  });

  it("priorise une séance en cours sans retirer les chemins de création", () => {
    renderHub({ sessionId: "session-1", templateId: "b", gymId: "gym-1" });
    expect(screen.getByRole("link", { name: /Reprendre la séance/ })).toHaveAttribute(
      "href",
      "/sessions/new/b?sessionId=session-1&gymId=gym-1",
    );
    expect(screen.getByRole("link", { name: /Composer moi-même/ })).toBeVisible();
  });

  it("ouvre le Coach avec l'intention de construire une séance", async () => {
    renderHub();
    await userEvent.click(screen.getByRole("button", { name: /Demander au Coach/ }));
    expect(screen.getByLabelText("Coach state")).toHaveTextContent("construire_seance");
  });

  it("sélectionne un programme sans changer la rotation, et distingue les deux états", () => {
    render(
      <FournisseurCoach>
        <SessionHub
          blockName="Volume"
          programmes={programmes}
          selectedProgrammeId="bloc-2"
          next={{ id: "b", marker: "B", name: "Tirage", programName: "Cycle force", programType: "force", position: 2, total: 2 }}
          defaultGymId="gym-1"
          templates={templates}
          current={null}
        />
      </FournisseurCoach>,
    );

    // Choisir un programme ne l'active pas : le lien porte la sélection dans
    // l'URL, et rien ici n'appelle l'activation.
    const volume = screen.getByRole("link", { name: /Volume/ });
    expect(volume).toHaveAttribute("href", "/sessions/new?programme=bloc-2");
    expect(volume).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Sélectionné · rotation inchangée")).toBeVisible();

    // L'actif reste lisible comme actif, même quand il n'est pas sélectionné.
    const force = screen.getByRole("link", { name: /Cycle force/ });
    expect(force).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Programme actif")).toBeVisible();
  });

  it("nomme la prochaine séance de la rotation même quand un autre programme est affiché", () => {
    render(
      <FournisseurCoach>
        <SessionHub
          blockName="Volume"
          programmes={programmes}
          selectedProgrammeId="bloc-2"
          next={{ id: "b", marker: "B", name: "Tirage", programName: "Cycle force", programType: "force", position: 2, total: 2 }}
          defaultGymId="gym-1"
          templates={[{ id: "a", marker: "A", name: "Poussée" }]}
          current={null}
        />
      </FournisseurCoach>,
    );

    // La prochaine séance vit dans la rotation, pas dans le programme affiché :
    // « Tirage » n'est pas listé ici, et il n'y a donc rien à marquer.
    expect(screen.queryByText("Prochaine dans la rotation")).not.toBeInTheDocument();
  });

  it("dit qu'un programme n'a aucune séance plutôt que de laisser la section vide", () => {
    render(
      <FournisseurCoach>
        <SessionHub
          blockName="Volume"
          programmes={programmes}
          selectedProgrammeId="bloc-2"
          next={null}
          defaultGymId="gym-1"
          templates={[]}
          current={null}
        />
      </FournisseurCoach>,
    );

    expect(screen.getByText("« Volume » n'a encore aucune séance.")).toBeVisible();
  });

  it("n'affiche pas Libre pour une séance désormais rattachée à un programme", () => {
    render(
      <FournisseurCoach>
        <SessionHub
          blockName="PPLUL"
          programmes={programmes}
          selectedProgrammeId="bloc-1"
          next={{ id: "a", marker: "01", name: "Push", programName: "PPLUL", programType: "hypertrophie", position: 1, total: 2 }}
          defaultGymId="gym-1"
          templates={[{ id: "a", marker: "01", name: "Push" }]}
          current={null}
        />
      </FournisseurCoach>,
    );

    expect(screen.getByText("PPLUL · séance 1/2")).toBeVisible();
    expect(screen.queryByText(/Séance LIBRE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^LIBRE$/i)).not.toBeInTheDocument();
  });
});
