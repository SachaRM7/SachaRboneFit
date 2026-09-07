import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FICHES_TECHNIQUES, TEMPOS_PAR_DEFAUT } from "./fiches-techniques";
import { CATALOGUE_PAR_SLUG } from "./catalogue";
import { ficheRenseignee, lireTempo, TEMPO_CANONIQUE } from "@/lib/engine/execution";

/**
 * Ce qu'on écrit dans une fiche, et surtout ce qu'on n'y écrit pas.
 *
 * Le risque de ce fichier n'est pas d'oublier une rubrique : c'est d'y glisser
 * un chiffre. « Siège 5 » est vrai d'UNE machine et d'UN corps ; posé dans une
 * fiche commune, il devient faux pour tous les autres appareils et pour toutes
 * les autres personnes, avec l'autorité d'une consigne. Ces valeurs
 * appartiennent aux `instance_reglages` de la PR #12, et une rédaction les
 * laisse passer sans qu'on y pense.
 */

const SLUGS = Object.keys(FICHES_TECHNIQUES);

/** Tout le texte d'une fiche, rubriques et listes confondues. */
function texteDe(slug: string): string {
  const f = FICHES_TECHNIQUES[slug]!;
  return [
    f.description, f.installation, f.positionDepart, f.execution, f.amplitude,
    f.respiration, f.sensation, f.securite,
    ...(f.pointsCles ?? []), ...(f.erreursFrequentes ?? []),
  ].filter(Boolean).join(" ");
}

describe("les fiches rejoignent le catalogue", () => {
  it("chaque slug existe réellement", () => {
    // Une clé mal orthographiée produirait une fiche que rien ne lirait, et
    // rien ne le dirait : le seed la sauterait en silence.
    const inconnus = SLUGS.filter((s) => !CATALOGUE_PAR_SLUG.has(s));
    expect(inconnus).toEqual([]);
  });

  it("chaque tempo spécifique porte aussi sur un slug du catalogue", () => {
    expect(Object.keys(TEMPOS_PAR_DEFAUT).filter((s) => !CATALOGUE_PAR_SLUG.has(s))).toEqual([]);
  });

  it("les exercices du terrain du 6 septembre en ont tous une", () => {
    // La liste vient du retour terrain, pas d'un choix de rédaction.
    for (const slug of [
      "hack-squat", "incline-dumbbell-press", "seated-row",
      "dip", "chin-up", "rope-hammer-curl", "cable-crunch",
    ]) {
      expect(FICHES_TECHNIQUES[slug], slug).toBeTruthy();
    }
  });

  it("chaque pilier du programme a au moins un exercice documenté", () => {
    // Sans cela, une calibration pourrait proposer un pilier entier sans une
    // seule fiche — et c'était exactement l'état d'avant ce lot.
    const parPilier = new Set(
      SLUGS.map((s) => CATALOGUE_PAR_SLUG.get(s)!.pilier),
    );
    for (const pilier of [
      "P3_squat", "P1_poussee", "P2_tirage", "epaules",
      "jambes_iso", "bras_triceps", "bras_biceps", "core",
    ]) {
      expect(parPilier.has(pilier), `aucune fiche pour ${pilier}`).toBe(true);
    }
  });
});

describe("chaque fiche est réellement affichable", () => {
  it("`ficheRenseignee` les reconnaît toutes", () => {
    // La garde que le rendu applique : une fiche qu'elle refuse ne s'affiche
    // jamais, et l'écrire donnerait l'illusion du travail fait.
    for (const slug of SLUGS) {
      expect(ficheRenseignee(FICHES_TECHNIQUES[slug]), slug).toBe(true);
    }
  });

  it("aucune n'est vide ni réduite à un titre", () => {
    for (const slug of SLUGS) {
      expect(texteDe(slug).length, slug).toBeGreaterThan(120);
    }
  });

  it("chacune dit au moins comment exécuter et jusqu'où aller", () => {
    for (const slug of SLUGS) {
      const f = FICHES_TECHNIQUES[slug]!;
      expect(f.execution, `${slug} : pas d'exécution`).toBeTruthy();
      expect(f.amplitude, `${slug} : pas d'amplitude`).toBeTruthy();
    }
  });

  it("les rubriques restent lisibles debout entre deux séries", () => {
    // Pas de pavé : ce qui ne se lit pas entre deux séries ne protège personne.
    for (const slug of SLUGS) {
      const f = FICHES_TECHNIQUES[slug]!;
      for (const [nom, valeur] of Object.entries(f)) {
        if (typeof valeur !== "string") continue;
        expect(valeur.length, `${slug}.${nom} trop long`).toBeLessThan(420);
      }
      for (const point of [...(f.pointsCles ?? []), ...(f.erreursFrequentes ?? [])]) {
        expect(point.length, `${slug} : « ${point} »`).toBeLessThan(90);
      }
      expect((f.pointsCles ?? []).length, slug).toBeLessThanOrEqual(4);
      expect((f.erreursFrequentes ?? []).length, slug).toBeLessThanOrEqual(4);
    }
  });
});

