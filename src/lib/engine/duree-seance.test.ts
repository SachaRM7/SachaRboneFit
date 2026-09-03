import { describe, it, expect } from "vitest";
import {
  APPROCHE_MINUTES,
  dureeDeLaSeance,
  formaterEcoulee,
  messageDuree,
  tonDuree,
} from "./duree-seance";

/**
 * L'onboarding demandait une durée idéale et une durée maximale, et rien n'en
 * faisait quoi que ce soit. À la fin, une modale annonçait « 105 min / cible
 * 60 min », puis « Temps OK après recalcul » — sans jamais dire ce qui serait
 * coupé ni pourquoi.
 */

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

const apres = (minutes: number, profil: { cible?: number | null; max?: number | null } = {}) =>
  dureeDeLaSeance({
    demarreeA: T0,
    maintenant: T0 + minutes * MINUTE,
    dureeCibleMinutes: profil.cible === undefined ? 60 : profil.cible,
    dureeMaxMinutes: profil.max === undefined ? 90 : profil.max,
  });

describe("le chronomètre part du démarrage réel", () => {
  it("il compte les secondes écoulées", () => {
    expect(apres(0).ecouleeSecondes).toBe(0);
    expect(apres(47).ecouleeSecondes).toBe(47 * 60);
  });

  it("une horloge qui recule ne produit pas de durée négative", () => {
    const d = dureeDeLaSeance({ demarreeA: T0, maintenant: T0 - 5 * MINUTE });
    expect(d.ecouleeSecondes).toBe(0);
  });
});

describe("les seuils viennent du profil, jamais d'une constante", () => {
  it("60 et 90 minutes : le parcours réel", () => {
    expect(apres(30).etat).toBe("dans_les_temps");
    expect(apres(56).etat).toBe("cible_proche");
    expect(apres(62).etat).toBe("cible_depassee");
    expect(apres(86).etat).toBe("maximum_proche");
    expect(apres(95).etat).toBe("maximum_depasse");
  });

  it("sans durée renseignée, il n'y a aucun seuil", () => {
    // Le chronomètre se contente alors de compter.
    const d = apres(200, { cible: null, max: null });
    expect(d.etat).toBe("dans_les_temps");
    expect(d.resteAvantCibleMinutes).toBeNull();
    expect(d.resteAvantMaximumMinutes).toBeNull();
    expect(messageDuree(d)).toBeNull();
  });

  it("une cible seule suffit", () => {
    expect(apres(70, { max: null }).etat).toBe("cible_depassee");
  });

  it("l'approche commence exactement à la borne annoncée", () => {
    expect(apres(60 - APPROCHE_MINUTES).etat).toBe("cible_proche");
    expect(apres(60 - APPROCHE_MINUTES - 1).etat).toBe("dans_les_temps");
  });

  it("un maximum mal renseigné ne produit pas d'état incohérent", () => {
    // Maximum plus petit que la cible : c'est le maximum qui informe.
    expect(apres(50, { cible: 60, max: 40 }).etat).toBe("maximum_depasse");
  });

  it("une durée nulle ou négative n'est pas un seuil", () => {
    expect(apres(120, { cible: 0, max: -10 }).etat).toBe("dans_les_temps");
  });
});

describe("le temps restant se lit dans les deux sens", () => {
  it("avant la cible, il reste des minutes", () => {
    expect(apres(45).resteAvantCibleMinutes).toBe(15);
  });

  it("après, le compte devient négatif", () => {
    expect(apres(75).resteAvantCibleMinutes).toBe(-15);
    expect(apres(105).resteAvantMaximumMinutes).toBe(-15);
  });
});

describe("l'application dit l'heure, jamais d'arrêter", () => {
  it("aucun message n'ordonne quoi que ce soit", () => {
    for (const minutes of [30, 56, 62, 86, 105, 200]) {
      const message = messageDuree(apres(minutes)) ?? "";
      expect(message).not.toMatch(/arrête|arrêter|stop|dois/i);
    }
  });

  it("dépasser sa durée idéale est dit comme un fait", () => {
    expect(messageDuree(apres(75))).toBe("Tu es à 15 min au-delà de ta durée idéale.");
  });

  it("le dépassement du maximum est dit plus fort, sans être un ordre", () => {
    expect(messageDuree(apres(105))).toBe("Tu es à 15 min au-delà de ta durée maximale.");
    expect(tonDuree(apres(105).etat)).toBe("avertissement");
  });

  it("dans les temps, il n'y a rien à dire", () => {
    expect(messageDuree(apres(20))).toBeNull();
    expect(tonDuree("dans_les_temps")).toBe("neutre");
  });

  it("la cible informe, le maximum avertit", () => {
    expect(tonDuree("cible_proche")).toBe("note");
    expect(tonDuree("cible_depassee")).toBe("note");
    expect(tonDuree("maximum_proche")).toBe("avertissement");
    expect(tonDuree("maximum_depasse")).toBe("avertissement");
  });
});

describe("la durée s'affiche comme on la lit", () => {
  it("en minutes sous l'heure", () => {
    expect(formaterEcoulee(0)).toBe("0 min");
    expect(formaterEcoulee(47 * 60)).toBe("47 min");
  });

  it("en heures au-delà", () => {
    expect(formaterEcoulee(60 * 60)).toBe("1 h 00");
    expect(formaterEcoulee(65 * 60)).toBe("1 h 05");
    expect(formaterEcoulee(138 * 60)).toBe("2 h 18");
  });
});
