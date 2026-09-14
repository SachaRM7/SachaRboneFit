import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FournisseurCoach, useCoach } from "@/components/coach/ContexteCoach";
import { SessionHub } from "@/components/session-composer/SessionHub";

const templates = [
  { id: "a", letter: "A", name: "Poussée" },
  { id: "b", letter: "B", name: "Tirage" },
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
        nextTemplateId="b"
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
});
