import { describe, expect, it } from "vitest";
import { lireTempo, phasesDuTempo, tempoAvecSecondes, tempoEnLangageHumain } from "./execution";

const tempo = lireTempo("3-0-1-0")!;

describe("tempo en langage humain", () => {
  it("conserve les quatre temps et rend les secondes explicites", () => {
    const phases = phasesDuTempo(tempo);
    expect(tempoAvecSecondes(phases)).toBe("3 s · 0 s · 1 s · 0 s");
  });

  it("traduit une Leg Press à partir des phases propres au mouvement", () => {
    const phases = phasesDuTempo(tempo, {
      excentrique: "Descends le chariot",
      pause_etire: "Reste en bas",
      concentrique: "Pousse le chariot",
      pause_contracte: "Garde les jambes presque tendues",
    });
    expect(tempoEnLangageHumain(phases)).toBe(
      "Descends le chariot en 3 secondes, sans pause, puis pousse le chariot en 1 seconde, sans pause en fin de répétition.",
    );
  });

  it("décrit un rowing horizontal sans inventer une montée ou une descente", () => {
    const phases = phasesDuTempo(lireTempo("2-0-1-1")!, {
      excentrique: "Laisse les bras revenir vers l'avant",
      concentrique: "Tire les coudes vers l'arrière",
      pause_contracte: "Tiens le dos contracté",
    });
    const phrase = tempoEnLangageHumain(phases)!;
    expect(phrase).toContain("revenir vers l'avant en 2 secondes");
    expect(phrase).toContain("tire les coudes vers l'arrière en 1 seconde");
    expect(phrase).not.toMatch(/monte|descends/i);
  });

  it("reste générique quand la fiche ne sait pas nommer le geste", () => {
    expect(tempoEnLangageHumain(phasesDuTempo(tempo))).toBeNull();
  });
});
