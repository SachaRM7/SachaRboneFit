import { describe, it, expect } from "vitest";
import { resoudrePourSalle, type InstanceResolvable } from "./resolution-salle";

const inst = (
  id: string,
  gymId: string,
  exerciseId: string,
  pilier: string,
  profilTension: string,
  categorieRole: InstanceResolvable["categorieRole"],
  muscles: string[] = ["pectoraux"],
): InstanceResolvable => ({
  id, gymId, exerciseId,
  machineNom: `machine-${id}`,
  exerciceNom: `exo-${exerciseId}`,
  pilier, profilTension, categorieRole,
  musclesPrincipaux: muscles,
  equipement: "machine",
  incrementsPossibles: [5],
});

const prevuLalande = inst("l-chest", "lalande", "chest-press", "P1_poussee", "mi_range", "pilier");

describe("résolution vers la salle du jour", () => {
  it("même salle, même machine : rien ne change", () => {
    const r = resoudrePourSalle(prevuLalande, [prevuLalande]);
    expect(r.niveau).toBe("identique");
    expect(r.instance?.id).toBe("l-chest");
    expect(r.raison).toBeNull();
  });

  it("le même exercice existe ailleurs : on garde l'exercice, on change de machine", () => {
    const parc = [inst("s-chest", "sesquiere", "chest-press", "P1_poussee", "mi_range", "pilier")];
    const r = resoudrePourSalle(prevuLalande, parc);
    expect(r.niveau).toBe("meme_exercice");
    expect(r.instance?.id).toBe("s-chest");
    expect(r.raison).toContain("machine-s-chest");
  });

  it("exercice absent : substitut de même pilier et même profil de tension", () => {
    const parc = [
      inst("s-bench", "sesquiere", "bench-press", "P1_poussee", "mi_range", "substitut"),
      inst("s-fly", "sesquiere", "pec-deck", "P1_poussee", "stretch", "accessoire"),
    ];
    const r = resoudrePourSalle(prevuLalande, parc);
    expect(r.niveau).toBe("profil_identique");
    expect(r.instance?.id).toBe("s-bench");
  });

  it("privilégie un pilier sur un accessoire à profil égal", () => {
    const parc = [
      inst("s-acc", "sesquiere", "a", "P1_poussee", "mi_range", "accessoire"),
      inst("s-pil", "sesquiere", "b", "P1_poussee", "mi_range", "pilier"),
    ];
    expect(resoudrePourSalle(prevuLalande, parc).instance?.id).toBe("s-pil");
  });

  it("à défaut, retombe sur le même pilier avec un profil différent", () => {
    const parc = [inst("s-fly", "sesquiere", "pec-deck", "P1_poussee", "stretch", "accessoire")];
    const r = resoudrePourSalle(prevuLalande, parc);
    expect(r.niveau).toBe("meme_pilier");
    expect(r.instance?.id).toBe("s-fly");
  });

  it("ne propose jamais un exercice d'un autre pilier", () => {
    const parc = [inst("s-row", "sesquiere", "row", "P2_tirage", "mi_range", "pilier", ["dorsaux"])];
    const r = resoudrePourSalle(prevuLalande, parc);
    expect(r.niveau).toBe("indisponible");
    expect(r.instance).toBeNull();
  });

  it("salle vide : indisponible plutôt qu'une machine inexistante", () => {
    const r = resoudrePourSalle(prevuLalande, []);
    expect(r.niveau).toBe("indisponible");
    expect(r.instance).toBeNull();
    expect(r.raison).toContain("Aucun équivalent");
  });

  it("ne propose pas deux fois la même machine dans une séance", () => {
    const parc = [
      inst("s-bench", "sesquiere", "bench-press", "P1_poussee", "mi_range", "pilier"),
      inst("s-incline", "sesquiere", "incline", "P1_poussee", "mi_range", "substitut"),
    ];
    const r = resoudrePourSalle(prevuLalande, parc, ["s-bench"]);
    expect(r.instance?.id).toBe("s-incline");
  });

  it("écarte les exercices sollicitant un muscle à éviter, malgré les vocabulaires différents", () => {
    // La contrainte est saisie "Pectoraux", l'instance porte "pectoraux".
    const parc = [inst("s-bench", "sesquiere", "bench-press", "P1_poussee", "mi_range", "pilier", ["pectoraux"])];
    const r = resoudrePourSalle(prevuLalande, parc, [], ["Pectoraux"]);
    expect(r.niveau).toBe("indisponible");
  });

  it("garde un exercice dont les muscles ne sont pas concernés par la contrainte", () => {
    const parc = [inst("s-bench", "sesquiere", "bench-press", "P1_poussee", "mi_range", "pilier", ["pectoraux"])];
    const r = resoudrePourSalle(prevuLalande, parc, [], ["Ischio-jambiers"]);
    expect(r.instance?.id).toBe("s-bench");
  });
});
