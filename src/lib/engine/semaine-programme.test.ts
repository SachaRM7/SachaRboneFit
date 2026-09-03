import { describe, it, expect } from "vitest";
import {
  positionDansLeCycle,
  semaineDuProgramme,
  dechargeJustifiee,
  type GabaritSeance,
} from "./semaine-programme";
import { libelleCycle } from "@/lib/referentiels/cycle";

/** Lundi 3 août 2026. */
const AUJOURDHUI = "2026-08-03";

const gabarit = (id: string, ordre: number, exercices = 5): GabaritSeance => ({
  id,
  lettre: id.toUpperCase(),
  nom: `Séance ${id.toUpperCase()}`,
  ordreDansSemaine: ordre,
  exercices: Array.from({ length: exercices }, () => ({
    series: 3,
    reposSecondes: 120,
    pilier: "P1_poussee",
  })),
});

describe("position dans le cycle", () => {
  it("compte en semaines entamées depuis le début", () => {
    expect(positionDansLeCycle("2026-08-03", null, "2026-08-03").semaine).toBe(1);
    expect(positionDansLeCycle("2026-08-03", null, "2026-08-09").semaine).toBe(1);
    expect(positionDansLeCycle("2026-08-03", null, "2026-08-10").semaine).toBe(2);
    expect(positionDansLeCycle("2026-07-13", null, AUJOURDHUI).semaine).toBe(4);
  });

  it("fait passer un cycle commencé en milieu de semaine en semaine 2 le lundi", () => {
    // Un cycle démarré le jeudi n'est pas « en semaine 1 » cinq jours plus
    // tard : un programme se lit par semaines calendaires.
    expect(positionDansLeCycle("2026-07-30", null, "2026-08-03").semaine).toBe(2);
  });

  it("refuse d'annoncer un total quand la date de fin est absente", () => {
    // `date_fin_prevue` n'est renseignée par aucun écran : « semaine 3 sur 6 »
    // serait inventé.
    const p = positionDansLeCycle("2026-07-13", null, AUJOURDHUI);
    expect(p.semainesTotal).toBeNull();
    expect(p.avancement).toBeNull();
    expect(p.termine).toBe(false);
  });

  it("calcule le total et l'avancement quand la date de fin existe", () => {
    // Du lundi 13 juillet au dimanche 23 août : six semaines calendaires.
    const p = positionDansLeCycle("2026-07-13", "2026-08-23", AUJOURDHUI);
    expect(p.semainesTotal).toBe(6);
    expect(p.semaine).toBe(4);
    expect(p.avancement).toBeCloseTo(4 / 6, 3);
    expect(p.termine).toBe(false);
  });

  it("signale un cycle dont la date de fin est passée", () => {
    const p = positionDansLeCycle("2026-06-01", "2026-07-26", AUJOURDHUI);
    expect(p.termine).toBe(true);
    // La semaine affichée ne dépasse jamais le total.
    expect(p.semaine).toBe(p.semainesTotal);
  });

  it("ne descend jamais sous la semaine 1, même pour un cycle futur", () => {
    expect(positionDansLeCycle("2026-09-01", null, AUJOURDHUI).semaine).toBe(1);
  });
});

