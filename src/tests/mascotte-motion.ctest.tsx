import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";

const moteur = vi.hoisted(() => ({ detruire: vi.fn(), animer: vi.fn() }));
vi.mock("@/lib/coach/mascotte-motion", () => ({
  animerMascotte: moteur.animer,
}));
import { MascotteCoach } from "@/components/coach/MascotteCoach";
import { RestTimer } from "@/components/session/RestTimer";
import { EnteteLive } from "@/components/session/EnteteLive";

beforeEach(() => {
  vi.clearAllMocks();
  moteur.animer.mockReturnValue({ detruire: moteur.detruire });
});

describe("animation de la mascotte dans les surfaces réelles", () => {
  it("le vrai minuteur de repos démarre le mouvement en format compact", () => {
    const { container } = render(<RestTimer durationSeconds={90} onComplete={vi.fn()} onSkip={vi.fn()} onExtend={vi.fn()} />);
    const img = container.querySelector('img[data-etat="repos"]')!;
    expect(img).toHaveStyle({ width: "40px" });
    expect(moteur.animer).toHaveBeenCalledExactlyOnceWith(img, img, "repos");
  });

  it("le vrai en-tête Live joue l'encouragement compact", () => {
    const { container } = render(<EnteteLive nom="Séance A" vue="focus" courant={0} etats={[]} etatMascotte="encouragement" onRetour={vi.fn()} onAides={vi.fn()} onDuree={vi.fn()} onTerminer={vi.fn()} onVue={vi.fn()} />);
    const img = container.querySelector('img[data-etat="encouragement"]')!;
    expect(moteur.animer).toHaveBeenCalledExactlyOnceWith(img, img, "encouragement");
  });
  it.each(["ready", "repos", "encouragement"] as const)("anime %s dès 72 px", (etat) => {
    const { container, unmount } = render(<MascotteCoach etat={etat} anime />);
    const img = container.querySelector("img")!;
    expect(moteur.animer).toHaveBeenCalledExactlyOnceWith(img, img, etat);
    expect(img).not.toHaveClass("mascotte-entre");
    expect(img.style.width).toBe("72px");
    unmount();
    expect(moteur.detruire).toHaveBeenCalledOnce();
  });

  it.each(["ready", "repos", "encouragement"] as const)("anime aussi %s à 40 px dans le Live", (etat) => {
    const { container } = render(<MascotteCoach etat={etat} presence="discrete" taille="compact" />);
    const img = container.querySelector("img")!;
    expect(moteur.animer).toHaveBeenCalledExactlyOnceWith(img, img, etat);
    expect(img.style.width).toBe("40px");
  });

  it.each(["calibration", "planification", "debrief", "attention", "training"] as const)("garde le dessin %s vivant", (etat) => {
    const { container } = render(<MascotteCoach etat={etat} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("data-etat", etat);
    expect(moteur.animer).toHaveBeenCalledExactlyOnceWith(img, img, "ready");
  });

  it("respecte la désactivation et laisse beast dormant", () => {
    const { rerender } = render(<MascotteCoach etat="beast" />);
    rerender(<MascotteCoach etat="ready" vivante={false} />);
    expect(moteur.animer).not.toHaveBeenCalled();
  });

  it("nettoie l'animation lorsqu'un changement d'état la rend inapplicable", () => {
    const { rerender, container } = render(<MascotteCoach etat="repos" />);
    rerender(<MascotteCoach etat="repos" vivante={false} />);
    expect(moteur.detruire).toHaveBeenCalledOnce();
    expect(container.querySelector("img")).not.toHaveAttribute("data-mouvement");
  });

  it("arrête l'animation et conserve le repli lors d'une image manquante", () => {
    const { container } = render(<MascotteCoach etat="ready" presence="forte" />);
    fireEvent.error(container.querySelector("img")!);
    expect(moteur.detruire).toHaveBeenCalledOnce();
    expect(container.querySelector(".mascotte-repli")).toHaveStyle({ width: "120px", height: "120px" });
  });
});
