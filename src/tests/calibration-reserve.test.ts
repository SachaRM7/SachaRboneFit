import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { modeSaisieEffort, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";

/**
 * En calibration, on demande « Encore ? », jamais un RPE.
 *
 * Pendant la vraie calibration du 6 septembre, l'écran demandait bien combien
 * de répétitions il restait en réserve. Après la séance fantôme, le même
 * exercice affichait une colonne `RPE` — une échelle que personne n'a apprise,
 * au moment précis où l'on cherche ses premiers repères.
 *
 * La cause n'était pas dans la règle mais dans son acheminement : la phase du
 * cycle ne voyageait qu'avec le plan du jour. Ouverte par le repli — ce qui
 * était exactement le cas de la séance fantôme —, la séance arrivait sans
 * phase, et la comparaison écrite au milieu du rendu retombait sur « RPE ».
 */

const RACINE = path.resolve(import.meta.dirname, "..");
const lire = (f: string) => readFileSync(path.join(RACINE, f), "utf8");

describe("le mode de saisie de l'effort", () => {
  it("demande la réserve en calibration", () => {
    expect(modeSaisieEffort("calibration")).toBe("reserve");
  });

  it("demande le RPE le reste du temps", () => {
    expect(modeSaisieEffort("accumulation")).toBe("rpe");
    expect(modeSaisieEffort("deload")).toBe("rpe");
  });

  it("ne se trompe pas quand la phase est inconnue", () => {
    // Une phase absente n'est pas une calibration : le mode par défaut reste
    // celui du programme courant, et c'est l'ACHEMINEMENT de la phase que le
    // test ci-dessous surveille.
    expect(modeSaisieEffort(null)).toBe("rpe");
    expect(modeSaisieEffort(undefined)).toBe("rpe");
  });
});

describe("la conversion interne reste inchangée", () => {
  it("trois répétitions en réserve valent RPE 7", () => {
    // RPE_CALIBRATION = 7, soit ~3 RIR. La saisie change de langue, pas de
    // valeur : ce qui part en base est le même nombre qu'avant.
    expect(reserveVersRpe(3)).toBe(7);
    expect(rpeVersReserve(7)).toBe(3);
  });
});

describe("la phase du cycle atteint l'écran par tous les chemins", () => {
  it("le repli du gabarit la transmet", () => {
    // C'est LA correction : sans cette ligne, une calibration ouverte
    // autrement que par le plan du jour réclame un RPE brut.
    const route = lire("app/api/sessions/[id]/route.ts");
    expect(route).toMatch(/phaseCycle:\s*bloc\.typeCycle/);
  });

  it("l'écran de séance la lit du repli comme du plan", () => {
    const ecran = lire("app/(app)/sessions/new/[templateId]/page.tsx");
    // Deux occurrences attendues : la branche du plan, et celle du repli.
    const occurrences = ecran.match(/phaseCycle:/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("l'écran passe par la règle plutôt que par une comparaison écrite à la main", () => {
    const ecran = lire("app/(app)/sessions/new/[templateId]/page.tsx");
    expect(ecran).toMatch(/modeSaisieEffort\(seance\.phaseCycle\)/);
  });
});
