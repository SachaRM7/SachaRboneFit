import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Focus et Liste montrent la MÊME séance — et doivent le rester.
 *
 * Sixième garde structurel du dépôt, après `reglages-ont-un-chemin`,
 * `douleur-a-un-chemin`, `fiche-a-un-chemin`, `recuperation-a-un-chemin` et
 * `symptome-reste-general`.
 *
 * LE DÉFAUT QU'IL EMPÊCHE
 *
 * Ajouter une seconde vue est l'occasion parfaite de dupliquer un écran. La
 * copie marche le premier jour ; ensuite l'une gagne une correction que l'autre
 * n'a pas, et la divergence est SILENCIEUSE — une série validée en Focus qui
 * n'apparaît pas en Liste ne lève aucune erreur, elle donne juste tort à
 * l'application.
 *
 * La garantie tenue ici n'est pas « les deux vues sont synchronisées » : c'est
 * qu'il n'y a RIEN à synchroniser. Même store, même composant de saisie, même
 * calcul d'avancement. Le sélecteur ne change que le nombre d'exercices rendus.
 *
 * Ce fichier lit le texte du dépôt. Les tests de comportement des primitives
 * vivent dans `lib/live/vue-live.test.ts` ; celui-ci empêche la FORME qui les
 * rendrait sans effet.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const lire = (f: string) => sansCommentaires(readFileSync(path.join(RACINE, f), "utf8"));

/** Tous les fichiers d'un dossier, récursivement. */
function fichiers(relatif: string, suffixes: string[]): string[] {
  return readdirSync(path.join(RACINE, relatif), { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(relatif, e.name);
    if (e.isDirectory()) return fichiers(chemin, suffixes);
    return suffixes.some((suffixe) => e.name.endsWith(suffixe)) ? [chemin] : [];
  });
}

const PAGE = "app/(app)/sessions/new/[templateId]/page.tsx";
const FOCUS = "components/session/VueFocus.tsx";
const LECTEUR = "components/session/LecteurExercice.tsx";
const TABLEAU = "components/session/TableauSeries.tsx";
const CONTROLEUR = "components/session/useSaisieSeries.ts";
const LISTE_COMPACTE = "components/session/ListeCompacte.tsx";
const SELECTEUR = "components/session/SelecteurVue.tsx";
const VUE_LIVE = "lib/live/vue-live.ts";
const STORE = "stores/sessionStore.ts";
const SERIE_EN_VOL = "components/session/serie-en-vol.ts";

