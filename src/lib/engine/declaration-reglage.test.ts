import { describe, it, expect } from "vitest";
import {
  cleDepuisLibelle, messageDeRefusDeclaration, validerDeclaration,
  LIBELLES_COURANTS, LIMITE_LIBELLE_REGLAGE, MAX_OPTIONS_REGLAGE,
} from "./declaration-reglage";
import { validerReglage, type DefinitionReglage } from "./execution";

/**
 * Déclarer un réglage sans inventer ce qu'on ne sait pas.
 *
 * Le risque de ce module n'est pas de refuser trop : c'est d'accepter en
 * comblant. Une borne posée par défaut se tient — « 1 à 10 », personne ne
 * proteste — et refuse ensuite un cran 12 pourtant réel, devant la machine, au
 * moment où l'on essaie de retenir quelque chose de vrai. La plupart des tests
 * ci-dessous vérifient donc une ABSENCE.
 */

const declaration = (partiel: Partial<Parameters<typeof validerDeclaration>[0]>) =>
  validerDeclaration({ libelle: "Siège", type: "cran", ...partiel });

describe("la clé dérivée du libellé", () => {
  it("est stable, sans accent ni espace", () => {
    expect(cleDepuisLibelle("Siège")).toBe("siege");
    expect(cleDepuisLibelle("Hauteur de poulie")).toBe("hauteur_de_poulie");
    expect(cleDepuisLibelle("Poignées d'assistance")).toBe("poignees_d_assistance");
  });

  it("ne garde ni tiret de tête ni tiret de queue", () => {
    expect(cleDepuisLibelle("  Siège !  ")).toBe("siege");
    expect(cleDepuisLibelle("— Dossier —")).toBe("dossier");
  });

  it("rend le vide plutôt qu'une clé de repli", () => {
    // Une clé inventée pour « ??? » entrerait en collision avec la prochaine,
    // et deux réglages distincts se retrouveraient à partager une valeur.
    expect(cleDepuisLibelle("???")).toBe("");
    expect(cleDepuisLibelle("   ")).toBe("");
  });

  it("distingue deux libellés qui ne diffèrent que par la casse ou l'accent", () => {
    // Ils ne les distinguent PAS, et c'est voulu : « Siège » et « siege » sont
    // le même réglage. L'index unique refusera le second.
    expect(cleDepuisLibelle("SIÈGE")).toBe(cleDepuisLibelle("siege"));
  });
});

describe("aucune borne n'est inventée", () => {
  it("un cran sans bornes est une déclaration parfaitement valide", () => {
    const v = declaration({ libelle: "Siège", type: "cran" });
    expect(v.valide).toBe(true);
    if (!v.valide) return;
    expect(v.declaration.min).toBeNull();
    expect(v.declaration.max).toBeNull();
  });

  it("une seule borne suffit : on a compté le bas, pas le haut", () => {
    const v = declaration({ type: "cran", min: "1", max: "" });
    expect(v.valide).toBe(true);
    if (!v.valide) return;
    expect(v.declaration.min).toBe(1);
    expect(v.declaration.max).toBeNull();
  });

  it("et un cran sans borne n'en refuse ensuite AUCUNE valeur", () => {
    // C'est la conséquence qui compte, et elle traverse deux modules : une
    // définition sans plage laisse `validerReglage` ne comparer rien. Un
    // « 1–10 » posé par défaut, lui, aurait rejeté ce 12.
    const v = declaration({ libelle: "Siège", type: "cran" });
    expect(v.valide).toBe(true);
    if (!v.valide) return;
    const def: DefinitionReglage = { ...v.declaration, ordre: 0 };
    expect(validerReglage(def, "12").valide).toBe(true);
    expect(validerReglage(def, "1").valide).toBe(true);
  });

  it("mais une borne posée est appliquée telle quelle", () => {
    const v = declaration({ type: "cran", min: "1", max: "10" });
    expect(v.valide).toBe(true);
    if (!v.valide) return;
    const def: DefinitionReglage = { ...v.declaration, ordre: 0 };
    expect(validerReglage(def, "12").valide).toBe(false);
  });

  it("les propositions de libellé ne portent ni borne ni option", () => {
    // Le garde-fou du raccourci : proposer « Siège, 1 à 10 » ferait exactement
    // ce que ce module refuse — donner à une supposition la forme d'une mesure.
    for (const p of LIBELLES_COURANTS) {
      expect(Object.keys(p).sort(), p.libelle).toEqual(["libelle", "type"]);
    }
  });
});

