import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const { default: PageBienvenue, champMasqueParClavier } = await import("@/app/bienvenue/page");

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
  it("décrit honnêtement le rôle du profil sans promettre une estimation de charge", async () => {
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 1 }));
    render(<PageBienvenue />);
    expect(await screen.findByRole("heading", { name: "Ton profil" })).toBeInTheDocument();
    const texte = screen.getByText(/Ces informations décrivent ton profil/);
    expect(texte).toHaveTextContent("donnent du contexte au Coach");
    expect(texte).toHaveTextContent("sans déterminer ta première charge aujourd’hui");
    expect(texte).not.toHaveTextContent(/cadrer les estimations|anthropométr|prior|modèle/i);
  });

  it("garde le CTA fixe, la safe area et les champs dans une surface défilante", async () => {
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 1 }));
    const profil = render(<PageBienvenue />);
    await screen.findByLabelText("Date de naissance");
    const footer = screen.getByTestId("onboarding-footer");
    const defilement = screen.getByTestId("onboarding-scroll");
    expect(footer).toHaveClass("fixed");
    expect(footer).not.toHaveClass("absolute");
    expect(footer.getAttribute("style")).toContain("safe-area-inset-bottom");
    expect(defilement).toHaveClass("overflow-y-auto", "overscroll-contain");
    for (const id of ["dateNaissance", "taille", "poids", "poidsDate"]) {
      expect(document.getElementById(id)?.closest("[data-testid='onboarding-scroll']")).toBe(defilement);
    }

    profil.unmount();
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 2 }));
    const experience = render(<PageBienvenue />);
    for (const id of ["annees", "interruption"]) {
      expect(document.getElementById(id)?.closest("[data-testid='onboarding-scroll']")).toBe(screen.getByTestId("onboarding-scroll"));
    }

    experience.unmount();
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 6, nouveauLieuNom: "" }));
    render(<PageBienvenue />);
    expect(document.getElementById("nouveauLieu")?.closest("[data-testid='onboarding-scroll']")).toBe(screen.getByTestId("onboarding-scroll"));
  });

  it("recentre un champ que le clavier place sous le footer", async () => {
    sessionStorage.setItem("sportperso:onboarding-v2", JSON.stringify({ ...base, etape: 1 }));
    render(<PageBienvenue />);
    const champ = await screen.findByLabelText("Dernier poids connu");
    const defiler = vi.fn();
    Object.defineProperty(champ, "scrollIntoView", { value: defiler });
    vi.spyOn(champ, "getBoundingClientRect").mockReturnValue({ top: 650, bottom: 700 } as DOMRect);
    vi.spyOn(screen.getByTestId("onboarding-footer"), "getBoundingClientRect").mockReturnValue({ top: 620 } as DOMRect);
    vi.useFakeTimers();
    try {
      fireEvent.focus(champ);
      vi.advanceTimersByTime(180);
      expect(defiler).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("détecte la contraction du visual viewport provoquée par le clavier", () => {
    expect(champMasqueParClavier({ champHaut: 500, champBas: 550, footerHaut: 800, viewportHaut: 0, viewportHauteur: 600 })).toBe(false);
    expect(champMasqueParClavier({ champHaut: 570, champBas: 620, footerHaut: 800, viewportHaut: 0, viewportHauteur: 600 })).toBe(true);
  });

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
