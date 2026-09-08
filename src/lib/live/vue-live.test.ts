import { describe, it, expect } from "vitest";
import {
  avancement, exerciceAffiche, premierNonTermine, progressionSeance,
  prochainNumeroSerie, serieCompte, vueParDefaut,
  type ExercicePourLaVue, type SerieSaisie,
} from "./vue-live";

/**
 * Ce que les deux vues du Live partagent — et la raison pour laquelle elles le
 * partagent.
 *
 * Focus et Liste montrent la même séance. Si chacune déduisait de son côté
 * « où en est-on », elles finiraient par se contredire : l'une afficherait 2/3,
 * l'autre 3/3, et personne ne saurait laquelle croire. Ces fonctions sont donc
 * la SEULE source de ces réponses, et ce fichier les tient.
 */

const EX: ExercicePourLaVue[] = [
  { id: "a", nom: "Hack Squat", seriesCibles: 3 },
  { id: "b", nom: "Incline Press", seriesCibles: 3 },
  { id: "c", nom: "Seated Row", seriesCibles: 4 },
];

const serie = (id: string, n: number, faite = true): SerieSaisie => ({
  exerciseInstanceId: id,
  numeroSerie: n,
  repsEffectuees: faite ? 10 : null,
  charge: faite ? 40 : null,
});

describe("une série ne compte que si elle mesure quelque chose", () => {
  it("une ligne ouverte à moitié saisie ne fait pas avancer la séance", () => {
    // Le même critère que la clôture, qui refuse une série vide. Compter
    // autrement afficherait « 3/3 » sur un exercice que la base refuserait.
    expect(serieCompte(serie("a", 1))).toBe(true);
    expect(serieCompte({ exerciseInstanceId: "a", numeroSerie: 1, repsEffectuees: 10, charge: null })).toBe(false);
    expect(serieCompte({ exerciseInstanceId: "a", numeroSerie: 1, repsEffectuees: null, charge: 40 })).toBe(false);
  });

  it("et une série à zéro répétition compte : zéro n'est pas « non saisi »", () => {
    // La distinction vaut ailleurs dans le moteur ; on ne la réinvente pas ici.
    expect(serieCompte({ exerciseInstanceId: "a", numeroSerie: 1, repsEffectuees: 0, charge: 0 })).toBe(true);
  });
});

describe("l'avancement, tel que les deux vues le lisent", () => {
  it("compte les séries faites par exercice", () => {
    const etats = avancement(EX, [serie("a", 1), serie("a", 2), serie("b", 1)]);
    expect(etats.map((e) => `${e.faites}/${e.cibles}`)).toEqual(["2/3", "1/3", "0/4"]);
  });

  it("distingue à faire, en cours et terminé", () => {
    const etats = avancement(EX, [
      serie("a", 1), serie("a", 2), serie("a", 3), serie("b", 1),
    ]);
    expect(etats.map((e) => e.statut)).toEqual(["termine", "en_cours", "a_faire"]);
  });

  it("ne dépasse jamais la cible affichée", () => {
    // Une quatrième série sur un exercice qui en prescrit trois ne doit pas
    // afficher « 4/3 » : le nombre servirait alors à deux choses à la fois.
    const etats = avancement(EX, [
      serie("a", 1), serie("a", 2), serie("a", 3), serie("a", 4),
    ]);
    expect(etats[0]!.faites).toBe(3);
    expect(etats[0]!.statut).toBe("termine");
  });

  it("ignore les séries d'un exercice absent de la vue", () => {
    // Après une substitution, le brouillon porte encore des séries de
    // l'ancienne instance. Elles ne doivent pas gonfler l'avancement de la
    // nouvelle — ni faire planter le calcul.
    const etats = avancement(EX, [serie("ancienne-machine", 1), serie("a", 1)]);
    expect(etats[0]!.faites).toBe(1);
  });

  it("le total de la séance se lit d'un coup", () => {
    const etats = avancement(EX, [serie("a", 1), serie("a", 2), serie("a", 3), serie("b", 1)]);
    expect(progressionSeance(etats)).toEqual({ faites: 4, cibles: 10, exercicesTermines: 1 });
  });
});

