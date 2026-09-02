import { describe, it, expect } from "vitest";
import { creerHorlogeDIntention } from "./intention";

/**
 * L'horloge des intentions n'a qu'un devoir : ne jamais rendre deux fois le
 * même nombre, ni un nombre plus petit que le précédent. Toute la garantie
 * « la plus récente gagne » repose dessus — un nombre qui recule ferait
 * rejeter, comme périmées, des modifications que l'utilisateur vient de faire.
 */

describe("strictement croissante", () => {
  it("deux appels dans la même milliseconde ne rendent pas le même nombre", () => {
    // Le cas réel : taper puis fermer aussitôt. Sans le « +1 », le filet de
    // sortie porterait la même intention que l'envoi du blur et ne gagnerait
    // pas — c'est-à-dire perdrait la dernière valeur tapée.
    const horloge = creerHorlogeDIntention(() => 1_700_000_000_000);
    const a = horloge();
    const b = horloge();
    expect(b).toBeGreaterThan(a);
  });

  it("et cent appels d'affilée restent ordonnés", () => {
    const horloge = creerHorlogeDIntention(() => 1_700_000_000_000);
    const suite = Array.from({ length: 100 }, () => horloge());
    expect(suite).toEqual([...suite].sort((x, y) => x - y));
    expect(new Set(suite).size).toBe(100);
  });
});

describe("une horloge système qui recule ne fait pas reculer les intentions", () => {
  it("un retour en arrière du temps ne produit pas de nombre plus petit", () => {
    // Changement d'heure, synchronisation NTP, réveil de veille : l'horloge
    // murale n'est pas monotone. Les intentions, elles, doivent l'être.
    let temps = 1_700_000_000_000;
    const horloge = creerHorlogeDIntention(() => temps);
    const avant = horloge();
    temps -= 3_600_000;
    expect(horloge()).toBeGreaterThan(avant);
  });
});

describe("elle repart de l'heure murale, pas de zéro", () => {
  it("une horloge neuve dépasse ce qu'une précédente avait produit", () => {
    // C'est ce qui permet de survivre à un rechargement de page. Un compteur
    // reparti à 1 serait inférieur à ce qui est déjà en base, et TOUTES les
    // écritures suivantes seraient rejetées comme périmées — l'écran
    // n'enregistrerait plus rien, silencieusement.
    const premiere = creerHorlogeDIntention(() => 1_700_000_000_000);
    const dejaEnBase = premiere();

    const apresRechargement = creerHorlogeDIntention(() => 1_700_000_005_000);
    expect(apresRechargement()).toBeGreaterThan(dejaEnBase);
  });

  it("deux horloges de la même page ne se marchent pas dessus au point de reculer", () => {
    // Deux champs différents peuvent partager l'horloge du module ; deux
    // instances distinctes restent au moins comparables par l'heure murale.
    let temps = 1_700_000_000_000;
    const maintenant = () => temps;
    const note = creerHorlogeDIntention(maintenant);
    const reglage = creerHorlogeDIntention(maintenant);
    const a = note();
    temps += 1;
    expect(reglage()).toBeGreaterThan(a);
  });
});