describe("ce qui est refusé, et pourquoi", () => {
  it("un nom vide", () => {
    expect(declaration({ libelle: "   " })).toMatchObject({
      valide: false, refus: { motif: "libelle_vide" },
    });
  });

  it("un nom sans la moindre lettre", () => {
    expect(declaration({ libelle: "???" })).toMatchObject({
      valide: false, refus: { motif: "libelle_sans_cle" },
    });
  });

  it("un nom trop long pour se relire entre deux séries", () => {
    expect(declaration({ libelle: "x".repeat(LIMITE_LIBELLE_REGLAGE + 1) })).toMatchObject({
      valide: false, refus: { motif: "libelle_trop_long" },
    });
  });

  it("un type qui n'existe pas", () => {
    expect(declaration({ type: "couleur" })).toMatchObject({
      valide: false, refus: { motif: "type_inconnu" },
    });
  });

  it("une borne illisible", () => {
    expect(declaration({ type: "cran", min: "beaucoup" })).toMatchObject({
      valide: false, refus: { motif: "borne_pas_un_nombre" },
    });
  });

  it("un cran à la demi-position", () => {
    expect(declaration({ type: "cran", max: "10.5" })).toMatchObject({
      valide: false, refus: { motif: "borne_non_entiere" },
    });
  });

  it("mais un angle à la demi-position est légitime", () => {
    expect(declaration({ libelle: "Inclinaison", type: "degres", max: "37.5" }).valide).toBe(true);
  });

  it("des bornes à l'envers", () => {
    expect(declaration({ type: "cran", min: "10", max: "1" })).toMatchObject({
      valide: false, refus: { motif: "bornes_inversees" },
    });
  });

  it("un choix qui ne propose rien", () => {
    // Une liste fermée vide n'est pas une liste fermée : c'est un champ que
    // rien ne peut satisfaire. Ici, exiger n'est PAS inventer — les positions
    // se lisent sur la machine.
    expect(declaration({ libelle: "Poignée", type: "choix", options: [] })).toMatchObject({
      valide: false, refus: { motif: "options_insuffisantes" },
    });
    expect(declaration({ libelle: "Poignée", type: "choix", options: ["neutre"] })).toMatchObject({
      valide: false, refus: { motif: "options_insuffisantes" },
    });
  });

  it("un choix qui se répète", () => {
    expect(declaration({
      libelle: "Poignée", type: "choix", options: ["neutre", "neutre"],
    })).toMatchObject({ valide: false, refus: { motif: "options_en_double" } });
  });

  it("un choix interminable", () => {
    expect(declaration({
      libelle: "Poignée", type: "choix",
      options: Array.from({ length: MAX_OPTIONS_REGLAGE + 1 }, (_, i) => `p${i}`),
    })).toMatchObject({ valide: false, refus: { motif: "options_trop_nombreuses" } });
  });

  it("chaque refus se dit en français, à la personne", () => {
    const refus = [
      { motif: "libelle_vide" }, { motif: "libelle_sans_cle" }, { motif: "type_inconnu" },
      { motif: "libelle_trop_long", limite: 40 }, { motif: "unite_trop_longue", limite: 8 },
      { motif: "borne_pas_un_nombre" }, { motif: "borne_non_entiere" },
      { motif: "bornes_inversees" }, { motif: "options_insuffisantes", minimum: 2 },
      { motif: "options_trop_nombreuses", maximum: 8 }, { motif: "option_trop_longue", limite: 24 },
      { motif: "options_en_double" }, { motif: "cle_existante", libelle: "Siège" },
    ] as const;
    for (const r of refus) {
      const message = messageDeRefusDeclaration(r);
      expect(message, r.motif).toMatch(/\S/);
      // Aucun motif technique ne doit fuiter dans un message d'écran.
      expect(message, r.motif).not.toContain("_");
    }
  });
});

describe("ce que la déclaration normalise", () => {
  it("les champs sans rapport avec le type ne sont pas stockés", () => {
    // Une borne envoyée avec un choix ne décrit rien ; la garder inviterait à
    // la lire un jour.
    const v = declaration({
      libelle: "Poignée", type: "choix", options: ["verticale", "neutre"],
      min: "1", max: "10",
    });
    expect(v.valide).toBe(true);
    if (!v.valide) return;
    expect(v.declaration.min).toBeNull();
    expect(v.declaration.max).toBeNull();
    expect(v.declaration.options).toEqual(["verticale", "neutre"]);
  });

  it("les espaces superflus du libellé disparaissent, la clé reste la même", () => {
    const v = declaration({ libelle: "  Hauteur   de  poulie " });
    expect(v.valide).toBe(true);
    if (!v.valide) return;
    expect(v.declaration.libelle).toBe("Hauteur de poulie");
    expect(v.declaration.cle).toBe("hauteur_de_poulie");
  });

  it("une unité vide reste absente plutôt que vide", () => {
    const v = declaration({ type: "cran", unite: "   " });
    expect(v.valide).toBe(true);
    if (!v.valide) return;
    expect(v.declaration.unite).toBeNull();
  });
});
