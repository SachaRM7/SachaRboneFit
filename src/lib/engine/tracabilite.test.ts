import { describe, it, expect } from "vitest";
import {
  exercicePrevu,
  exerciceEffectue,
  estUneSubstitution,
  empecheParLesCirconstances,
  raconterSubstitution,
  joursEmpeches,
  semainesEmpechees,
  type LigneTracee,
} from "./tracabilite";

const ligne = (patch: Partial<LigneTracee> = {}): LigneTracee => ({
  exerciseInstanceId: "fait",
  exerciseInstancePrevuId: null,
  raisonSubstitution: null,
  contexteAdaptation: null,
  ...patch,
});

describe("prévu, effectué, et l'écart entre les deux", () => {
  it("distingue ce qui devait être fait de ce qui l'a été", () => {
    const l = ligne({ exerciseInstancePrevuId: "developpe", exerciseInstanceId: "pompes" });
    expect(exercicePrevu(l)).toBe("developpe");
    expect(exerciceEffectue(l)).toBe("pompes");
    expect(estUneSubstitution(l)).toBe(true);
  });

  it("ne voit pas de substitution là où il n'y en a pas", () => {
    expect(estUneSubstitution(ligne())).toBe(false);
    expect(estUneSubstitution(ligne({ exerciseInstancePrevuId: "fait" }))).toBe(false);
  });

  it("retombe sur l'exercice actuel quand rien n'était noté", () => {
    // Les séances antérieures à cette traçabilité n'ont pas de prévu.
    expect(exercicePrevu(ligne())).toBe("fait");
  });
});

describe("empêchement par les circonstances", () => {
  const substituee = (type?: string) =>
    ligne({
      exerciseInstancePrevuId: "developpe",
      exerciseInstanceId: "pompes",
      contexteAdaptation: type ? ({ type } as never) : null,
    });

  it("reconnaît un changement de lieu, un matériel absent, une machine occupée", () => {
    for (const t of ["changement_lieu", "materiel_absent", "machine_occupee"]) {
      expect(empecheParLesCirconstances(substituee(t)), t).toBe(true);
    }
  });

  it("ne couvre pas un remplacement fait par préférence", () => {
    // Choisir un autre exercice sans raison extérieure reste une occasion
    // manquée sur l'exercice prévu.
    expect(empecheParLesCirconstances(substituee("autre"))).toBe(false);
  });

  it("dans le doute, ne reproche rien", () => {
    // Une substitution sans contexte enregistré — les anciennes — est traitée
    // comme un empêchement plutôt que comme un échec.
    expect(empecheParLesCirconstances(substituee())).toBe(true);
  });

  it("ne s'applique jamais à une ligne non substituée", () => {
    expect(empecheParLesCirconstances(ligne())).toBe(false);
  });
});

describe("récit destiné à l'utilisateur", () => {
  it("préfère la raison enregistrée", () => {
    const l = ligne({
      exerciseInstancePrevuId: "a",
      exerciseInstanceId: "b",
      raisonSubstitution: "Développé indisponible à Maison — mêmes muscles",
    });
    expect(raconterSubstitution(l, "Développé", "Pompes")).toMatch(/indisponible à Maison/);
  });

  it("reconstitue une phrase à partir du contexte quand la raison manque", () => {
    const l = ligne({
      exerciseInstancePrevuId: "a",
      exerciseInstanceId: "b",
      contexteAdaptation: { type: "changement_lieu", lieuApresNom: "Maison" },
    });
    expect(raconterSubstitution(l, "Développé", "Pompes")).toBe(
      "Développé indisponible à Maison — remplacé par Pompes.",
    );
  });

  it("ne raconte rien quand rien n'a changé", () => {
    expect(raconterSubstitution(ligne(), "Développé", "Développé")).toBeNull();
  });
});

describe("semaines pendant lesquelles un exercice n'a pas pu être proposé", () => {
  it("ne retient que les lignes réellement empêchées", () => {
    const empeches = joursEmpeches([
      { ...ligne({ exerciseInstancePrevuId: "dev", exerciseInstanceId: "pompes", contexteAdaptation: { type: "changement_lieu" } }), date: "2026-09-01" },
      { ...ligne(), date: "2026-09-02" },
      { ...ligne({ exerciseInstancePrevuId: "dev", exerciseInstanceId: "autre", contexteAdaptation: { type: "autre" } }), date: "2026-09-03" },
    ]);
    expect(empeches).toEqual([{ instanceId: "dev", date: "2026-09-01" }]);
  });

  it("compte les semaines, pas les occurrences", () => {
    // Deux séances empêchées la même semaine ne valent pas deux semaines.
    expect(semainesEmpechees(["2026-09-01", "2026-09-03"])).toBe(1);
    expect(semainesEmpechees(["2026-09-01", "2026-09-08"])).toBe(2);
    expect(semainesEmpechees([])).toBe(0);
  });

  it("rattache le dimanche à sa semaine, pas à la suivante", () => {
    // 2026-09-06 est un dimanche, 2026-09-07 le lundi suivant.
    expect(semainesEmpechees(["2026-09-01", "2026-09-06"])).toBe(1);
    expect(semainesEmpechees(["2026-09-06", "2026-09-07"])).toBe(2);
  });
});
