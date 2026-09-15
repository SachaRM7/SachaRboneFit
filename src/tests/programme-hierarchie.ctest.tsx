import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh, push } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

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

  it("expose la suppression du programme consulté", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

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

    await user.click(screen.getByRole("button", { name: "Supprimer ce programme" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/programme/blocs/libre",
      { method: "DELETE" },
    ));
    expect(push).toHaveBeenCalledWith("/programme");
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

  it("peut replier les commandes quand une surface le demande", () => {
    render(
      <OptionsAvancees initialementOuvert={false}>
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
