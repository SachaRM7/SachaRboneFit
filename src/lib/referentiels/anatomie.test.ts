import { describe, it, expect } from "vitest";
import {
  FACES, REGIONS, REGIONS_PAR_ID,
  coteDeLaMoitieDroite, faceLaPlusParlante, musclesDesRegions, refleter,
  regionsDeLaFace, regionsSignalees, sollicitationDesRegions,
  zonesDesRegions, zonesSansRegion, musclesSansRegion,
} from "./anatomie";
import { MUSCLES, ZONES_DOULEUR, musclesDeLaZone } from "./muscles";
import { CATALOGUE } from "./catalogue";

/**
 * Le mannequin ne doit rien ajouter au vocabulaire, et ne rien en perdre.
 *
 * Deux risques opposés, et ce fichier surveille les deux. Perdre : une zone du
 * référentiel qu'aucune forme ne permet de désigner devient inatteignable —
 * l'athlète ne pourrait plus signaler ce qu'il pouvait signaler avec les
 * pastilles. Ajouter : une région qui ferait entrer dans le moteur un « genou
 * droit » que `contraintes.muscle` ne sait pas lire.
 */

describe("le référentiel est couvert, dans les deux sens", () => {
  it("les dix-sept zones de douleur sont toutes désignables", () => {
    expect(zonesSansRegion()).toEqual([]);
    expect(new Set(REGIONS.map((r) => r.zone)).size).toBe(ZONES_DOULEUR.length);
  });

  it("les quinze muscles sont tous représentables", () => {
    expect(musclesSansRegion()).toEqual([]);
  });

  it("tous les muscles réellement employés par le catalogue le sont aussi", () => {
    // Le garde qui compte vraiment : le catalogue est la source des exercices
    // affichés, et un muscle qu'il cite sans région resterait invisible.
    const employes = new Set(
      CATALOGUE.flatMap((e) => [...e.musclesPrincipaux, ...(e.musclesSecondaires ?? [])]),
    );
    const peints = new Set(REGIONS.flatMap((r) => [...r.muscles]));
    expect([...employes].filter((m) => !peints.has(m))).toEqual([]);
  });
});

describe("aucune clé inconnue n'entre dans le moteur", () => {
  it("chaque région pointe vers une zone du référentiel, jamais vers autre chose", () => {
    const connues = new Set<string>(ZONES_DOULEUR.map((z) => z.zone));
    for (const r of REGIONS) expect(connues.has(r.zone), r.id).toBe(true);
  });

  it("chaque muscle peint appartient au référentiel", () => {
    const connus = new Set<string>(MUSCLES);
    for (const r of REGIONS) {
      for (const m of r.muscles) expect(connus.has(m), `${r.id}/${m}`).toBe(true);
    }
  });

  it("une sélection ne produit que des muscles canoniques", () => {
    const connus = new Set<string>(MUSCLES);
    for (const m of musclesDesRegions(REGIONS.map((r) => r.id))) {
      expect(connus.has(m), m).toBe(true);
    }
  });

  it("un identifiant inventé est ignoré, jamais interprété", () => {
    expect(zonesDesRegions(["face:invente:gauche"])).toEqual([]);
    expect(musclesDesRegions(["", "n'importe quoi"])).toEqual([]);
    expect(regionsSignalees(["face:invente:gauche"])).toEqual([]);
  });
});

describe("la précision visuelle ne devient pas une précision médicale", () => {
  it("toucher le genou droit donne exactement ce que donnait « Genou »", () => {
    // La règle de tout le module : la région apporte le geste, la ZONE apporte
    // le sens. `[quadriceps, ischios]`, ni plus, ni moins.
    const genou = REGIONS.find((r) => r.id === "face:genou:droite")!;
    expect(genou.zone).toBe("Genou");
    expect(musclesDesRegions([genou.id]).sort()).toEqual(musclesDeLaZone("Genou").sort());
  });

  it("le côté et la face ne franchissent pas le pont vers le moteur", () => {
    const gauche = musclesDesRegions(["face:genou:gauche"]);
    const droite = musclesDesRegions(["face:genou:droite"]);
    const deDos = musclesDesRegions(["dos:genou:droite"]);
    expect(gauche).toEqual(droite);
    expect(droite).toEqual(deDos);
  });

  it("deux régions de la même zone n'en produisent qu'une", () => {
    expect(zonesDesRegions(["face:genou:gauche", "face:genou:droite"])).toEqual(["Genou"]);
  });

  it("une articulation n'est peinte par aucun exercice", () => {
    // On peut avoir mal au coude ; aucun exercice n'entraîne un coude. Sans
    // cette séparation, une gêne au genou allumerait les quadriceps sur la
    // fiche d'un curl.
    for (const id of ["face:genou:droite", "face:coude:droite", "face:poignet:droite",
      "face:cheville:droite", "face:hanche:droite"]) {
      expect(REGIONS_PAR_ID.get(id)!.muscles, id).toEqual([]);
    }
  });

  it("mais elle reste parfaitement signalable", () => {
    expect(musclesDesRegions(["face:coude:droite"]).length).toBeGreaterThan(0);
  });
});

