import { describe, it, expect } from "vitest";
import { etatDuJour, lienDemarrage, type EntreeEtatDuJour } from "./etat-du-jour";

const salle = { id: "s-1", nom: "St-Martin-Du-Touch" };

const base: EntreeEtatDuJour = {
  salle,
  machinesDansLaSalle: 12,
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
      { machinesDansLaSalle: 0 },
      { prochaineSeance: null },
      { seanceFaiteAujourdhui: true },
      { seancesCetteSemaine: 9 },
      { salle: null, machinesDansLaSalle: 0, prochaineSeance: null },
    ];
    for (const c of cas) expect(avec(c).action).toBeTruthy();
  });

  it("demande la salle avant tout le reste", () => {
    // Sans salle, ni le matériel ni les charges ne sont calculables.
    const r = avec({ salle: null, machinesDansLaSalle: 0, prochaineSeance: null });
    expect(r.etat).toBe("sans_salle");
    expect(r.action.type).toBe("choisir_salle");
    expect(r.enAttenteDeDonnees).toBe(true);
  });

  it("demande le matériel quand le parc est inconnu, sans inventer de séance", () => {
    const r = avec({ machinesDansLaSalle: 0, prochaineSeance: null });
    expect(r.etat).toBe("salle_vide");
    expect(r.seance).toBeNull();
    expect(r.action).toEqual({ type: "equiper_salle", href: "/gyms/s-1/materiel" });
  });

  it("n'annonce ni repos ni semaine complète tant que rien n'est possible", () => {
    // Un parc vide passe avant : féliciter quelqu'un qui n'a pas pu s'entraîner
    // serait faux.
    expect(avec({ machinesDansLaSalle: 0, seanceFaiteAujourdhui: true }).etat).toBe("salle_vide");
    expect(avec({ machinesDansLaSalle: 0, seancesCetteSemaine: 9 }).etat).toBe("salle_vide");
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
