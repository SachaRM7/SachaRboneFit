import { describe, it, expect, vi } from "vitest";
import {
  envoyerIncident, arreterEnConsignant, URL_INCIDENTS, type EnvoiIncident,
} from "./incident-en-vol";
import type { Poster } from "./arret-sur-douleur";

/**
 * « Terminer la séance » consigne le symptôme — prouvé contre un réseau muet.
 *
 * LE DÉFAUT
 *
 * L'ordre était bon et l'appel n'était pas attendu, mais le `fetch` partait
 * sans `keepalive`. Une requête ordinaire est liée au document qui l'a émise :
 * `router.push(".../finish")` l'annule, et sur Safari mobile presque toujours.
 * Le contrat « terminer → incident persisté » n'était donc pas tenu par l'UI.
 *
 * POURQUOI CES TESTS ET PAS UN APPEL À `/api/incidents`
 *
 * La route, elle, marchait déjà : `symptome-general.itest.ts` le montre. Le
 * défaut vivait entre le clic et la route, dans le gestionnaire. Ces tests
 * exercent donc les DEUX pièces réellement livrées — `arreterEnConsignant`,
 * que `SOSSymptome.arreter()` appelle, et `envoyerIncident`, que le
 * gestionnaire de la page appelle — assemblées comme elles le sont en
 * production.
 *
 * Le poste-lettre ne se résout JAMAIS. C'est la seule forme de preuve qui
 * vaille : une promesse résolue, même immédiatement, laisserait passer un
 * `await` — le test verrait l'arrêt avoir lieu et conclurait que tout va bien,
 * alors qu'en salle, à dix secondes de latence, l'athlète resterait dix
 * secondes dans la séance qu'il vient d'arrêter.
 */

/** Une requête partie et jamais revenue. */
const jamais = (): Poster => vi.fn(() => new Promise<never>(() => {}));

const ENVOI: EnvoiIncident = {
  sessionLogId: "11111111-1111-1111-1111-111111111111",
  type: "symptome_general",
  contexte: { symptome: "vertige", intensite: 8, moment: "pendant_seance" },
  decision: "arreter",
};

