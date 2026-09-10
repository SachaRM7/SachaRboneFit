/**
 * Le contrôle visuel du Live, sur les composants RÉELS.
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * Une refonte d'interface qu'on ne regarde pas n'est pas terminée. Les tests de
 * rendu disent que la bonne série est là ; ils ne disent rien de ce à quoi
 * l'écran ressemble à 320 px, ni si un libellé déborde, ni si le Live a
 * vraiment l'air d'appartenir à la même application que l'accueil.
 *
 * CE QU'IL REND, ET CE QU'IL NE REND PAS
 *
 * Les vrais composants (`LecteurExercice`, `TableauSeries`, `RestTimer`) avec
 * la vraie feuille de styles — celle que `next build` vient de compiler,
 * Tailwind résolu. Ce n'est donc pas une maquette : c'est le markup de
 * production et le CSS de production.
 *
 * Ce n'est pas non plus une séance : pas de base, pas de session, pas de
 * réseau. Les états sont posés à la main pour couvrir exactement les cas qu'on
 * veut voir — première série, série faite, exercice terminé, repos.
 *
 * POURQUOI UN RENDU CLIENT ET NON `renderToStaticMarkup`
 *
 * Zustand v5 sert `getInitialState()` comme instantané SERVEUR : un rendu
 * statique voit donc toujours une séance vide, quoi qu'on ait posé dans le
 * store. Les aperçus montraient « série 1 sur 3 » sur une scène censée avoir
 * une série faite — l'outil mentait, pas l'application. On rend donc par le
 * chemin CLIENT, celui du téléphone, dans un DOM simulé.
 */
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const RACINE = process.cwd();
const SORTIE = path.join(RACINE, "apercus");

/** La feuille compilée par `next build` : Tailwind résolu, tokens compris. */
function cssDeProduction(): string {
  const chunks = path.join(RACINE, ".next/static/chunks");
  return readdirSync(chunks)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(path.join(chunks, f), "utf8"))
    .join("\n")
    // La CSS est injectée dans la page d'aperçu : ses URL relatives ne sont
    // plus relatives au chunk d'origine. On les remet sur le chemin servi par
    // le harnais afin de mesurer aussi les vraies métriques des polices.
    .replaceAll("url(../media/", "url(/_next/static/media/");
}

export function page(titre: string, corps: string, largeur: number): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titre}</title>
<style>${cssDeProduction()}</style>
<style>
  /* Le simulateur d'appareil : la largeur réelle, et les zones que le matériel
     occupe sur un iPhone à encoche. Sans elles, on ne voit pas ce qui passe
     dessous. */
  body { margin:0; background:var(--papier); width:${largeur}px; }
  :root { --marge-haut: 59px; --marge-bas: 34px;
    --police-titre:"Outfit",Arial,sans-serif;
    --police-texte:"Geist",Arial,sans-serif; }
  .apercu-encoche { position:fixed; top:0; left:0; right:0; height:var(--marge-haut);
    background:repeating-linear-gradient(45deg,#0000,#0000 6px,#b8432533 6px,#b8432533 12px);
    z-index:99; pointer-events:none; }
  .apercu-indicateur { position:fixed; bottom:0; left:0; right:0; height:var(--marge-bas);
    background:repeating-linear-gradient(45deg,#0000,#0000 6px,#b8432533 6px,#b8432533 12px);
    z-index:99; pointer-events:none; }
</style>
</head><body>
<div class="apercu-encoche"></div>
${corps}
<div class="apercu-indicateur"></div>
</body></html>`;
}

export function ecrire(nom: string, titre: string, corps: string, largeur: number) {
  mkdirSync(SORTIE, { recursive: true });
  const fichier = path.join(SORTIE, `${nom}-${largeur}.html`);
  writeFileSync(fichier, page(titre, corps, largeur));
  return fichier;
}

/**
 * Rend un composant par le chemin CLIENT et rend son HTML.
 *
 * `flushSync` force React à terminer le rendu avant qu'on lise le DOM : sans
 * lui, on sérialiserait un conteneur encore vide.
 */
export function rendre(
  element: React.ReactElement,
  /**
   * Un geste à jouer AVANT de sérialiser — « ajouter une série », par exemple.
   *
   * Certains états ne s'atteignent que par une interaction ; les fabriquer en
   * ajoutant une propriété au composant reviendrait à modifier le produit pour
   * les besoins d'une capture, et à photographier autre chose que ce que les
   * gens utilisent. On clique donc, comme eux.
   */
  geste?: ((hote: HTMLElement) => void) | Array<(hote: HTMLElement) => void>,
): string {
  const hote = document.createElement("div");
  document.body.appendChild(hote);
  /*
   * UN RENDU QUI ÉCHOUE DOIT ARRÊTER LE SCRIPT.
   *
   * React attrape l'exception d'un composant, démonte la branche et continue.
   * L'aperçu sortait donc VIDE — ou pire, amputé d'un seul élément — sans que
   * rien ne l'indique : c'est ainsi qu'une série de captures a été produite
   * sans aucune illustration, à cause d'un `window.matchMedia` absent de jsdom.
   * Un outil de contrôle visuel qui ment en silence est pire que pas d'outil.
   */
  const erreurs: unknown[] = [];
  const racine = createRoot(hote, {
    onUncaughtError: (e) => erreurs.push(e),
    onCaughtError: (e) => erreurs.push(e),
  });
  flushSync(() => racine.render(element));
  for (const etape of geste ? (Array.isArray(geste) ? geste : [geste]) : []) {
    flushSync(() => etape(hote));
  }
  const html = hote.innerHTML;
  racine.unmount();
  hote.remove();

  if (erreurs.length > 0) throw erreurs[0];
  if (html.trim() === "") throw new Error("rendu vide : le composant n'a rien produit");
  return html;
}