describe("gauche et droite, devant et derrière", () => {
  it("vu de face, la moitié droite de l'image est le côté gauche de l'athlète", () => {
    expect(coteDeLaMoitieDroite("face")).toBe("gauche");
    expect(coteDeLaMoitieDroite("dos")).toBe("droite");
  });

  it("et la géométrie suit : la même forme change de côté selon la face", () => {
    // L'erreur qu'on commet devant un miroir, résolue ici plutôt que dans
    // chaque écran.
    const faceGauche = REGIONS_PAR_ID.get("face:epaule:gauche")!;
    const dosGauche = REGIONS_PAR_ID.get("dos:epaule:gauche")!;
    const x = (r: typeof faceGauche) =>
      r.forme.type === "ellipse" ? r.forme.cx : r.forme.x;
    expect(x(faceGauche)).toBeGreaterThan(60);
    expect(x(dosGauche)).toBeLessThan(60);
  });

  it("une région centrale n'a pas de côté", () => {
    for (const base of ["nuque", "abdomen", "lombaires", "haut-du-dos"]) {
      const centrale = REGIONS.filter((r) => r.id.includes(`:${base}:`));
      expect(centrale.length, base).toBeGreaterThan(0);
      for (const r of centrale) expect(r.cote, r.id).toBe("centre");
    }
  });

  it("le miroir est involutif et reste dans le cadre", () => {
    for (const r of REGIONS) {
      expect(refleter(refleter(r.forme))).toEqual(r.forme);
    }
  });

  it("chaque région latéralisée existe des deux côtés", () => {
    const laterales = REGIONS.filter((r) => r.cote !== "centre");
    for (const r of laterales) {
      const oppose = r.cote === "gauche" ? "droite" : "gauche";
      expect(REGIONS_PAR_ID.has(r.id.replace(`:${r.cote}`, `:${oppose}`)), r.id).toBe(true);
    }
  });

  it("les identifiants sont uniques et lisibles", () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
    for (const r of REGIONS) expect(r.id).toMatch(/^(face|dos):[a-z-]+:(gauche|droite|centre)$/);
  });

  it("chaque face porte de quoi désigner quelque chose", () => {
    for (const f of FACES) expect(regionsDeLaFace(f).length, f).toBeGreaterThan(5);
  });
});

describe("principaux et secondaires produisent deux niveaux distincts", () => {
  it("un développé couché montre les pectoraux plus fort que les triceps", () => {
    const par = sollicitationDesRegions(["pectoraux"], ["triceps", "epaules"]);
    expect(par.get("face:pectoraux:droite")).toBe("principal");
    expect(par.get("dos:triceps:droite")).toBe("secondaire");
    expect(par.get("face:epaule:droite")).toBe("secondaire");
    expect(par.get("dos:mollets:droite")).toBe("aucun");
  });

  it("les deux niveaux sont réellement différents, jamais confondus", () => {
    const par = sollicitationDesRegions(["dorsaux"], ["biceps"]);
    const niveaux = new Set([par.get("dos:dorsaux:gauche"), par.get("face:biceps:gauche")]);
    expect(niveaux.size).toBe(2);
  });

  it("un muscle à la fois principal et secondaire compte comme principal", () => {
    // Le catalogue en contient. Le minimiser ferait passer pour accessoire ce
    // que l'exercice vise réellement.
    const par = sollicitationDesRegions(["quadriceps"], ["quadriceps", "fessiers"]);
    expect(par.get("face:quadriceps:droite")).toBe("principal");
  });

  it("les deux côtés s'allument ensemble : le moteur ne connaît pas de latéralité", () => {
    const par = sollicitationDesRegions(["ischios"], []);
    expect(par.get("dos:ischios:gauche")).toBe("principal");
    expect(par.get("dos:ischios:droite")).toBe("principal");
  });

  it("sans muscle renseigné, rien ne s'allume", () => {
    const par = sollicitationDesRegions([], []);
    expect([...par.values()].every((v) => v === "aucun")).toBe(true);
  });
});

describe("la face ouverte est celle qui apprend quelque chose", () => {
  it("un tirage s'ouvre de dos", () => {
    expect(faceLaPlusParlante(["dorsaux"], ["biceps"])).toBe("dos");
  });

  it("un développé s'ouvre de face", () => {
    expect(faceLaPlusParlante(["pectoraux"], ["triceps"])).toBe("face");
  });

  it("et à défaut de quoi que ce soit, la face — la vue par défaut ailleurs", () => {
    expect(faceLaPlusParlante([], [])).toBe("face");
  });
});