describe("aucune valeur personnelle ne s'est glissée dans une fiche commune", () => {
  it("aucun numéro de cran, de position ni de siège", () => {
    /*
     * La forme exacte du défaut : « siège 5 », « position 2 », « cran 3 ».
     * Le terrain du 6 septembre a produit ces trois-là, et ils sont vrais —
     * pour cette machine et pour ce corps. Ils vivent dans les réglages
     * personnels, pas ici.
     */
    for (const slug of SLUGS) {
      const t = texteDe(slug);
      expect(t, `${slug} : un numéro de réglage`)
        .not.toMatch(/\b(siège|siege|dossier|cran|position|hauteur|inclinaison)\s+\d/i);
      expect(t, `${slug} : un cran numéroté`).not.toMatch(/\b(cran|position)\s*n[°o]?\s*\d/i);
    }
  });

  it("ni angle chiffré, ni plage de pile, ni poids d'appareil", () => {
    for (const slug of SLUGS) {
      const t = texteDe(slug);
      expect(t, `${slug} : un angle inventé`).not.toMatch(/\d+\s*°/);
      expect(t, `${slug} : un poids inventé`).not.toMatch(/\d+\s*kg/i);
      expect(t, `${slug} : une plage inventée`).not.toMatch(/\bde\s+\d+\s+à\s+\d+\b/);
    }
  });

  it("ni référence de poignée ou d'accessoire présentée comme obligatoire", () => {
    // « prise verticale » est une préférence constatée en salle, pas une
    // vérité du mouvement. Elle appartient à la note ou aux réglages.
    for (const slug of SLUGS) {
      const t = texteDe(slug);
      expect(t, `${slug} : une prise imposée`)
        .not.toMatch(/prise\s+(verticale|pronation|supination)\s+obligatoire/i);
    }
  });

  it("un réglage de POSITION s'explique par un repère, jamais par un nombre", () => {
    /*
     * Le garde porte sur les réglages qui placent le corps — siège, dossier,
     * cale, rouleau — et pas sur toute phrase contenant « règle ». « Règle
     * l'aide avant de monter » est une consigne d'ordre, pas un critère de
     * placement : la quantité d'assistance est propre à chacun et aucun repère
     * anatomique ne la donne.
     *
     * Pour les autres, un repère est exigé — « pour que », « à hauteur de »,
     * « aligné avec » — parce que c'est ce qui remplace le numéro qu'on
     * s'interdit d'écrire.
     */
    const dePosition = SLUGS.filter((s) =>
      /règle (le|la|l')\s*(siège|siege|dossier|cale|rouleau|appareil)/i.test(texteDe(s)));
    expect(dePosition.length, "aucune fiche n'explique un réglage de position")
      .toBeGreaterThan(3);
    for (const slug of dePosition) {
      expect(texteDe(slug), slug).toMatch(/pour que|à hauteur|au niveau|aligné/i);
    }
  });
});

describe("les machines d'assistance disent le bon sens de la progression", () => {
  it("dip et chin-up expliquent que le nombre affiché est une aide", () => {
    /*
     * Le contresens le plus coûteux du 6 septembre : sur un Dip/Chin Assist,
     * 64 kg d'aide sont PLUS faciles que 50. Sans cette phrase, l'athlète lit
     * une charge qui monte et croit progresser alors qu'il recule.
     */
    for (const slug of ["dip", "chin-up"]) {
      const t = texteDe(slug);
      expect(t, `${slug} : l'assistance n'est pas expliquée`).toMatch(/aide|assistance/i);
      expect(t, `${slug} : le sens n'est pas dit`)
        .toMatch(/plus il est élevé, plus l'exercice est facile/i);
      expect(t, `${slug} : progresser n'est pas défini`).toMatch(/en demander moins/i);
    }
  });

  it("et aucune fiche ne parle de maximum estimé", () => {
    // Un e1RM n'a pas de sens sur une assistance, et l'écran le sait déjà :
    // le répéter ici ouvrirait une seconde source de vérité.
    for (const slug of SLUGS) {
      expect(texteDe(slug), slug).not.toMatch(/1RM|maximum estimé/i);
    }
  });
});

describe("les sensations sont des repères, pas des verdicts", () => {
  it("elles s'annoncent comme telles", () => {
    const avecSensation = SLUGS.filter((s) => FICHES_TECHNIQUES[s]!.sensation);
    expect(avecSensation.length).toBeGreaterThan(8);
    for (const slug of avecSensation) {
      expect(FICHES_TECHNIQUES[slug]!.sensation, slug).toMatch(/tu devrais/i);
    }
  });

  it("aucune ne conclut à une faute d'exécution", () => {
    // « Si tu ne le sens pas, tu exécutes mal » ferait douter quelqu'un qui
    // exécute correctement : une sensation dépend du gabarit et de l'habitude.
    for (const slug of SLUGS) {
      const s = FICHES_TECHNIQUES[slug]!.sensation ?? "";
      expect(s, slug).not.toMatch(/si tu ne (le |la )?sens pas/i);
      expect(s, slug).not.toMatch(/tu exécutes mal|c'est que tu/i);
    }
  });
});

describe("les tempos restent rares et justifiés", () => {
  it("il y en a peu, et jamais un par exercice", () => {
    // Remplir cent vingt tempos ferait passer une convention pour une
    // prescription. Voir l'en-tête de `TEMPOS_PAR_DEFAUT`.
    expect(Object.keys(TEMPOS_PAR_DEFAUT).length).toBeLessThan(SLUGS.length / 2);
  });

  it("chacun est un tempo lisible par le moteur", () => {
    for (const [slug, brut] of Object.entries(TEMPOS_PAR_DEFAUT)) {
      expect(lireTempo(brut), `${slug} : « ${brut} » illisible`).not.toBeNull();
    }
  });

  it("et chacun dit quelque chose que le repli canonique ne dit pas", () => {
    // Un tempo identique au repère général n'apporte rien : il ferait juste
    // disparaître la mention « repère général » sans changer la consigne.
    const canoniques = new Set<string>(Object.values(TEMPO_CANONIQUE));
    for (const [slug, brut] of Object.entries(TEMPOS_PAR_DEFAUT)) {
      const type = CATALOGUE_PAR_SLUG.get(slug)!.type;
      const repli = type === "polyarticulaire"
        ? TEMPO_CANONIQUE.polyarticulaire
        : TEMPO_CANONIQUE.isolation;
      expect(brut, `${slug} : identique au repli de sa famille`).not.toBe(repli);
      expect(canoniques.size).toBe(2);
    }
  });

  it("chaque tempo spécifique porte sur un exercice qui a une fiche", () => {
    for (const slug of Object.keys(TEMPOS_PAR_DEFAUT)) {
      expect(FICHES_TECHNIQUES[slug], slug).toBeTruthy();
    }
  });
});

describe("le fichier lui-même reste une source, pas une base parallèle", () => {
  it("il ne redéclare aucun muscle, pilier ni équipement", () => {
    // Ces champs vivent dans le catalogue. Les redire ici créerait deux
    // vérités sur le même exercice, et elles finiraient par diverger.
    const source = readFileSync(
      path.join(path.resolve(import.meta.dirname), "fiches-techniques.ts"), "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const champ of ["musclesPrincipaux", "musclesSecondaires", "pilier", "equipement"]) {
      expect(source, `${champ} ne doit pas être redéclaré ici`).not.toContain(`${champ}:`);
    }
  });
});