describe("semaine du programme", () => {
  const gabarits = [gabarit("a", 1), gabarit("b", 2), gabarit("c", 3)];

  it("marque la première séance non faite comme prochaine, les autres à venir", () => {
    const s = semaineDuProgramme({ gabarits, seancesFaites: [], aujourdhui: AUJOURDHUI });
    expect(s.map((x) => x.etat)).toEqual(["prochaine", "a_venir", "a_venir"]);
  });

  it("ne prétend jamais qu'une séance a lieu aujourd'hui sans preuve", () => {
    // Rien dans le modèle n'attribue un jour à une séance : la prochaine est
    // « prochaine », pas « aujourd'hui ».
    const s = semaineDuProgramme({ gabarits, seancesFaites: [], aujourdhui: AUJOURDHUI });
    expect(s.some((x) => x.etat === "faite_aujourdhui")).toBe(false);
  });

  it("reconnaît une séance terminée cette semaine", () => {
    const s = semaineDuProgramme({
      gabarits,
      seancesFaites: [{ seanceTemplateId: "a", date: "2026-08-04", adaptee: false }],
      aujourdhui: "2026-08-05",
    });
    expect(s[0]!.etat).toBe("terminee");
    expect(s[0]!.faiteLe).toBe("2026-08-04");
    expect(s[1]!.etat).toBe("prochaine");
  });

  it("distingue une séance adaptée d'une séance terminée telle quelle", () => {
    const s = semaineDuProgramme({
      gabarits,
      seancesFaites: [{ seanceTemplateId: "a", date: "2026-08-04", adaptee: true }],
      aujourdhui: "2026-08-05",
    });
    // L'adaptation est un fait à part, pas un état : la séance reste terminée.
    expect(s[0]!.etat).toBe("terminee");
    expect(s[0]!.adaptee).toBe(true);
  });

  it("n'efface pas l'adaptation d'une séance faite aujourd'hui", () => {
    // Les deux tenaient dans la même alternative, la date passant en premier :
    // une séance adaptée le jour même ressortait « aujourd'hui », et le fait
    // qu'un exercice ait été remplacé disparaissait de l'écran.
    const s = semaineDuProgramme({
      gabarits,
      seancesFaites: [{ seanceTemplateId: "a", date: AUJOURDHUI, adaptee: true }],
      aujourdhui: AUJOURDHUI,
    });
    expect(s[0]!.etat).toBe("faite_aujourdhui");
    expect(s[0]!.adaptee).toBe(true);
  });

  it("une séance non faite n'est jamais dite adaptée", () => {
    const s = semaineDuProgramme({ gabarits, seancesFaites: [], aujourdhui: AUJOURDHUI });
    expect(s.every((x) => x.adaptee === false)).toBe(true);
  });

  it("dit « aujourd'hui » seulement pour une séance enregistrée aujourd'hui", () => {
    const s = semaineDuProgramme({
      gabarits,
      seancesFaites: [{ seanceTemplateId: "b", date: AUJOURDHUI, adaptee: false }],
      aujourdhui: AUJOURDHUI,
    });
    expect(s[1]!.etat).toBe("faite_aujourdhui");
  });

  it("ignore les séances des semaines précédentes", () => {
    // Lundi : la semaine repart de zéro, même si tout a été fait la veille.
    const s = semaineDuProgramme({
      gabarits,
      seancesFaites: [
        { seanceTemplateId: "a", date: "2026-08-02", adaptee: false },
        { seanceTemplateId: "b", date: "2026-07-30", adaptee: false },
      ],
      aujourdhui: AUJOURDHUI,
    });
    expect(s.map((x) => x.etat)).toEqual(["prochaine", "a_venir", "a_venir"]);
  });

  it("ignore une séance libre, non rattachée à un gabarit", () => {
    const s = semaineDuProgramme({
      gabarits,
      seancesFaites: [{ seanceTemplateId: null, date: AUJOURDHUI, adaptee: false }],
      aujourdhui: AUJOURDHUI,
    });
    expect(s.map((x) => x.etat)).toEqual(["prochaine", "a_venir", "a_venir"]);
  });

  it("compte les exercices et estime la durée avec le calcul du validateur", () => {
    const s = semaineDuProgramme({ gabarits, seancesFaites: [], aujourdhui: AUJOURDHUI });
    expect(s[0]!.exercices).toBe(5);
    // 5 × (120 s d'installation + 3 × 45 s + 2 × 120 s de repos) = 2475 s.
    expect(s[0]!.dureeEstimeeMinutes).toBe(41);
    expect(s[0]!.piliers).toEqual(["P1_poussee"]);
  });

  it("respecte l'ordre dans la semaine, quel que soit l'ordre reçu", () => {
    const s = semaineDuProgramme({
      gabarits: [gabarit("c", 3), gabarit("a", 1), gabarit("b", 2)],
      seancesFaites: [],
      aujourdhui: AUJOURDHUI,
    });
    expect(s.map((x) => x.templateId)).toEqual(["a", "b", "c"]);
  });

  it("ne renvoie rien quand le cycle n'a aucun gabarit", () => {
    expect(semaineDuProgramme({ gabarits: [], seancesFaites: [], aujourdhui: AUJOURDHUI })).toEqual([]);
  });
});

