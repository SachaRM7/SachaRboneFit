import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useGlisserPourFermer } from "@/components/ui/useGlisserPourFermer";

function Feuille({ onFermer }: { onFermer: () => void }) {
  const glisse = useGlisserPourFermer<HTMLDivElement>(onFermer);
  return (
    <div ref={glisse} data-testid="panneau">
      <div data-testid="contenu" style={{ overflowY: "auto" }}>Contenu</div>
      <input aria-label="Charge" />
    </div>
  );
}

const toucher = (el: Element, type: string, y: number) => {
  const evenement = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: { clientY: number }[] };
  Object.defineProperty(evenement, "touches", { value: type === "touchend" ? [] : [{ clientY: y }] });
  el.dispatchEvent(evenement);
};

const tirer = (el: Element, jusque: number) => {
  toucher(el, "touchstart", 100);
  for (let y = 110; y <= 100 + jusque; y += 30) toucher(el, "touchmove", y);
  toucher(el, "touchmove", 100 + jusque);
  toucher(el, "touchend", 100 + jusque);
};

afterEach(() => vi.useRealTimers());

describe("tirer une feuille vers le bas", () => {
  it("la ferme au-delà du seuil", () => {
    vi.useFakeTimers();
    const onFermer = vi.fn();
    render(<Feuille onFermer={onFermer} />);
    tirer(screen.getByTestId("contenu"), 200);
    act(() => { vi.advanceTimersByTime(300); });
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it("revient en place pour un petit geste", () => {
    vi.useFakeTimers();
    const onFermer = vi.fn();
    render(<Feuille onFermer={onFermer} />);
    tirer(screen.getByTestId("contenu"), 35);
    act(() => { vi.advanceTimersByTime(300); });
    expect(onFermer).not.toHaveBeenCalled();
    expect(screen.getByTestId("panneau").style.transform).toBe("");
  });

  it("laisse défiler un contenu qui n'est pas en haut, et ignore les champs", () => {
    vi.useFakeTimers();
    const onFermer = vi.fn();
    render(<Feuille onFermer={onFermer} />);
    const contenu = screen.getByTestId("contenu");
    contenu.scrollTop = 40;
    Object.defineProperty(contenu, "scrollTop", { value: 40 });
    tirer(contenu, 200);
    tirer(screen.getByLabelText("Charge"), 200);
    act(() => { vi.advanceTimersByTime(300); });
    expect(onFermer).not.toHaveBeenCalled();
  });
});
