import { describe, it, expect } from "vitest";
import {
  choisirSalleDuJour, etatDuJour, lienDemarrage, type EntreeEtatDuJour,
} from "./etat-du-jour";

const salle = { id: "s-1", nom: "St-Martin-Du-Touch" };

const base: EntreeEtatDuJour = {
  salle,
  exercicesRealisablesIci: 12,
  lieuRenseigne: true,
  prochaineSeance: { templateId: "t-1", lettre: "A", nom: "Haut du corps" },
  seanceFaiteAujourdhui: false,
  enCalibration: false,
  seancesCetteSemaine: 1,
  frequenceMaxParSemaine: 4,
};

const avec = (patch: Partial<EntreeEtatDuJour>) => etatDuJour({ ...base, ...patch });

describe("etatDuJour", () => {
  it("propose toujours une action, quel que soit l'état", () => {
    // C'est la propriété qui compte : aucun écran sans prochaine étape.
    const cas: Array<Partial<EntreeEtatDuJour>> = [
      {},
      { salle: null },
      { exercicesRealisablesIci: 0, lieuRenseigne: false },
      { prochaineSeance: null },
      { seanceFaiteAujourdhui: true },
      { seancesCetteSemaine: 9 },
      { salle: null, exercicesRealisablesIci: 0, lieuRenseigne: false, prochaineSeance: null },
    ];
    for (const c of cas) expect(avec(c).action).toBeTruthy();
  });

  it("demande la salle avant tout le reste", () => {
    // Sans salle, ni le matériel ni les charges ne sont calculables.
    const r = avec({ salle: null, exercicesRealisablesIci: 0, lieuRenseigne: false, prochaineSeance: null });
    expect(r.etat).toBe("sans_salle");
    expect(r.action.type).toBe("choisir_salle");
    expect(r.enAttenteDeDonnees).toBe(true);
  });

  it("demande ce que le lieu contient tant que personne ne l'a décrit", () => {
    const r = avec({ exercicesRealisablesIci: 0, lieuRenseigne: false, prochaineSeance: null });
    expect(r.etat).toBe("salle_vide");
    expect(r.seance).toBeNull();
    expect(r.action).toEqual({ type: "equiper_salle", href: "/gyms/s-1/exercices" });
  });

  it("n'annonce ni repos ni semaine complète tant que rien n'est possible", () => {
    // Un parc vide passe avant : féliciter quelqu'un qui n'a pas pu s'entraîner
    // serait faux.
    expect(avec({ lieuRenseigne: false, seanceFaiteAujourdhui: true }).etat).toBe("salle_vide");
    expect(avec({ lieuRenseigne: false, seancesCetteSemaine: 9 }).etat).toBe("salle_vide");
  });

  it("distingue un lieu non décrit d'un lieu sans matériel", () => {
    // « Maison, rien que le poids du corps » est une réponse, pas une absence
    // de réponse : elle suffit à construire une séance.
    expect(avec({ lieuRenseigne: false, exercicesRealisablesIci: 16 }).etat).toBe("salle_vide");
    expect(avec({ lieuRenseigne: true, exercicesRealisablesIci: 16, prochaineSeance: null }).etat)
      .toBe("calibration");
  });

  it("bascule en calibration quand le matériel est connu mais aucune séance n'existe", () => {
    const r = avec({ prochaineSeance: null, enCalibration: true });
    expect(r.etat).toBe("calibration");
    expect(r.enAttenteDeDonnees).toBe(false);
    expect(r.action.type).toBe("demarrer_calibration");
  });

  it("porte la salle dans le lien de démarrage", () => {
    // Le bouton partait avec gymId vide : la séance ne pouvait pas démarrer.
    const r = avec({});
    expect(r.action.href).toContain("gymId=s-1");
    expect(r.action.href).not.toContain("gymId=&");
  });

  it("reste en calibration même quand une séance est programmée", () => {
    expect(avec({ enCalibration: true }).etat).toBe("calibration");
    expect(avec({ enCalibration: true }).seance?.lettre).toBe("A");
  });

  it("reconnaît une séance déjà faite aujourd'hui", () => {
    const r = avec({ seanceFaiteAujourdhui: true });
    expect(r.etat).toBe("deja_entraine");
    expect(r.action.type).toBe("voir_progression");
  });

  it("respecte le maximum hebdomadaire déclaré", () => {
    expect(avec({ seancesCetteSemaine: 4, frequenceMaxParSemaine: 4 }).etat).toBe("semaine_complete");
    expect(avec({ seancesCetteSemaine: 3, frequenceMaxParSemaine: 4 }).etat).toBe("prete");
  });

  it("ne plafonne rien quand le maximum est inconnu", () => {
    // Un profil incomplet ne doit pas empêcher de s'entraîner.
    expect(avec({ seancesCetteSemaine: 12, frequenceMaxParSemaine: null }).etat).toBe("prete");
    expect(avec({ seancesCetteSemaine: 12, frequenceMaxParSemaine: 0 }).etat).toBe("prete");
  });
});

