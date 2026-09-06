import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formaterCharge } from "@/components/session/ProgressionSummary";
import { estimer1RMDepuisRpe } from "@/lib/engine/records";

/**
 * L'écran « Séance terminée », tel qu'il était le 6 septembre.
 *
 * Trois choses fausses, sur le seul écran que l'on regarde vraiment après
 * l'effort :
 *
 *   - chaque ligne de la comparaison s'appelait « Exercice » ;
 *   - « 1RM 26.666666666666664 kg » ;
 *   - « 1RM » pour une première séance de calibration, où l'on ne teste aucun
 *     maximum.
 *
 * Les deux dernières se testent sur des valeurs. La première est une erreur de
 * PROVENANCE — le nom venait d'une route qui ne répond que s'il existe un
 * historique — et se teste donc sur la structure.
 */

const RACINE = path.resolve(import.meta.dirname, "..");
const source = readFileSync(
  path.join(RACINE, "components/session/ProgressionSummary.tsx"),
  "utf8",
);

describe("les chiffres se lisent", () => {
  it("un maximum estimé ne s'affiche jamais brut", () => {
    // La valeur exacte qui s'est affichée en production.
    const brut = 26.666666666666664;
    expect(formaterCharge(brut)).toBe("26,7");
    expect(formaterCharge(71.06666666666666)).toBe("71,1");
  });

  it("un nombre rond reste rond", () => {
    expect(formaterCharge(27)).toBe("27");
    expect(formaterCharge(50.0)).toBe("50");
  });

  it("un demi-kilo se garde", () => {
    // Les paliers d'une salle vont jusqu'au demi-kilogramme : arrondir à
    // l'entier effacerait une progression réelle.
    expect(formaterCharge(22.5)).toBe("22,5");
  });

  it("aucune valeur formatée ne porte plus de deux chiffres après la virgule", () => {
    const echantillon = [1 / 3, 2 / 3, 26.666666666666664, 71.06666666666666, 0.05];
    for (const v of echantillon) {
      expect(formaterCharge(v)).not.toMatch(/[.,]\d{2,}/);
    }
  });
});

describe("les noms des exercices", () => {
  it("viennent du parc, pas de l'historique", () => {
    // La cause exacte : `/api/sessions/last` rend `null` quand il n'y a pas eu
    // de séance précédente sur cette machine. En calibration, il n'y en a
    // jamais — donc toutes les lignes retombaient sur le littéral de repli.
    expect(source).toMatch(/\/api\/exercise-instances\?ids=/);
    expect(source).not.toMatch(/api\/sessions\/last/);
  });

  it("ne retombent plus sur le littéral « Exercice »", () => {
    // Un repli reste nécessaire, mais il doit se distinguer d'un vrai nom :
    // six lignes identiques ne se lisent pas comme un défaut d'affichage.
    expect(source).not.toMatch(/\?\?\s*"Exercice"/);
    expect(source).not.toMatch(/\|\|\s*"Exercice"/);
  });
});

describe("une première mesure est une baseline, pas un record", () => {
  it("l'écran distingue la première fois", () => {
    expect(source).toMatch(/premiereFois/);
    expect(source).toMatch(/Baseline enregistrée/);
  });

  it("et le dit avec la série réelle plutôt qu'avec un maximum", () => {
    // « 20 kg × 8 · ~2 en réserve » se vérifie devant la machine ; un 1RM
    // estimé à partir d'une série arrêtée loin de l'échec, non.
    expect(source).toMatch(/en réserve/);
  });
});

describe("les machines d'assistance", () => {
  it("n'affichent aucun maximum estimé", () => {
    expect(source).toMatch(/assistance\s*\n?\s*\?\s*null/);
  });

  it("le calcul standard dirait effectivement l'inverse de la vérité", () => {
    // La démonstration de pourquoi il ne faut pas l'afficher : sur le
    // Dip/Chin Assist, 64 kg d'aide sont PLUS faciles que 50, et pourtant le
    // maximum estimé monte avec la charge. L'afficher, c'est présenter un
    // recul comme un progrès.
    const beaucoupDAide = estimer1RMDepuisRpe(64, 8, 7);
    const moinsDAide = estimer1RMDepuisRpe(50, 8, 7);
    expect(beaucoupDAide).toBeGreaterThan(moinsDAide);
  });

  it("montrent la progression dans le bon sens", () => {
    expect(source).toMatch(/moins d&apos;aide, c&apos;est mieux/);
  });
});
