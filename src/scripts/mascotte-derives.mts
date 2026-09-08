/**
 * Les dérivés web de la mascotte — les masters ne bougent pas.
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * Les 13 masters font ~1,2 Mo chacun pour 1250 px de côté, soit 15 Mo. C'est la
 * bonne taille pour une source ; c'est absurde sur un téléphone, où la mascotte
 * occupe entre 40 et 160 px de large. Envoyer le master reviendrait à télécharger
 * 1,2 Mo pour afficher une vignette — et le Live est justement l'écran qu'on
 * ouvre avec le réseau d'un sous-sol.
 *
 * CE QUI EST GARANTI
 *
 * Les PNG d'origine restent dans `public/coach-mascot/` et ne sont jamais
 * réécrits : ce script ne fait que produire des fichiers À CÔTÉ. Aucun rognage,
 * aucune recomposition, aucune retouche de couleur — un redimensionnement
 * proportionnel et un encodage, rien d'autre. La transparence alpha est
 * préservée à chaque étape.
 *
 * TROIS TAILLES, ET POURQUOI
 *
 *   compact  144 px   la présence discrète du Live, les puces d'intervention
 *   normal   288 px   les cartes, le repos, le débrief
 *   hero     512 px   la seule place où la mascotte est le sujet
 *
 * Chaque taille est encodée à 2× la taille d'affichage visée pour rester nette
 * sur les dalles Retina, ce que ces valeurs incluent déjà.
 *
 * Lancer : npx tsx src/scripts/mascotte-derives.mts
 */
import sharp from "sharp";
import { readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";

const SOURCE = path.join(process.cwd(), "public/coach-mascot");

/** Les largeurs produites, en pixels réels du fichier. */
const TAILLES = { compact: 144, normal: 288, hero: 512 } as const;

const masters = readdirSync(SOURCE).filter((f) => f.endsWith(".png"));
if (masters.length === 0) throw new Error("aucun master dans public/coach-mascot");

mkdirSync(path.join(SOURCE, "w"), { recursive: true });

let poidsMaster = 0;
let poidsDerives = 0;

for (const fichier of masters.sort()) {
  const source = path.join(SOURCE, fichier);
  const nom = path.basename(fichier, ".png");
  poidsMaster += statSync(source).size;

  const lignes: string[] = [];
  for (const [taille, largeur] of Object.entries(TAILLES)) {
    const cible = path.join(SOURCE, "w", `${nom}-${taille}.webp`);
    await sharp(source)
      // `fit: inside` sans agrandissement : on ne recadre rien et on ne
      // fabrique pas de pixels qui n'existent pas dans le master.
      .resize({ width: largeur, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 100, effort: 6 })
      .toFile(cible);
    const octets = statSync(cible).size;
    poidsDerives += octets;
    lignes.push(`${taille} ${Math.round(octets / 1024)} Ko`);
  }
  console.log(`${nom.padEnd(22)} ${lignes.join("  ")}`);
}

const mo = (o: number) => (o / 1024 / 1024).toFixed(1);
console.log(
  `\nmasters ${mo(poidsMaster)} Mo (conservés, jamais servis)` +
    `\ndérivés  ${mo(poidsDerives)} Mo pour 13 états × 3 tailles`,
);