describe("il n'y a rien à synchroniser entre les deux vues", () => {
  it("les deux vues passent par le MÊME contrôleur de saisie", () => {
    /*
     * CE QUE CE GARDE PROTÈGE A CHANGÉ DE FORME, PAS DE NATURE.
     *
     * Il exigeait que le Focus rende `TableauSeries` — le composant de la vue
     * Liste. C'était la façon la plus simple de garantir qu'il n'existe qu'une
     * validation, qu'un historique, qu'une réouverture de série ; c'était aussi
     * ce qui rendait les deux vues presque identiques, et donc le Focus inutile.
     *
     * La séparation des deux compositions est délibérée. Ce qui reste interdit
     * est la duplication de ce qui DÉCIDE : les deux vues doivent lire le même
     * contrôleur. La forme à empêcher est toujours la même — un tracker réécrit
     * pour l'une des deux, dont la première correction manquerait à l'autre.
     */
    for (const vue of [LECTEUR, TABLEAU]) {
      expect(lire(vue), `${vue} n'utilise pas useSaisieSeries`)
        .toMatch(/useSaisieSeries\(\{/);
    }
    // La vue Focus est une COMPOSITION : elle navigue, elle ne saisit pas.
    expect(lire(FOCUS), "VueFocus court-circuite le lecteur")
      .toMatch(/<LecteurExercice\s/);
  });

  it("et aucune vue n'écrit de série elle-même", () => {
    /*
     * `useSaisieSeries` est le seul à toucher au store. Une vue qui appelle
     * `upsertSet` directement contourne la validation qui refuse une série
     * vide, et la série disparaît silencieusement à la clôture.
     */
    for (const vue of [FOCUS, LECTEUR, TABLEAU]) {
      for (const interdit of ["upsertSet", "removeSet", "fetch(", "/api/"]) {
        expect(lire(vue), `${vue} contient ${interdit}`).not.toContain(interdit);
      }
    }
  });

  it("les lignes rendues ne sont pas les slots restants", () => {
    /*
     * LE DÉFAUT DU DEADLIFT.
     *
     * `slotsARemplir` rend ce qu'il RESTE à faire : la liste rétrécit à chaque
     * validation, c'est sa raison d'être. La passer à une vue comme liste de
     * lignes faisait disparaître la série qu'on venait de valider — 1/2 affiché,
     * et S1 introuvable.
     *
     * Aucune vue ne doit donc appeler `slotsARemplir` pour décider de son rendu.
     * Elles passent par `lignesAAfficher`, qui réunit le fait et le restant.
     */
    for (const vue of [FOCUS, LECTEUR, TABLEAU]) {
      expect(lire(vue), `${vue} rend les slots libres au lieu des lignes`)
        .not.toContain("slotsARemplir");
    }
    expect(lire(CONTROLEUR)).toMatch(/lignesAAfficher\(/);
  });

  it("l'avancement est calculé une seule fois, pour les deux vues", () => {
    /*
     * Deux décomptes séparés finiraient par se contredire : 2/3 dans une vue,
     * 3/3 dans l'autre, et personne ne saurait laquelle croire.
     */
    const page = lire(PAGE);
    expect(page).toMatch(/const etats = avancement\(/);
    expect([...page.matchAll(/avancement\(/g)], "l'avancement est calculé deux fois")
      .toHaveLength(1);

    // Et les composants le REÇOIVENT, ils ne le recalculent pas.
    for (const f of [FOCUS, LISTE_COMPACTE]) {
      expect(lire(f), `${f} recalcule l'avancement`).not.toMatch(/avancement\(/);
    }
  });

  it("les deux vues montent les mêmes actions d'exercice", () => {
    /*
     * Le remplacement, monté deux fois, aurait pu devenir possible d'un côté
     * seulement — sans que rien ne le signale.
     */
    const page = lire(PAGE);
    expect(page).toMatch(/const actionsDeLExercice =/);
    expect([...page.matchAll(/<RemplacerExercice/g)], "RemplacerExercice est monté deux fois")
      .toHaveLength(1);
  });

  it("changer de vue ne recharge rien et ne crée aucune séance", () => {
    /*
     * Le sélecteur ne change pas d'écran : il change ce qui est rendu. Un
     * `router.push` ou un `start()` accroché au changement de vue recréerait
     * une session ou viderait le brouillon.
     */
    const page = lire(PAGE);
    const bloc = page.slice(page.indexOf("const choisirVue"), page.indexOf("const choisirVue") + 400);
    expect(bloc).toMatch(/setVue\(v\)/);
    for (const interdit of ["router.push", "start(", "clear(", "fetch("]) {
      expect(bloc, `changer de vue déclenche ${interdit}`).not.toContain(interdit);
    }
  });

  it("le sélecteur ne connaît que les vues du référentiel", () => {
    // Une troisième vue écrite en dur ici n'existerait dans aucun calcul.
    expect(lire(SELECTEUR)).toMatch(/VUES_LIVE/);
  });
});

describe("l'exercice courant est une navigation, pas une déduction", () => {
  it("la page ne recalcule plus « premier non terminé » à la main", () => {
    /*
     * L'ancienne forme : `visibles.findIndex(e => seriesValidees(e.id) < …)`,
     * recalculée à chaque rendu. Ouvrir le 4 pour préparer sa machine renvoyait
     * au 2 dès la série suivante — l'écran sautait sous les doigts.
     */
    const page = lire(PAGE);
    expect(page).toMatch(/exerciceAffiche\(etats,/);
    expect(page, "l'index est de nouveau déduit dans le rendu")
      .not.toMatch(/const premierNonTermine = visibles\.findIndex/);
  });

  it("la navigation passe par le store, donc survit au changement de vue", () => {
    const page = lire(PAGE);
    expect(page).toMatch(/setCurrentExerciseIndex/);
    // Un `useState` local pour l'exercice courant serait remis à zéro à chaque
    // bascule Focus ↔ Liste, et perdu au rafraîchissement.
    expect(lire(FOCUS), "Focus garde l'exercice courant dans un état local")
      .not.toMatch(/useState<number>|useState\(0\)/);
  });

  it("et la règle de correction vit dans le moteur, pas dans l'écran", () => {
    const regle = lire(VUE_LIVE);
    expect(regle).toMatch(/export function exerciceAffiche/);
    expect(regle).toMatch(/export function avancement/);
  });
});

describe("une série validée atteint la base sans retenir personne", () => {
  it("la persistance est branchée dans le store, pas dans un écran", () => {
    /*
     * Le store est le seul endroit que Focus, Liste et les SOS traversent tous.
     * Brancher l'envoi dans un composant aurait obligé à l'écrire deux fois,
     * et la première divergence aurait été muette.
     */
    const store = lire(STORE);
    expect(store).toMatch(/pousserSerie\(/);
    expect(store).toMatch(/retirerSerieEnVol\(/);
    for (const f of [FOCUS, "components/session/TableauSeries.tsx"]) {
      expect(lire(f), `${f} poste lui-même les séries`).not.toMatch(/pousserSerie/);
    }
  });

  it("l'envoi part en keepalive et ne rend pas de promesse", () => {
    /*
     * `keepalive` pour survivre à la fermeture de l'onglet — c'est le
     * mécanisme du lot 16. Et aucune promesse rendue : un appelant ne doit pas
     * pouvoir l'attendre, sinon valider une série redeviendrait bloquant.
     */
    const source = lire(SERIE_EN_VOL);
    expect(source).toMatch(/keepalive: true/);
    expect(source).toMatch(/export function pousserSerie\([\s\S]*?\): void/);
    expect(source).toMatch(/export function retirerSerieEnVol\([\s\S]*?\): void/);
  });

  it("une reprise n'insiste pas sur un refus définitif", () => {
    // Rejouer un 422 donnerait trois fois le même refus, et userait la
    // batterie d'un téléphone en salle pour rien.
    expect(lire(SERIE_EN_VOL)).toMatch(/function meriteUneReprise/);
  });

  it("seules les séries qui mesurent quelque chose sont envoyées", () => {
    // Une ligne à moitié saisie n'a rien à persister, et le serveur la
    // refuserait — l'envoyer produirait un 422 à chaque frappe.
    expect(lire(STORE)).toMatch(/newSet\.repsEffectuees !== null && newSet\.charge !== null/);
  });
});

describe("le pas du stepper vient du matériel, pas de l'écran", () => {
  it("la règle vit dans le moteur de charges", () => {
    /*
     * Un `valeur + 2.5` écrit dans React serait un second moteur d'arrondi :
     * il transformerait [5, 10, 17.5, 25] en 5, 7.5, 10 — des charges que
     * l'appareil ne produit pas.
     */
    const moteur = lire("lib/engine/charges.ts");
    expect(moteur).toMatch(/export function voisineCharge/);
    // Elle est distincte de `prochaineCharge` : celle-là suit la PROGRESSION,
    // qui descend sur une assistance. Un `+` qui allège serait un piège.
    expect(moteur).toMatch(/export function prochaineCharge/);
  });

  it("aucun composant de séance n'écrit d'incrément en dur", () => {
    for (const f of [FOCUS, "components/session/TableauSeries.tsx", "components/session/PasDeCharge.tsx"]) {
      const source = lire(f);
      expect(source, `${f} ajoute un incrément écrit à la main`)
        .not.toMatch(/charge\s*[+-]\s*[0-9]/);
    }
  });

  it("le stepper demande au moteur, il ne calcule pas", () => {
    const source = lire("components/session/PasDeCharge.tsx");
    expect(source).toMatch(/voisineCharge\(/);
    // `prochaineCharge` suivrait la PROGRESSION, qui descend sur une
    // assistance : le `+` allègerait l'exercice sans rien dire.
    expect(source, "le stepper suit la progression au lieu du matériel")
      .not.toMatch(/prochaineCharge\(/);
  });

  it("une charge irréalisable est signalée, jamais corrigée en silence", () => {
    /*
     * La remplacer d'autorité ferait enregistrer autre chose que ce qui a été
     * soulevé. L'écran informe et propose les voisines réelles ; c'est
     * l'utilisateur qui choisit.
     */
    const source = lire("components/session/PasDeCharge.tsx");
    expect(source).toMatch(/export function alerteChargeIrrealisable/);
    expect(source).toMatch(/chargeAtteignable\(/);
    /*
     * L'alerte est calculée dans le contrôleur, donc pour LES DEUX vues à la
     * fois : elle vivait dans le tableau, où seule la Liste en profitait.
     */
    expect(lire(CONTROLEUR)).toMatch(/alerteChargeIrrealisable\(/);
    for (const vue of [LECTEUR, TABLEAU]) {
      expect(lire(vue), `${vue} n'affiche pas l'alerte de charge`)
        .toMatch(/alerte/);
    }
  });

  it("la grille complète de l'appareil atteint bien la prescription", () => {
    // Sans les paliers ni les bornes, un râtelier [2, 4, 6, 10] serait proposé
    // de 2 en 2 — et le cran à 8 n'existe pas.
    const plan = lire("services/plan-seance.ts");
    for (const champ of ["paliersCharges", "chargeMinimale", "chargeMax"]) {
      expect(plan, `${champ} n'est pas exposé au Live`).toContain(`${champ}: l.${champ}`);
    }
  });
});

describe("les acquis des lots précédents ne sont pas défaits", () => {
  it("les quatre SOS restent montés, dans les deux vues", () => {
    /*
     * Ils vivent au niveau de la PAGE, hors des deux vues : c'est ce qui
     * garantit qu'ils sont identiques dans l'une et dans l'autre, et que
     * basculer ne ferme pas un incident en cours.
     */
    const page = lire(PAGE);
    for (const sos of ["SOSMachineOccupee", "SOSDouleur", "SOSEtat", "SOSTempsDepasse"]) {
      expect(page, `${sos} n'est plus monté`).toContain(sos);
    }
    // Le bouton « État ↓ » du lot 16, pas l'ancien « Énergie ↓ ».
    expect(page).toMatch(/setModaleSOS\("etat"\)/);
    expect(page).toContain("Mon état a changé");
  });

  it("et les deux vues ne les montent pas elles-mêmes", () => {
    for (const sos of ["SOSDouleur", "SOSEtat", "SOSSymptome"]) {
      expect(lire(FOCUS), `VueFocus monte ${sos}`).not.toContain(sos);
    }
  });

  it("l'incident garde son chemin non bloquant du lot 16", () => {
    const page = lire(PAGE);
    expect(page).toMatch(/envoyerIncident\(/);
    expect(page, "le gestionnaire refait un fetch à la main")
      .not.toMatch(/fetch\("\/api\/incidents"/);
  });

  it("la fiche d'exécution du lot 14 reste celle du tableau de séries", () => {
    // Pas de seconde fiche pour la vue Focus : elle passe par TableauSeries.
    expect(lire("components/session/TableauSeries.tsx")).toMatch(/<FicheExecution/);
    expect(lire(FOCUS)).not.toMatch(/FicheExecution/);
  });
});

describe("le Live dégage les zones réservées d'iOS", () => {
  /*
   * CE QUE CE BLOC EST, ET CE QU'IL N'EST PAS
   *
   * Il lit des classes et des variables CSS. Il ne remplace pas un essai sur un
   * vrai iPhone, et personne ne devrait le croire : il ne mesure rien à
   * l'écran. Ce qu'il empêche, c'est la régression la plus banale — une valeur
   * recopiée en dur qui cesse d'être juste, ou une feuille ajoutée sans marge
   * basse.
   *
   * Aucun essai physique n'a été fait dans ce lot.
   */
  const GLOBALS = "app/globals.css";

  it("le dégagement du bas est calculé, pas recopié", () => {
    /*
     * `pb-16` valait 4 rem quand la rangée SOS en mesure 4,75 : la dernière
     * série d'une séance longue passait de quelques pixels sous la barre —
     * exactement à l'endroit où elle compte le plus. Et le nombre était le même
     * sur un appareil sans encoche et sur un iPhone.
     */
    const css = lire(GLOBALS);
    expect(css).toMatch(/--rangee-sos:/);
    expect(css).toMatch(/--degagement-live: calc\(var\(--rangee-sos\) \+ var\(--barre-nav\)\)/);
    // Et la barre de navigation inclut déjà la marge basse du système.
    expect(css).toMatch(/--barre-nav: calc\(var\(--rangee-nav\) \+ var\(--marge-bas\)\)/);

    const page = lire(PAGE);
    expect(page).toContain("live-session");
    expect(lire("app/live-session.css")).toContain(".app-main:has(.live-session)");
    expect(page, "le dégagement est de nouveau écrit en dur")
      .not.toMatch(/className="min-h-screen bg-papier pb-\d+"/);
  });

  it("l'en-tête collant se pose sous l'encoche, pas dessous", () => {
    // À `top-0`, il glissait derrière la barre d'état dès le premier
    // défilement — nom de la séance, chrono et bouton quitter compris.
    const page = lire(PAGE);
    expect(page).toMatch(/top: "var\(--marge-haut\)"/);
  });

  it("État et Temps restent dans la surface persistante du Live", () => {
    const page = lire(PAGE);
    const header = page.match(/<header[\s\S]*?<\/header>/)?.[0];

    expect(header, "le Live n'a plus d'en-tête persistant").toBeDefined();
    expect(header).toContain("live-session-persistent");
    expect(header).toMatch(/setModaleSOS\("etat"\)/);
    expect(header).toMatch(/setModaleSOS\("temps"\)/);
    expect(header).toContain("État");
    expect(header).toContain("Temps");
    expect(header).toContain("<ChronoSeance");

    const css = lire("app/live-session.css");
    expect(page).toMatch(/className="live-session-header sticky/);
    // L'espace après `:` est optionnel : ce garde protège une hauteur de cible
    // tactile, pas un style de mise en forme du CSS.
    expect(css).toMatch(/\.live-session-persistent\s*\{[^}]*min-height:\s*44px/);
    expect(css).not.toContain(".live-session-context");
  });

  it("les actions restent dans le contenu, sans barre SOS fixe", () => {
    // À `bottom-0`, elle passait sous une barre de navigation fixée au même
    // endroit et de z-index supérieur.
    const page = lire(PAGE);
    expect(page).not.toContain("<SOSBar");
    expect(page).toContain('ouvrirIncidentExercice(exercice.id, "machine")');
    expect(page).toContain('ouvrirIncidentExercice(exercice.id, "douleur")');
  });

  it("toutes les feuilles du Live dégagent le home indicator", () => {
    /*
     * `SOSMachineOccupee` et `RemplacerExercice` ne le faisaient pas : leur
     * dernier bouton — « Remplacer », celui qu'on vient chercher — tombait sous
     * la barre de gestes de l'iPhone.
     *
     * Une feuille se reconnaît à `rounded-t-2xl` : elle est collée au bas de
     * l'écran, donc elle doit dégager.
     */
    const feuilles = fichiers("components/session", [".tsx"])
      .filter((f) => lire(f).includes("rounded-t-2xl"));
    expect(feuilles.length, "aucune feuille trouvée : le garde ne surveille rien")
      .toBeGreaterThan(4);

    for (const f of feuilles) {
      expect(lire(f), `${f} ne dégage pas le home indicator`)
        .toMatch(/pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
    }
  });

  it("les contrôles de saisie gardent une cible tactile suffisante", () => {
    /*
     * 44 px est le minimum d'iOS. Des boutons plus petits se ratent avec les
     * mains moites, entre deux séries.
     *
     * Les tailles vivaient dans les classes utilitaires des composants ; elles
     * sont passées dans la feuille du Live avec la refonte. Le garde suit —
     * l'invariant est la taille, pas l'endroit où elle est écrite.
     */
    expect(lire("components/session/PasDeCharge.tsx")).toMatch(/w-11 h-11/);

    const css = lire("app/live-session.css");
    /** Chaque cible tactile du Live, et la hauteur qu'elle promet. */
    const cibles: [string, RegExp][] = [
      [".serie-champ", /\.serie-champ\s*\{[^}]*min-height:\s*44px/],
      [".live-serie-geste", /\.live-serie-geste\s*\{[^}]*height:\s*48px/],
      [".mesure-ligne > button", /\.mesure-ligne > button\s*\{[^}]*height:\s*60px/],
      [".mesure-choix > button", /\.mesure-choix > button\s*\{[^}]*min-height:\s*52px/],
      [".serie-valider", /\.serie-valider\s*\{[^}]*min-height:\s*62px/],
      [".focus-nav > button", /\.focus-nav > button\s*\{[^}]*min-height:\s*48px/],
    ];
    for (const [nom, motif] of cibles) {
      expect(css, `${nom} descend sous la cible tactile`).toMatch(motif);
    }

    /*
     * Et à 320 px, la largeur qui force vraiment les arbitrages : rétrécir sous
     * 44 px pour faire tenir trois champs est exactement ce qu'il ne faut pas
     * faire — c'est la ligne qui passe en deux rangées, pas la cible.
     */
    const etroit = css.slice(css.indexOf("@media (max-width: 359px)"));
    expect(etroit, "le palier 320 px n'existe plus").toBeTruthy();
    expect(etroit).not.toMatch(/(min-)?height:\s*(1?[0-9]|[2-3][0-9]|4[0-3])px/);
  });
});
