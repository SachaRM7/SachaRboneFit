import { describe, expect, it } from "vitest";
import {
  champsMachineSchema,
  chargeAEnregistrer,
  consigneDeSaisie,
  libelleChampCharge,
  LIBELLES_CONVENTION,
} from "./exercise-instance";

describe("conventions de charge", () => {
  it("décrit sans ambiguïté la saisie par haltère", () => {
    expect(LIBELLES_CONVENTION.poids_par_main).toBe("Poids par main");
    expect(consigneDeSaisie("poids_par_main", "resistance"))
      .toBe("Note le poids d’UN haltère — ne multiplie pas par deux.");
    expect(champsMachineSchema.safeParse({
      conventionCharge: "poids_par_main",
      typePoulie: "na",
    }).success).toBe(true);
  });

  it("décrit la double poulie comme une valeur par côté, jamais une somme", () => {
    expect(LIBELLES_CONVENTION.pile_par_cote).toBe("Pile affichée par côté");
    expect(consigneDeSaisie("pile_par_cote", "resistance"))
      .toBe("Note la valeur affichée sur un côté, avec les deux côtés réglés pareil.");
  });

  it("laisse vide la charge d'un mouvement sans charge externe", () => {
    expect(consigneDeSaisie("sans_charge", "resistance"))
      .toBe("Laisse la charge vide : seules les répétitions sont enregistrées.");
    expect(chargeAEnregistrer("", "sans_charge")).toBe(0);
    expect(chargeAEnregistrer("72,5", "poids_total")).toBe(72.5);
    expect(chargeAEnregistrer("", "poids_total")).toBeNull();
  });
});

/**
 * Ce que la séance du 6 septembre a montré : une convention correcte mais
 * ambiguë ne vaut pas mieux qu'une convention absente.
 *
 * Devant le hack squat, avec 10 kg d'un côté et 10 kg de l'autre, « note les
 * disques ajoutés, sans le chariot » ne répond pas à la seule question posée :
 * 10 ou 20 ? Il a fallu la poser ailleurs qu'à l'application.
 */
describe("conventions ambiguës, dites en toutes lettres", () => {
  it("les disques ajoutés s'additionnent des deux côtés, avec l'exemple", () => {
    const texte = consigneDeSaisie("disques_ajoutes", "resistance");
    expect(texte).toContain("les deux côtés");
    // L'exemple chiffré fait le travail qu'aucune formulation abstraite ne fait.
    expect(texte).toContain("10 kg + 10 kg = 20 kg");
  });

  it("le chariot est nommé quand l'appareil le connaît", () => {
    // 47,6 kg sur le hack squat de St-Martin : le dire coupe court au doute
    // « est-ce que je dois l'ajouter ? ».
    const texte = consigneDeSaisie("disques_ajoutes", "resistance", 47.6);
    expect(texte).toContain("47,6 kg");
    expect(texte).toContain("n’est pas compté");
  });

  it("sans valeur connue, on n'invente pas de chariot", () => {
    expect(consigneDeSaisie("disques_ajoutes", "resistance")).not.toContain("chariot");
    expect(consigneDeSaisie("disques_ajoutes", "resistance", 0)).not.toContain("chariot");
  });

  it("l'assistance dit le sens du nombre, et le champ le rappelle", () => {
    // 64 kg d'assistance étaient beaucoup trop faciles ; ~50 kg bien plus
    // justes. Sans cette phrase, la valeur qui monte se lit comme un progrès.
    const texte = consigneDeSaisie("pile_affichee", "assistance");
    expect(texte).toContain("plus l’exercice est facile");
    expect(libelleChampCharge("assistance")).toBe("Assistance (kg)");
    expect(libelleChampCharge("resistance")).toBe("kg");
  });
});
