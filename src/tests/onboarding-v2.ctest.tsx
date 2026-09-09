import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const { default: PageBienvenue } = await import("@/app/bienvenue/page");

const base = {
  mesures: { dateNaissance: "1995-05-12", sexe: "non_precise", taille: "175", poids: "72", poidsDate: "2026-09-01" },
  objectifType: "",
  musclesPrioritaires: [],
  niveauExperience: "debutant",
  anneesDePratique: "0",
  moisDInterruption: "0",
  listeContraintes: [],
  frequence: { min: 2, cible: 3, max: 4 },
  dureeCible: "60",
  dureeMax: "75",
  preferenceMateriel: "aucune",
  exercicesRefuses: [],
  lieuId: "",
  nouveauLieuNom: "Maison",
};

beforeEach(() => {
  sessionStorage.clear();
  navigation.replace.mockReset();
  navigation.refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ termine: false, prenom: "Sacha", salles: [] }), { status: 200 })));
});

describe("onboarding V2", () => {
  it("ne présélectionne aucune expérience et bloque l'étape", async () => {
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 2, niveauExperience: "" }));
    render(<PageBienvenue />);
    await screen.findByText("Où en es-tu aujourd’hui ?");
    for (const choix of ["Je débute", "Je suis autonome", "Je suis expérimenté"]) {
      expect(screen.getByRole("button", { name: new RegExp(choix) })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByRole("button", { name: /Continuer/ })).toBeDisabled();
  });

  it("ne présélectionne aucun objectif et conserve le choix après retour", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 3 }));
    render(<PageBienvenue />);
    const choix = await screen.findByRole("button", { name: /Prendre du muscle/ });
    expect(choix).toHaveAttribute("aria-pressed", "false");
    await user.click(choix);
    await user.click(screen.getByRole("button", { name: "Étape précédente" }));
    await user.click(screen.getByRole("button", { name: /Continuer/ }));
    expect(screen.getByRole("button", { name: /Prendre du muscle/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("restaure un brouillon après remontage", async () => {
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 3, objectifType: "gain_de_force" }));
    const vue = render(<PageBienvenue />);
    expect(await screen.findByRole("button", { name: /Gagner en force/ })).toHaveAttribute("aria-pressed", "true");
    vue.unmount();
    render(<PageBienvenue />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Gagner en force/ })).toHaveAttribute("aria-pressed", "true"));
  });
});
