/**
 * Les captures du contrôle visuel.
 *
 * Ouvre chaque aperçu produit par `apercus.tsx` dans un vrai moteur de rendu,
 * aux largeurs qui décident : 320 px (iPhone SE) et 390 px (iPhone 14/15).
 * C'est la dernière étape, et la seule qui attrape un débordement, une
 * collision de libellés ou une cible tactile écrasée.
 */
import { chromium } from "playwright";
import { readdirSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const APERCUS = path.join(process.cwd(), "apercus");
const SORTIE = path.join(process.cwd(), "apercus/png");

/*
 * Un serveur, et pas `file://`.
 *
 * Les illustrations d'exercice sont posées en MASQUE CSS sur une URL absolue
 * (`/exercices/<slug>/frame-1.svg`) : depuis une page `file://`, cette URL ne
 * résout rien et le dessin disparaît sans erreur. Les premières captures ont
 * ainsi montré un Live sans illustration — l'outil mentait, pas l'application.
 */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const serveur = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
  for (const base of [APERCUS, path.join(process.cwd(), "public")]) {
    const fichier = path.join(base, url);
    if (!fichier.startsWith(base)) continue;
    if (existsSync(fichier) && !fichier.endsWith("/")) {
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(fichier)] ?? "application/octet-stream",
      });
      res.end(readFileSync(fichier));
      return;
    }
  }
  res.writeHead(404).end();
});
await new Promise<void>((ok) => serveur.listen(4173, ok));

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
  await page.goto(`http://localhost:4173/${fichier}`);
  await page.waitForTimeout(400);

  // L'illustration est un masque CSS : si l'URL ne résout pas, le dessin
  // disparaît en silence. On le vérifie plutôt que de le supposer.
  const illustrations = await page.evaluate(async () => {
    const masques = [...document.querySelectorAll<HTMLElement>("[style*='mask']")];
    const urls = masques
      .map((e) => e.style.cssText.match(/url\("?([^")]+)"?\)/)?.[1])
      .filter((u): u is string => Boolean(u));
    const ok = await Promise.all(
      urls.map((u) => fetch(u).then((r) => r.ok).catch(() => false)),
    );
    return { total: urls.length, casses: ok.filter((v) => !v).length };
  });

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
      `  illustrations:${illustrations.total}` +
      (illustrations.casses ? ` (${illustrations.casses} CASSÉES)` : "") +
      (trop.length ? `  cibles trop petites: ${trop.join(", ")}` : ""),
  );
  await page.close();
}

await navigateur.close();
serveur.close();