describe("décharge", () => {
  it("refuse une décharge justifiée par le seul calendrier", () => {
    // Le moteur conseille une décharge dès six semaines sans décharge. Sans
    // aucun signal du corps, ce n'est pas une alerte : c'est une date.
    expect(
      dechargeJustifiee({
        dechargeConseillee: true,
        statutFatigue: "basse",
        tendancePerformance: "stable",
        douleurSignalee: false,
      }),
    ).toBe(false);
  });

  it("retient une décharge appuyée sur la fatigue, la performance ou la douleur", () => {
    const base = {
      dechargeConseillee: true,
      statutFatigue: "attendue",
      tendancePerformance: "stable",
      douleurSignalee: false,
    };
    expect(dechargeJustifiee({ ...base, statutFatigue: "elevee_anormale" })).toBe(true);
    expect(dechargeJustifiee({ ...base, tendancePerformance: "baisse" })).toBe(true);
    expect(dechargeJustifiee({ ...base, douleurSignalee: true })).toBe(true);
  });

  it("ne recommande rien quand le moteur ne conseille pas de décharge", () => {
    expect(
      dechargeJustifiee({
        dechargeConseillee: false,
        statutFatigue: "elevee_anormale",
        tendancePerformance: "baisse",
        douleurSignalee: true,
      }),
    ).toBe(false);
  });

  it("ne confond pas une fatigue élevée attendue avec une anomalie", () => {
    // En surcharge planifiée, la fatigue élevée est le but du cycle.
    expect(
      dechargeJustifiee({
        dechargeConseillee: true,
        statutFatigue: "elevee_attendue",
        tendancePerformance: "stable",
        douleurSignalee: false,
      }),
    ).toBe(false);
  });
});

describe("vocabulaire des cycles", () => {
  it("nomme la calibration pour ce qu'elle est", () => {
    const c = libelleCycle("calibration");
    expect(c.libelle).toBe("Reprise & calibration");
    expect(c.intention).toMatch(/j'apprends/i);
    expect(c.herite).toBe(false);
  });

  it("traduit les dominantes du modèle actuel", () => {
    expect(libelleCycle("volume").libelle).toBe("Dominante volume");
    expect(libelleCycle("proximite_echec").herite).toBe(false);
  });

  it("rend lisibles les anciennes valeurs sans les réécrire, et les marque", () => {
    // « mecanique » et « metabolique » viennent d'un modèle abandonné : on les
    // traduit pour rester lisible, on les marque pour ne pas présenter une
    // interprétation rétrospective comme une certitude.
    expect(libelleCycle("mecanique")).toEqual({
      libelle: "Dominante charge",
      intention: expect.any(String),
      herite: true,
    });
    expect(libelleCycle("metabolique").libelle).toBe("Dominante volume");
    expect(libelleCycle("metabolique").herite).toBe(true);
  });

  it("n'affiche jamais une valeur inconnue telle quelle", () => {
    const c = libelleCycle("bloc_perso_ete");
    expect(c.libelle).toBe("Bloc perso ete");
    expect(c.herite).toBe(true);
    expect(c.intention).toBeNull();
  });

  it("se contente d'un libellé neutre sans type de cycle", () => {
    expect(libelleCycle(null).libelle).toBe("Cycle en cours");
    expect(libelleCycle("").herite).toBe(false);
  });
});

describe("phase depuis le type de cycle", () => {
  it("reconnaît les dominantes actuelles comme de l'accumulation", async () => {
    // Sans cette correspondance explicite, un cycle « volume » retombait sur
    // `hors_cycle` — ce qui change le seuil de récupération et les règles de
    // décharge. La phase décide de comportements : elle ne peut pas dépendre
    // d'une recherche de sous-chaîne.
    const { phaseDepuisTypeCycle } = await import("@/services/cycle");
    for (const d of ["charge", "volume", "densite", "proximite_echec"]) {
      expect(phaseDepuisTypeCycle(d)).toBe("accumulation");
    }
  });

  it("distingue décharge et surcharge de la dominante « charge »", async () => {
    const { phaseDepuisTypeCycle } = await import("@/services/cycle");
    expect(phaseDepuisTypeCycle("decharge")).toBe("decharge");
    expect(phaseDepuisTypeCycle("deload")).toBe("decharge");
    expect(phaseDepuisTypeCycle("surcharge")).toBe("surcharge");
    expect(phaseDepuisTypeCycle("charge")).toBe("accumulation");
  });

  it("garde les correspondances héritées et retombe sur hors_cycle", async () => {
    const { phaseDepuisTypeCycle } = await import("@/services/cycle");
    expect(phaseDepuisTypeCycle("mecanique")).toBe("accumulation");
    expect(phaseDepuisTypeCycle("calibration")).toBe("hors_cycle");
    expect(phaseDepuisTypeCycle(null)).toBe("hors_cycle");
  });
});
