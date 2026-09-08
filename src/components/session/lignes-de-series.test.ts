import { describe, expect, it } from "vitest";
import { derniereLigneRetirable, lignesAAfficher } from "./lignes-de-series";
import type { LigneeSlot, SerieSaisie } from "@/lib/live/vue-live";

const A = "instance-a";
const B = "instance-b";

/** Une série réellement mesurée — c'est ce qui consomme un slot. */
const fait = (instance: string, numero: number): SerieSaisie => ({
  exerciseInstanceId: instance,
  numeroSerie: numero,
  repsEffectuees: 10,
  charge: 60,
});

const seul = (instance: string): LigneeSlot => ({
  origine: instance,
  instances: [instance],
});

const etat = (over: Partial<Parameters<typeof lignesAAfficher>[0]> = {}) => ({
  seriesCibles: 2,
  seriesEnPlus: 0,
  instanceCourante: A,
  lignee: seul(A),
  series: [] as SerieSaisie[],
  ...over,
});

/**
 * LE BUG DU DEADLIFT.
 *
 * Deux séries prescrites, S1 et S2 visibles. On valide S1 : le compteur passe
 * bien à 1/2, et S1 disparaît de la carte. Le Live rendait les SLOTS LIBRES,
 * une liste qui rétrécit à chaque validation par construction.
 */
describe("une série validée ne disparaît jamais", () => {
  it("affiche les deux séries avant toute validation", () => {
    expect(lignesAAfficher(etat())).toEqual([1, 2]);
  });

  it("affiche TOUJOURS les deux après validation de S1", () => {
    // Le cœur du défaut : avant correction, cette ligne rendait `[2]`.
    expect(lignesAAfficher(etat({ series: [fait(A, 1)] }))).toEqual([1, 2]);
  });

  it("et garde les deux quand tout est validé", () => {
    // Pas de formulaire vide : ce qui a été fait reste lisible et corrigible.
    expect(lignesAAfficher(etat({ series: [fait(A, 1), fait(A, 2)] })))
      .toEqual([1, 2]);
  });

  it("une série en cours de saisie ne consomme pas encore son slot", () => {
    // Ni reps ni charge : la ligne existe, le slot reste libre. Elle n'est
    // donc comptée qu'une fois, pas deux.
    const brouillon: SerieSaisie = {
      exerciseInstanceId: A, numeroSerie: 1, repsEffectuees: null, charge: null,
    };
    expect(lignesAAfficher(etat({ series: [brouillon] }))).toEqual([1, 2]);
  });
});

/**
 * Le cas où les deux notions divergent vraiment — et où les confondre coûtait
 * une série de plus que prescrit.
 */
describe("après une substitution, la nouvelle machine ne montre que ce qui la concerne", () => {
  const lignee: LigneeSlot = { origine: A, instances: [A, B] };

  it("B ne demande que S2 et S3 — S1 a été faite sur A", () => {
    expect(
      lignesAAfficher({
        seriesCibles: 3, seriesEnPlus: 0,
        instanceCourante: B, lignee, series: [fait(A, 1)],
      }),
    ).toEqual([2, 3]);
  });

  it("et S1 n'apparaît PAS comme une série de B", () => {
    // Elle occupe le slot, elle ne devient pas une performance de B : personne
    // n'a soulevé cette charge sur cette machine.
    const lignes = lignesAAfficher({
      seriesCibles: 3, seriesEnPlus: 0,
      instanceCourante: B, lignee, series: [fait(A, 1)],
    });
    expect(lignes).not.toContain(1);
  });

  it("B validant S2 garde S2 affichée, et S3 à faire", () => {
    expect(
      lignesAAfficher({
        seriesCibles: 3, seriesEnPlus: 0,
        instanceCourante: B, lignee, series: [fait(A, 1), fait(B, 2)],
      }),
    ).toEqual([2, 3]);
  });

  it("A garde les siennes quand on y revient", () => {
    expect(
      lignesAAfficher({
        seriesCibles: 3, seriesEnPlus: 0,
        instanceCourante: A, lignee, series: [fait(A, 1), fait(B, 2)],
      }),
    ).toEqual([1, 3]);
  });

  it("un slot entièrement consommé ailleurs ne rend aucune ligne", () => {
    // C'est ce qui permet d'afficher « exercice terminé » plutôt qu'un
    // formulaire vide — et surtout de ne pas redemander une quatrième série.
    expect(
      lignesAAfficher({
        seriesCibles: 2, seriesEnPlus: 0, instanceCourante: B, lignee,
        series: [fait(A, 1), fait(A, 2)],
      }),
    ).toEqual([]);
  });
});

/**
 * Le bug du 6 septembre, en une phrase : une ligne apparue par erreur et
 * impossible à retirer.
 */
describe("ajouter puis retirer une série hors prescription", () => {
  it("part de la prescription, sans rien à retirer", () => {
    expect(lignesAAfficher(etat())).toEqual([1, 2]);
    expect(derniereLigneRetirable(etat())).toBeNull();
  });

  it("ajoute une troisième ligne, et propose de la retirer", () => {
    const avecExtra = etat({ seriesEnPlus: 1 });
    expect(lignesAAfficher(avecExtra)).toEqual([1, 2, 3]);
    expect(derniereLigneRetirable(avecExtra)).toBe(3);
  });

  it("revient exactement à deux lignes", () => {
    // Le scénario complet : 2 prescrites, +1, −1.
    expect(lignesAAfficher(etat({ seriesEnPlus: 0 }))).toEqual([1, 2]);
    expect(derniereLigneRetirable(etat({ seriesEnPlus: 0 }))).toBeNull();
  });

  it("ne propose jamais de retirer une série prescrite", () => {
    expect(derniereLigneRetirable(etat({ series: [fait(A, 1), fait(A, 2)] })))
      .toBeNull();
    expect(derniereLigneRetirable(etat({ seriesCibles: 3, series: [fait(A, 1)] })))
      .toBeNull();
  });

  it("une série validée au-delà de la prescription tient sa ligne", () => {
    // Le compteur d'ajout peut être retombé à zéro sans que la série
    // disparaisse : ce qui est enregistré s'affiche, et se retire explicitement.
    const validee = etat({ series: [fait(A, 1), fait(A, 2), fait(A, 3)] });
    expect(lignesAAfficher(validee)).toEqual([1, 2, 3]);
    expect(derniereLigneRetirable(validee)).toBe(3);
  });

  it("trie numériquement — la série 10 vient après la 9", () => {
    const beaucoup = etat({
      seriesCibles: 9,
      seriesEnPlus: 1,
      series: [fait(A, 1)],
    });
    expect(lignesAAfficher(beaucoup)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("un exercice sans prescription garde une ligne pour saisir", () => {
    expect(lignesAAfficher(etat({ seriesCibles: 0 }))).toEqual([1]);
  });
});
