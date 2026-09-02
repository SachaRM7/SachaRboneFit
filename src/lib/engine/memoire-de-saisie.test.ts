import { describe, it, expect } from "vitest";
import { MemoireDeSaisie } from "./memoire-de-saisie";

/**
 * La question à laquelle cette classe répond : « reste-t-il quelque chose à
 * sauver ? », et elle ne doit jamais y répondre non à tort.
 *
 * Le défaut d'origine tenait en une ligne : la valeur était marquée comme
 * enregistrée au moment de l'ENVOI, pas de la RÉPONSE. Modifier la note puis
 * fermer aussitôt marquait la valeur comme sue ; le filet de sortie comparait,
 * trouvait égal, ne partait pas ; et si la requête échouait, la note était
 * perdue — alors que l'écran promet précisément l'inverse.
 */

describe("partir n'est pas arriver", () => {
  it("un envoi n'avance pas la valeur confirmée", () => {
    const m = new MemoireDeSaisie("");
    m.commencer();
    // Le cœur du défaut corrigé : tant que le serveur n'a pas répondu, la
    // valeur reste non confirmée, donc à sauver.
    expect(m.valeurConfirmee).toBe("");
    expect(m.aSauvegarder("siège 6")).toBe(true);
    expect(m.enVol).toBe(true);
  });

  it("seule la réponse fait avancer", () => {
    const m = new MemoireDeSaisie("");
    const jeton = m.commencer();
    m.reussite(jeton, "siège 6");
    expect(m.valeurConfirmee).toBe("siège 6");
    expect(m.aSauvegarder("siège 6")).toBe(false);
    expect(m.enVol).toBe(false);
  });
});

describe("un échec n'est jamais un succès", () => {
  it("la valeur reste non persistée après un échec réseau", () => {
    const m = new MemoireDeSaisie("ancienne");
    const jeton = m.commencer();
    m.echec(jeton);
    expect(m.valeurConfirmee).toBe("ancienne");
    // Le scénario complet de la revue : échec, puis fermeture. Le filet doit
    // partir.
    expect(m.aSauvegarder("nouvelle")).toBe(true);
  });

  it("un échec ne laisse pas croire à un envoi éternellement en vol", () => {
    const m = new MemoireDeSaisie("");
    m.echec(m.commencer());
    expect(m.enVol).toBe(false);
  });
});

describe("fermeture juste après le blur", () => {
  it("le filet de sortie part tant que la réponse n'est pas là", () => {
    // blur -> envoi -> fermeture immédiate, sans réponse.
    const m = new MemoireDeSaisie("");
    m.commencer();
    expect(m.aSauvegarder("siège 6 parfait")).toBe(true);
  });

  it("et ne part pas quand la réponse est arrivée avant la fermeture", () => {
    const m = new MemoireDeSaisie("");
    m.reussite(m.commencer(), "siège 6 parfait");
    // Pas de doublon inutile : le serveur a confirmé exactement cette valeur.
    expect(m.aSauvegarder("siège 6 parfait")).toBe(false);
  });

  it("mais part si l'on a retapé depuis la confirmation", () => {
    const m = new MemoireDeSaisie("");
    m.reussite(m.commencer(), "siège 6");
    expect(m.aSauvegarder("siège 7")).toBe(true);
  });
});

describe("deux envois rapprochés", () => {
  it("une réponse ancienne n'écrase pas une plus récente", () => {
    const m = new MemoireDeSaisie("");
    const premier = m.commencer();
    const second = m.commencer();

    // Le second revient d'abord.
    expect(m.reussite(second, "final")).toBe(true);
    expect(m.valeurConfirmee).toBe("final");

    // Le premier arrive en retard : il doit être ignoré, sinon il ferait
    // reculer la valeur confirmée et l'écran repartirait sur « à sauver ».
    expect(m.reussite(premier, "intermédiaire")).toBe(false);
    expect(m.valeurConfirmee).toBe("final");
    expect(m.aSauvegarder("final")).toBe(false);
  });

  it("un échec tardif du premier ne défait pas le succès du second", () => {
    const m = new MemoireDeSaisie("");
    const premier = m.commencer();
    const second = m.commencer();
    m.reussite(second, "final");
    m.echec(premier);
    expect(m.valeurConfirmee).toBe("final");
    expect(m.aSauvegarder("final")).toBe(false);
  });

  it("l'échec du plus récent laisse bien à sauver", () => {
    const m = new MemoireDeSaisie("");
    m.reussite(m.commencer(), "un");
    m.echec(m.commencer());
    expect(m.valeurConfirmee).toBe("un");
    expect(m.aSauvegarder("deux")).toBe(true);
  });
});

describe("démontage pendant une requête", () => {
  it("laisse la valeur non confirmée, donc à sauver", () => {
    const m = new MemoireDeSaisie("ancienne");
    m.commencer();
    // Le composant disparaît ici. Aucune réponse ne viendra l'appliquer.
    expect(m.aSauvegarder("nouvelle")).toBe(true);
    expect(m.valeurConfirmee).toBe("ancienne");
  });
});

describe("effacement complet", () => {
  it("vider la note est une modification comme une autre", () => {
    const m = new MemoireDeSaisie("siège 6 parfait");
    expect(m.aSauvegarder("")).toBe(true);
    m.reussite(m.commencer(), "");
    expect(m.valeurConfirmee).toBe("");
    expect(m.aSauvegarder("")).toBe(false);
  });

  it("et le serveur peut confirmer autre chose que ce qu'on a envoyé", () => {
    // Le serveur normalise : « siège 6  » devient « siège 6 ». C'est SA
    // réponse qui devient la référence, sinon l'écran croirait avoir encore
    // quelque chose à sauver à chaque fermeture.
    const m = new MemoireDeSaisie("");
    m.reussite(m.commencer(), "siège 6");
    expect(m.aSauvegarder("siège 6")).toBe(false);
  });
});
