import { describe, it, expect, vi } from "vitest";
import { arreterSurDouleur, type Poster } from "./arret-sur-douleur";

/**
 * L'invariant, prouvé contre un réseau qui ne répond JAMAIS.
 *
 * C'est la seule forme de preuve qui vaille ici. Un `poster` qui se résout,
 * même immédiatement, laisserait passer un `await` : le test verrait
 * `onStopSeance` appelé et conclurait que tout va bien, alors qu'en salle,
 * avec dix secondes de latence, l'athlète resterait dix secondes dans la
 * séance qu'il vient d'arrêter.
 *
 * La promesse ci-dessous ne se résout donc pas, et ne se rejette pas non plus.
 * Aucune horloge, aucune bascule de microtâche : si `onStopSeance` n'est pas
 * déjà appelé quand `arreterSurDouleur` rend la main, le test échoue.
 */

/** Une requête partie et jamais revenue. */
const jamais = (): Poster => vi.fn(() => new Promise<never>(() => {}));

const actions = () => ({
  onStopSeance: vi.fn(),
  onClose: vi.fn(),
});

const ENVOI = { url: "/api/douleur", corps: { session_log_id: "abc", niveau: 8 } };

describe("l'arrêt n'attend pas le réseau", () => {
  it("onStopSeance est appelé alors que la requête est encore en vol", () => {
    const poster = jamais();
    const { onStopSeance, onClose } = actions();

    // Pas de `await` : c'est le cœur du test. La fonction ne rend même pas de
    // promesse, donc un appelant ne PEUT pas l'attendre.
    arreterSurDouleur({ envoi: ENVOI, onStopSeance, onClose, poster });

    expect(poster).toHaveBeenCalledTimes(1);
    expect(onStopSeance, "l'arrêt attend encore la réponse du serveur")
      .toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("et rien ne se résout jamais, y compris après plusieurs microtâches", async () => {
    const poster = jamais();
    const { onStopSeance, onClose } = actions();

    arreterSurDouleur({ envoi: ENVOI, onStopSeance, onClose, poster });
    // Laisser tourner la file de microtâches : la requête reste en vol, et
    // l'arrêt, lui, a déjà eu lieu. Rien n'est appelé une seconde fois.
    await Promise.resolve();
    await Promise.resolve();

    expect(onStopSeance).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("l'ordre est celui qu'on attend : on poste, puis on quitte", () => {
    const ordre: string[] = [];
    const poster: Poster = vi.fn(() => {
      ordre.push("poste");
      return new Promise<never>(() => {});
    });
    const onStopSeance = vi.fn(() => { ordre.push("arret"); });
    const onClose = vi.fn(() => { ordre.push("fermeture"); });

    arreterSurDouleur({ envoi: ENVOI, onStopSeance, onClose, poster });

    // Poster d'abord n'est pas cosmétique : après `onStopSeance`, la
    // navigation peut démonter le composant, et l'état qui compose le corps
    // de la requête n'aurait plus de raison d'exister.
    expect(ordre).toEqual(["poste", "arret", "fermeture"]);
  });
});

describe("la persistance est un tir-et-oublie honnête", () => {
  it("la requête part en keepalive : elle survit à la navigation", () => {
    const poster = jamais();
    const { onStopSeance, onClose } = actions();

    arreterSurDouleur({ envoi: ENVOI, onStopSeance, onClose, poster });

    const [url, init] = (poster as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/douleur");
    expect(init.keepalive, "sans keepalive, la navigation annule le signalement")
      .toBe(true);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(ENVOI.corps);
  });

  it("un rejet n'empêche pas l'arrêt, et ne remonte nulle part", async () => {
    // Après l'arrêt il n'y a plus d'écran pour montrer une erreur ; une
    // promesse rejetée sans gestionnaire finirait dans la console du
    // navigateur, sur un écran que l'utilisateur vient de quitter.
    const poster: Poster = vi.fn(() => Promise.reject(new Error("hors ligne")));
    const { onStopSeance, onClose } = actions();

    expect(() =>
      arreterSurDouleur({ envoi: ENVOI, onStopSeance, onClose, poster })).not.toThrow();
    await Promise.resolve();

    expect(onStopSeance).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("un échec SYNCHRONE du poste-lettre n'empêche pas l'arrêt non plus", () => {
    // `fetch` lève de façon synchrone sur une URL invalide, ou dans un
    // contexte sans réseau. L'arrêt doit avoir lieu là aussi.
    const poster: Poster = vi.fn(() => { throw new Error("pas de réseau"); });
    const { onStopSeance, onClose } = actions();

    expect(() =>
      arreterSurDouleur({ envoi: ENVOI, onStopSeance, onClose, poster })).not.toThrow();
    expect(onStopSeance).toHaveBeenCalledTimes(1);
  });

  it("la fonction ne rend rien — un appelant ne peut pas l'attendre", () => {
    // Le défaut se réintroduirait par la porte de l'appelant si elle rendait
    // une promesse : un `await arreter()` redeviendrait possible.
    const { onStopSeance, onClose } = actions();
    const rendu = arreterSurDouleur({ envoi: ENVOI, onStopSeance, onClose, poster: jamais() });
    expect(rendu).toBeUndefined();
  });
});
