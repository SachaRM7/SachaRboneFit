import { describe, it, expect } from "vitest";
import {
  LIBELLES_MANQUANT, POURQUOI, champsManquants, meriteUnRappel,
  type ChampManquant, type EtatDuProfil,
} from "./profil-complet";

const COMPLET: EtatDuProfil = {
  dateNaissance: "1995-04-12",
  sexe: "homme",
  taille: 178,
  aUnePesee: true,
  frequenceMinParSemaine: 2,
  frequenceCibleParSemaine: 3,
  frequenceMaxParSemaine: 4,
  dureeSeanceCibleMinutes: 60,
  dureeSeanceMaxMinutes: 90,
};

const avec = (patch: Partial<EtatDuProfil>) => champsManquants({ ...COMPLET, ...patch });

describe("ce qui manque", () => {
  it("ne réclame rien à un profil complet", () => {
    expect(champsManquants(COMPLET)).toEqual([]);
    expect(meriteUnRappel([])).toBe(false);
  });

  it("réclame chaque information absente, et elle seule", () => {
    expect(avec({ dateNaissance: null })).toEqual(["date_naissance"]);
    expect(avec({ sexe: null })).toEqual(["sexe"]);
    expect(avec({ taille: null })).toEqual(["taille"]);
    expect(avec({ aUnePesee: false })).toEqual(["poids"]);
  });

  it("ne redemande pas un sexe qu'on a refusé de préciser", () => {
    // `non_precise` est une réponse. La redemander reviendrait à ne pas
    // l'accepter, et le bandeau reviendrait indéfiniment.
    expect(avec({ sexe: "non_precise" })).toEqual([]);
  });

  it("traite la fréquence comme un tout", () => {
    // Les trois colonnes forment une fourchette : il en manque une, elle est
    // incomplète. Le moteur lit les trois.
    expect(avec({ frequenceMinParSemaine: null })).toEqual(["frequence"]);
    expect(avec({ frequenceCibleParSemaine: null })).toEqual(["frequence"]);
    expect(avec({ frequenceMaxParSemaine: null })).toEqual(["frequence"]);
    // Et une seule ligne, jamais trois.
    expect(avec({
      frequenceMinParSemaine: null, frequenceCibleParSemaine: null, frequenceMaxParSemaine: null,
    })).toEqual(["frequence"]);
  });

  it("traite la durée de la même façon", () => {
    expect(avec({ dureeSeanceMaxMinutes: null })).toEqual(["duree"]);
  });

  it("met d'abord ce qui change ce que le moteur produit", () => {
    const manquants = champsManquants({
      dateNaissance: null, sexe: null, taille: null, aUnePesee: false,
      frequenceMinParSemaine: null, frequenceCibleParSemaine: null, frequenceMaxParSemaine: null,
      dureeSeanceCibleMinutes: null, dureeSeanceMaxMinutes: null,
    });
    // Sans fréquence ni durée, la séance du jour est composée sur des valeurs
    // de repli : ça passe avant la façon dont le coach s'exprime.
    expect(manquants.slice(0, 2)).toEqual(["frequence", "duree"]);
    expect(manquants).toHaveLength(6);
  });
});

describe("quand on le dit", () => {
  it("le signale dès qu'une donnée du moteur manque", () => {
    expect(meriteUnRappel(["frequence"])).toBe(true);
    expect(meriteUnRappel(["duree"])).toBe(true);
  });

  it("se tait pour une seule information cosmétique", () => {
    // Un bandeau qui réapparaît pour une date de naissance devient du bruit,
    // et on cesse de le lire — y compris le jour où il dit quelque chose.
    expect(meriteUnRappel(["date_naissance"])).toBe(false);
    expect(meriteUnRappel(["sexe"])).toBe(false);
  });

  it("le signale à partir de deux", () => {
    expect(meriteUnRappel(["date_naissance", "taille"])).toBe(true);
  });
});

describe("chaque manque se dit à l'écran", () => {
  const tous: ChampManquant[] = ["date_naissance", "sexe", "taille", "poids", "frequence", "duree"];

  it("porte un libellé et une raison", () => {
    // Demander une donnée sans dire ce qu'elle change est le meilleur moyen de
    // ne pas l'obtenir. Ajouter un champ sans sa raison échoue ici.
    for (const champ of tous) {
      expect(LIBELLES_MANQUANT[champ], champ).toBeTruthy();
      expect(POURQUOI[champ], champ).toBeTruthy();
    }
  });

  it("n'expose aucune clé technique", () => {
    for (const champ of tous) {
      expect(LIBELLES_MANQUANT[champ]).not.toMatch(/_/);
    }
  });
});
