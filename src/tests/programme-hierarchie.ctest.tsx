import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ProgrammesManager } from "@/components/programme/ProgrammesManager";
import { OptionsAvancees } from "@/components/programme/VueCycle";

describe("hiérarchie des programmes", () => {
  it("distingue le programme consulté du programme actif", () => {
    render(
      <ProgrammesManager
        programmes={[
          { id: "libre", nom: "Séances libres", actif: false, typeCycle: "libre" },
          { id: "ppl", nom: "PPLUL", actif: true, typeCycle: "hypertrophie" },
        ]}
        selectedId="libre"
        seances={[]}
      />,
    );

    const libre = screen.getByRole("link", { name: /Séances libres/ });
    const ppl = screen.getByRole("link", { name: /PPLUL/ });

    expect(libre).toHaveAttribute("aria-current", "page");
    expect(libre).toHaveTextContent("Consulté");
    expect(libre).not.toHaveTextContent("Pilote la rotation");
    expect(ppl).toHaveTextContent("Actif");
    expect(ppl).toHaveTextContent("Pilote la rotation");
  });

  it("montre immédiatement le contenu d'un programme non actif", () => {
    render(
      <OptionsAvancees initialementOuvert>
        <p>Aucune séance dans ce programme</p>
      </OptionsAvancees>,
    );

    expect(screen.getByRole("button", { name: /Séances et exercices/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Aucune séance dans ce programme")).toBeVisible();
  });

  it("laisse les commandes du programme actif repliées", () => {
    render(
      <OptionsAvancees>
        <p>Commandes du programme</p>
      </OptionsAvancees>,
    );

    expect(screen.getByRole("button", { name: /Séances et exercices/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Commandes du programme")).not.toBeInTheDocument();
  });
});
