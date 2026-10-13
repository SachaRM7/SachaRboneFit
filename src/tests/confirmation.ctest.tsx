import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.unmock("@/components/ui/confirmation");
const { ConfirmationGlobale, demanderConfirmation } = await import("@/components/ui/confirmation");

beforeEach(() => {
  // La feuille (vaul) capture le pointeur ; jsdom ne l'implémente pas.
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

describe("la confirmation de l'application", () => {
  it("pose la question dans une feuille et rend « oui »", async () => {
    render(<ConfirmationGlobale />);
    let reponse: Promise<boolean>;
    act(() => { reponse = demanderConfirmation({ titre: "Supprimer « Push » ?", message: "Rien n'est perdu.", action: "Supprimer", destructif: true }); });
    expect(await screen.findByText("Supprimer « Push » ?")).toBeInTheDocument();
    expect(screen.getByText("Rien n'est perdu.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    await expect(reponse!).resolves.toBe(true);
  });

  it("« Annuler » rend « non »", async () => {
    render(<ConfirmationGlobale />);
    let reponse: Promise<boolean>;
    act(() => { reponse = demanderConfirmation({ titre: "Retirer ?", action: "Retirer" }); });
    await userEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    await expect(reponse!).resolves.toBe(false);
  });
});