describe("lienDemarrage", () => {
  it("transporte la date du jour et la salle", () => {
    const lien = lienDemarrage("s-1", new Date("2026-08-31T09:00:00Z"));
    expect(lien).toBe("/session/daily-state?date=2026-08-31&gymId=s-1");
  });

  it("échappe un identifiant inattendu", () => {
    expect(lienDemarrage("a b&c")).toContain("gymId=a%20b%26c");
  });
});

describe("choisirSalleDuJour", () => {
  const MOI = "u-moi";
  const VOISIN = "u-voisin";
  const sansPreference = { id: MOI, prefSalleParDefautId: null };

  const mienne = { id: "s-moi", userId: MOI };
  const sienne = { id: "s-voisin", userId: VOISIN };

  it("retient la préférence quand le lieu existe encore", () => {
    const choix = choisirSalleDuJour(
      { id: MOI, prefSalleParDefautId: "s-voisin" },
      [mienne, sienne],
    );
    // Désigner la salle d'un autre est le cas NORMAL de deux personnes qui
    // s'entraînent au même endroit : le partage n'est pas remis en cause.
    expect(choix).toBe(sienne);
  });

  it("ignore une préférence qui ne désigne plus rien", () => {
    expect(choisirSalleDuJour({ id: MOI, prefSalleParDefautId: "s-effacee" }, [mienne]))
      .toBe(mienne);
    expect(choisirSalleDuJour({ id: MOI, prefSalleParDefautId: "s-effacee" }, [sienne]))
      .toBeNull();
  });

  it("déduit la salle du jour quand le compte n'en a qu'une", () => {
    expect(choisirSalleDuJour(sansPreference, [mienne])).toBe(mienne);
  });

  it("ne déduit rien de la salle d'un autre compte", () => {
    // Le défaut corrigé : la déduction comptait TOUTES les salles lisibles, et
    // la lecture est commune à tous les comptes. Un compte sans aucun lieu, à
    // côté d'un compte qui en a exactement un, héritait du lieu du voisin —
    // et de son inventaire pour construire la séance.
    expect(choisirSalleDuJour(sansPreference, [sienne])).toBeNull();
    expect(choisirSalleDuJour(sansPreference, [sienne, { id: "s-3", userId: VOISIN }]))
      .toBeNull();
  });

  it("ne déduit rien quand le compte hésite entre deux de ses salles", () => {
    // Sans préférence, deux lieux à soi ne désignent pas un vainqueur : la
    // question revient à l'utilisateur plutôt qu'à un ordre de tri.
    expect(choisirSalleDuJour(sansPreference, [mienne, { id: "s-2", userId: MOI }]))
      .toBeNull();
  });

  it("compte la salle du compte même noyée dans celles des autres", () => {
    // Contrôle négatif de la correction : filtrer ne doit pas revenir à ne
    // plus rien trouver.
    expect(choisirSalleDuJour(sansPreference, [sienne, mienne, { id: "s-4", userId: VOISIN }]))
      .toBe(mienne);
  });

  it("ne rattache rien à un lieu sans responsable", () => {
    expect(choisirSalleDuJour(sansPreference, [{ id: "s-orpheline", userId: null }]))
      .toBeNull();
  });
});
