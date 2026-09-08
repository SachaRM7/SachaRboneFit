/**
 * Les captures du contrôle visuel.
 *
 * Ouvre chaque aperçu produit par `apercus.tsx` dans un vrai moteur de rendu,
 * aux largeurs qui décident : 320 px (iPhone SE) et 390 px (iPhone 14/15).
 * C'est la dernière étape, et la seule qui attrape un débordement, une
 * collision de libellés ou une cible tactile écrasée.
 */
import { chromium } from "playwright";
import { readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const APERCUS = path.join(process.cwd(), "apercus");
const SORTIE = path.join(process.cwd(), "apercus/png");

/*
 * Le Chromium de l'environnement, et non celui que Playwright voudrait
 * télécharger : les deux versions ne coïncident pas, et rien ici ne dépend de
 * la plus récente — on mesure une mise en page, pas une API du moteur.
 */
const navigateur = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN
    ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
mkdirSync(SORTIE, { recursive: true });

for (const fichier of readdirSync(APERCUS).filter((f) => f.endsWith(".html")).sort()) {
  const largeur = Number(fichier.match(/-(\d+)\.html$/)![1]);
  const page = await navigateur.newPage({
    viewport: { width: largeur, height: 844 },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${path.join(APERCUS, fichier)}`);
  await page.waitForTimeout(150);

  const cible = path.join(SORTIE, fichier.replace(".html", ".png"));
  await page.screenshot({ path: cible, fullPage: true });

  /*
   * Le contrôle qu'on ne peut pas faire à l'œil sur seize captures : rien ne
   * doit déborder horizontalement. Un débordement à 320 px est le défaut le
   * plus courant d'une refonte, et le plus facile à ne pas voir.
   */
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  const trop = await page.evaluate(() => {
    const petits: string[] = [];
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      // Les boutons du contenu textuel n'ont pas à faire 44 px de haut ; ceux
      // qu'on vise entre deux séries, si.
      if (r.height > 0 && r.height < 40 && b.closest(".serie-en-cours, .live-serie, .focus-nav"))
        petits.push(`${b.getAttribute("aria-label") ?? b.textContent?.trim()} (${Math.round(r.height)}px)`);
    }
    return petits;
  });

  console.log(
    `${fichier.replace(".html", "")}  ${deborde ? "DÉBORDE" : "ok"}` +
      (trop.length ? `  cibles trop petites: ${trop.join(", ")}` : ""),
  );
  await page.close();
}

await navigateur.close();