describe("l'exercice affiché suit l'utilisateur, pas l'avancement", () => {
  const etats = () => avancement(EX, [serie("a", 1), serie("a", 2), serie("a", 3)]);

  it("sans demande, on montre le premier exercice à faire", () => {
    // Première ouverture, ou reprise sans mémoire : « choisis pour moi ».
    expect(exerciceAffiche(etats(), null)).toBe(1);
  });

  it("une demande explicite est respectée, même sur un exercice terminé", () => {
    /*
     * Le cas exact du cahier des charges : ouvrir le 4, revenir au 2, valider
     * une série, repartir au 4. Rien ne doit bouger sous les doigts — et
     * relire un exercice terminé pour corriger une série est légitime.
     */
    expect(exerciceAffiche(etats(), 0)).toBe(0);
    expect(exerciceAffiche(etats(), 2)).toBe(2);
  });

  it("terminer un exercice ne déplace PAS l'exercice affiché", () => {
    // La régression la plus facile à introduire : recalculer l'index à chaque
    // validation. L'écran sauterait alors d'exercice pendant qu'on corrige.
    const avant = exerciceAffiche(avancement(EX, [serie("a", 1), serie("a", 2)]), 0);
    const apres = exerciceAffiche(avancement(EX, [serie("a", 1), serie("a", 2), serie("a", 3)]), 0);
    expect(avant).toBe(0);
    expect(apres).toBe(0);
  });

  it("un index hors bornes retombe sur le premier exercice à faire", () => {
    // La séance a raccourci — un exercice retiré, une substitution — et l'index
    // mémorisé ne désigne plus rien.
    expect(exerciceAffiche(etats(), 9)).toBe(1);
    expect(exerciceAffiche(etats(), -1)).toBe(1);
    expect(exerciceAffiche(etats(), 1.5)).toBe(1);
  });

  it("une séance entièrement terminée garde le dernier exercice", () => {
    // Plutôt que de ne renvoyer nulle part : l'écran doit montrer quelque chose.
    const tout = avancement(EX, [
      serie("a", 1), serie("a", 2), serie("a", 3),
      serie("b", 1), serie("b", 2), serie("b", 3),
      serie("c", 1), serie("c", 2), serie("c", 3), serie("c", 4),
    ]);
    expect(premierNonTermine(tout)).toBeNull();
    expect(exerciceAffiche(tout, null)).toBe(2);
  });

  it("une séance vide ne fait pas planter la vue", () => {
    expect(exerciceAffiche([], null)).toBe(0);
    expect(exerciceAffiche([], 3)).toBe(0);
  });
});

describe("le numéro de la prochaine série", () => {
  it("part de 1 sur un exercice jamais commencé", () => {
    expect(prochainNumeroSerie([], "a")).toBe(1);
  });

  it("suit le maximum, pas le nombre de lignes", () => {
    /*
     * Décocher la série 2 sur trois séries laisse 1 et 3. « Nombre + 1 »
     * donnerait 3 — un numéro déjà pris — et le triplet qui identifie une série
     * en base cesserait d'être unique : la nouvelle écraserait l'ancienne.
     */
    expect(prochainNumeroSerie([serie("a", 1), serie("a", 3)], "a")).toBe(4);
  });

  it("ne regarde que l'exercice demandé", () => {
    expect(prochainNumeroSerie([serie("a", 1), serie("a", 2), serie("b", 1)], "b")).toBe(2);
  });
});

describe("la vue par défaut", () => {
  it("Focus quand rien n'a été choisi", () => {
    // C'est la vue faite pour un téléphone tenu d'une main entre deux séries.
    expect(vueParDefaut(null)).toBe("focus");
    expect(vueParDefaut(undefined)).toBe("focus");
    expect(vueParDefaut("")).toBe("focus");
  });

  it("Liste seulement si elle a été explicitement retenue", () => {
    expect(vueParDefaut("liste")).toBe("liste");
    // Une valeur abîmée ne doit pas ouvrir une vue inconnue.
    expect(vueParDefaut("n'importe quoi")).toBe("focus");
  });
});
