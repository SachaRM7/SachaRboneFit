import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";

const moteur = vi.hoisted(() => ({ detruire: vi.fn(), animer: vi.fn() }));
vi.mock("@/lib/coach/mascotte-motion", () => ({
  animerMascotte: moteur.animer,
}));
import { MascotteCoach } from "@/components/coach/MascotteCoach";

beforeEach(() => {
  vi.clearAllMocks();
  moteur.animer.mockReturnValue({ detruire: moteur.detruire });
});

describe("animation de la mascotte dans les surfaces réelles", () => {
  it.each(["ready", "repos", "encouragement"] as const)("anime %s dès 72 px", (etat) => {
    const { container, unmount } = render(<MascotteCoach etat={etat} anime />);
    const img = container.querySelector("img")!;
    expect(moteur.animer).toHaveBeenCalledExactlyOnceWith(img, img, etat);
    expect(img).not.toHaveClass("mascotte-entre");
    expect(img.style.width).toBe("72px");
    unmount();
    expect(moteur.detruire).toHaveBeenCalledOnce();
  });

  it("ne déclenche rien pour les petits formats et les états non prévus", () => {
    const { rerender } = render(<MascotteCoach etat="ready" presence="discrete" />);
    rerender(<MascotteCoach etat="ready" vivante={false} />);
    rerender(<MascotteCoach etat="attention" />);
    rerender(<MascotteCoach etat="training" />);
    expect(moteur.animer).not.toHaveBeenCalled();
  });

  it("nettoie l'animation lorsqu'un changement d'état la rend inapplicable", () => {
    const { rerender, container } = render(<MascotteCoach etat="repos" />);
    rerender(<MascotteCoach etat="attention" />);
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
