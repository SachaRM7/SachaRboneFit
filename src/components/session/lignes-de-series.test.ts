import { describe, expect, it } from "vitest";
import { derniereLigneRetirable, nombreDeLignes } from "./lignes-de-series";

/**
 * Le bug du 6 septembre, en une phrase : une ligne apparue par erreur et
 * impossible à retirer.
 */
describe("ajouter puis retirer une série hors prescription", () => {
  const prescrites = { seriesCibles: 2, seriesEnPlus: 0, numerosSaisis: [] as number[] };

  it("part de la prescription", () => {
    expect(nombreDeLignes(prescrites)).toBe(2);
    // Rien à retirer : les deux lignes viennent du moteur.
    expect(derniereLigneRetirable(prescrites)).toBeNull();
  });

  it("ajoute une troisième ligne, et propose de la retirer", () => {
    const avecExtra = { ...prescrites, seriesEnPlus: 1 };
    expect(nombreDeLignes(avecExtra)).toBe(3);
    expect(derniereLigneRetirable(avecExtra)).toBe(3);
  });

  it("revient exactement à deux lignes", () => {
    // Le scénario complet : 2 prescrites, +1, −1.
    const apresRetrait = { ...prescrites, seriesEnPlus: 0 };
    expect(nombreDeLignes(apresRetrait)).toBe(2);
    expect(derniereLigneRetirable(apresRetrait)).toBeNull();
  });

  it("ne propose jamais de retirer une série prescrite", () => {
    // Même à zéro ligne ajoutée, même avec des séries validées : la
    // prescription n'est pas à la main de l'écran.
    expect(derniereLigneRetirable({ seriesCibles: 2, seriesEnPlus: 0, numerosSaisis: [1, 2] })).toBeNull();
    expect(derniereLigneRetirable({ seriesCibles: 3, seriesEnPlus: 0, numerosSaisis: [1] })).toBeNull();
  });

  it("une série validée au-delà de la prescription tient sa ligne", () => {
    // Le compteur peut être retombé à zéro sans que la série disparaisse : ce
    // qui est enregistré s'affiche, et se retire explicitement.
    const validee = { seriesCibles: 2, seriesEnPlus: 0, numerosSaisis: [1, 2, 3] };
    expect(nombreDeLignes(validee)).toBe(3);
    expect(derniereLigneRetirable(validee)).toBe(3);
  });

  it("retirer ne touche pas à seriesCibles", () => {
    // La propriété qui compte : la prescription est une donnée du moteur, pas
    // un compteur d'affichage. Elle traverse l'ajout comme le retrait.
    const etats = [
      { seriesCibles: 2, seriesEnPlus: 0, numerosSaisis: [] },
      { seriesCibles: 2, seriesEnPlus: 1, numerosSaisis: [] },
      { seriesCibles: 2, seriesEnPlus: 0, numerosSaisis: [] },
    ];
    expect(etats.map((e) => e.seriesCibles)).toEqual([2, 2, 2]);
    expect(etats.map(nombreDeLignes)).toEqual([2, 3, 2]);
  });
});