describe("arrêter sur symptôme : le chemin complet, réseau en vol", () => {
  it("la navigation part sans attendre la réponse du serveur", () => {
    /*
     * Le scénario exact : symptôme fort, « Terminer maintenant », et la
     * requête d'incident laissée pendante. C'est la composition réellement
     * livrée — `SOSSymptome.arreter()` appelle `arreterEnConsignant`, dont le
     * `consigner` finit dans `envoyerIncident`.
     */
    const poster = jamais();
    const onStopSeance = vi.fn();
    const onClose = vi.fn();

    // Pas de `await` : ni l'une ni l'autre des deux fonctions ne rend de
    // promesse, donc un appelant ne PEUT pas les attendre.
    arreterEnConsignant({
      consigner: () => envoyerIncident(ENVOI, { poster }),
      onStopSeance,
      onClose,
    });

    expect(poster, "l'incident n'a pas été lancé").toHaveBeenCalledTimes(1);
    expect(onStopSeance, "l'arrêt attend encore la réponse du serveur")
      .toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("l'incident est lancé AVANT l'arrêt", () => {
    /*
     * L'ordre n'est pas cosmétique. Après `onStopSeance`, la navigation peut
     * démonter le composant, et l'état qui compose le corps de la requête —
     * le symptôme choisi, l'intensité, la note — n'aurait plus de raison
     * d'exister.
     */
    const ordre: string[] = [];
    const poster: Poster = vi.fn(() => {
      ordre.push("incident");
      return new Promise<never>(() => {});
    });

    arreterEnConsignant({
      consigner: () => envoyerIncident(ENVOI, { poster }),
      onStopSeance: () => { ordre.push("arret"); },
      onClose: () => { ordre.push("fermeture"); },
    });

    expect(ordre).toEqual(["incident", "arret", "fermeture"]);
  });

  it("la requête porte keepalive : elle survit à la navigation", () => {
    // Sans ce drapeau, `router.push` annule la requête et le symptôme le plus
    // sérieux de la séance est le seul à se perdre.
    const poster = jamais();
    envoyerIncident(ENVOI, { poster });

    const [url, init] = (poster as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(URL_INCIDENTS);
    expect(init.keepalive, "sans keepalive, la navigation annule l'incident").toBe(true);
    expect(init.method).toBe("POST");
  });

  it("et le corps est bien celui que la route attend", () => {
    // Aucune seconde route, aucun contournement : c'est `/api/incidents`, avec
    // sa vérification de propriété de séance.
    const poster = jamais();
    envoyerIncident(ENVOI, { poster });

    const init = (poster as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(JSON.parse(init.body)).toEqual({
      session_log_id: ENVOI.sessionLogId,
      type: "symptome_general",
      contexte: ENVOI.contexte,
      decision: "arreter",
    });
  });

  it("plusieurs microtâches plus tard, la requête est toujours en vol", async () => {
    const poster = jamais();
    const onStopSeance = vi.fn();
    const onClose = vi.fn();

    arreterEnConsignant({
      consigner: () => envoyerIncident(ENVOI, { poster }),
      onStopSeance, onClose,
    });
    await Promise.resolve();
    await Promise.resolve();

    // L'arrêt a déjà eu lieu, et rien n'est appelé une seconde fois.
    expect(onStopSeance).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("rien ne peut empêcher l'arrêt", () => {
  it("un rejet réseau ne le bloque pas, et ne remonte nulle part", async () => {
    const poster: Poster = vi.fn(() => Promise.reject(new Error("hors ligne")));
    const onStopSeance = vi.fn();

    expect(() => arreterEnConsignant({
      consigner: () => envoyerIncident(ENVOI, { poster }),
      onStopSeance, onClose: vi.fn(),
    })).not.toThrow();
    await Promise.resolve();

    expect(onStopSeance).toHaveBeenCalledTimes(1);
  });

  it("un échec SYNCHRONE du poste-lettre non plus", () => {
    // `fetch` lève de façon synchrone sur une URL invalide, ou dans un
    // contexte sans réseau.
    const poster: Poster = vi.fn(() => { throw new Error("pas de réseau"); });
    const onStopSeance = vi.fn();

    expect(() => arreterEnConsignant({
      consigner: () => envoyerIncident(ENVOI, { poster }),
      onStopSeance, onClose: vi.fn(),
    })).not.toThrow();
    expect(onStopSeance).toHaveBeenCalledTimes(1);
  });

  it("et même un `consigner` qui explose laisse l'arrêt avoir lieu", () => {
    // Une gêne assez forte pour qu'on termine la séance ne doit pas dépendre
    // d'un bug dans la construction du corps de la requête.
    const onStopSeance = vi.fn();
    const onClose = vi.fn();

    arreterEnConsignant({
      consigner: () => { throw new Error("état incohérent"); },
      onStopSeance, onClose,
    });

    expect(onStopSeance).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("aucune des deux fonctions ne rend de promesse", () => {
    /*
     * Le défaut se réintroduirait par la porte de l'appelant : un
     * `await enregistrerIncident(...)` redeviendrait possible, et l'arrêt
     * réattendrait le réseau. C'est la leçon de `arreterSurDouleur`.
     */
    expect(envoyerIncident(ENVOI, { poster: jamais() })).toBeUndefined();
    expect(arreterEnConsignant({
      consigner: () => {}, onStopSeance: () => {}, onClose: () => {},
    })).toBeUndefined();
  });
});

describe("les chemins qui ne naviguent pas gardent leur retour d'erreur", () => {
  it("un refus de la route prévient l'utilisateur", async () => {
    /*
     * `fetch` ne rejette pas sur un 4xx : il ne considère comme une erreur que
     * l'échec du transport. Sans le test sur `ok`, une requête refusée — un
     * 403 sur la séance d'un autre compte — passerait pour un succès.
     */
    const onEchec = vi.fn();
    const poster: Poster = vi.fn(() => Promise.resolve({ ok: false, status: 403 }));

    envoyerIncident(ENVOI, { poster, onEchec });
    await Promise.resolve();
    await Promise.resolve();

    expect(onEchec).toHaveBeenCalledTimes(1);
  });

  it("une réponse acceptée ne prévient personne", async () => {
    const onEchec = vi.fn();
    const poster: Poster = vi.fn(() => Promise.resolve({ ok: true, status: 201 }));

    envoyerIncident(ENVOI, { poster, onEchec });
    await Promise.resolve();
    await Promise.resolve();

    expect(onEchec).not.toHaveBeenCalled();
  });

  it("l'énergie et le temps postent par le même chemin, keepalive compris", () => {
    /*
     * Le correctif ne concerne pas que le symptôme. Les trois autres SOS ne
     * naviguent pas, mais une requête émise juste avant que l'utilisateur
     * bascule d'application ou ferme l'onglet avait la même chance de se
     * perdre.
     */
    for (const type of ["energie_chute", "temps_depasse", "machine_occupee"]) {
      const poster = jamais();
      envoyerIncident({ ...ENVOI, type, decision: "alleger" }, { poster });
      const init = (poster as ReturnType<typeof vi.fn>).mock.calls[0]![1];
      expect(init.keepalive, `${type} poste sans keepalive`).toBe(true);
      expect(JSON.parse(init.body).type).toBe(type);
    }
  });
});
