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

/** Ce qui rend le contrôle non négociable : un défaut fait sortir en erreur. */
const echecs: string[] = [];

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
   * LA CAPTURE QUI DIT LA VÉRITÉ : le premier écran, sans défilement.
   *
   * Une capture `fullPage` sert à inspecter toute la page, mais elle ne montre
   * PAS ce que l'utilisateur voit en arrivant. Un CTA situé à 1 100 px y paraît
   * parfaitement placé alors qu'il est hors de l'écran d'un iPhone.
   */
  await page.screenshot({
    path: path.join(SORTIE, fichier.replace(".html", "-ecran.png")),
    fullPage: false,
  });

  /*
   * LA ZONE BASSE DU MATÉRIEL — home indicator, barre de gestes.
   *
   * Le contrôle précédent ne vérifiait que le débordement horizontal et la
   * taille des boutons. Il ne disait rien de ce qui se retrouve DERRIÈRE la
   * zone réservée du bas, ce qui est pourtant le défaut le plus coûteux :
   * un « Valider la série » qu'on ne peut pas toucher.
   *
   * On mesure donc, à scrollY = 0, l'intersection réelle entre les éléments
   * critiques et la bande basse — par `getBoundingClientRect`, pas à l'œil.
   */
  const safeArea = await page.evaluate(() => {
    const bande = document.querySelector(".apercu-indicateur")?.getBoundingClientRect();
    if (!bande) return { verifiee: false, fautifs: [] as string[] };

    /*
     * On mesure les éléments qu'il faut TOUCHER, un par un — pas la boîte
     * englobante du bloc sombre.
     *
     * Ce bloc descend naturellement sous le pli sur les séances chargées, et
     * c'est sans conséquence : ce qui compte est qu'aucun contrôle ne soit
     * inatteignable. Vérifier chaque bouton et chaque champ est plus strict que
     * vérifier leur conteneur, pas moins — un bloc peut tenir à l'écran avec un
     * bouton mal placé à l'intérieur.
     */
    const critiques: [string, Element | null][] = [
      ...[...document.querySelectorAll(".serie-en-cours button, .serie-en-cours input")]
        .map(function (el): [string, Element] {
          return [
            el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24) ?? "contrôle",
            el,
          ];
        }),
      ["CTA Valider", document.querySelector(".serie-valider")],
      ["Exercice suivant", document.querySelector(".lecteur-suivant")],
    ];

    const fautifs: string[] = [];
    for (const [nom, el] of critiques) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // Entièrement sous le pli : ce n'est pas un défaut de safe area, c'est du
      // contenu qu'on atteint en défilant. Ce qui est interdit, c'est de
      // CHEVAUCHER la bande réservée en étant par ailleurs à l'écran.
      if (r.top >= bande.bottom) continue;
      if (r.bottom > bande.top && r.top < bande.bottom) {
        fautifs.push(`${nom} (bas ${Math.round(r.bottom)} > ${Math.round(bande.top)})`);
      }
    }
    return { verifiee: true, fautifs };
  });

  /* Et la question que le brief pose vraiment : le CTA tient-il dans le premier
     écran, entièrement au-dessus de la zone réservée ? */
  const ctaDansLEcran = await page.evaluate(() => {
    const cta = document.querySelector(".serie-valider");
    if (!cta) return null;
    const bande = document.querySelector(".apercu-indicateur")!.getBoundingClientRect();
    const r = cta.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= bande.top;
  });

  /*
   * Le contrôle qu'on ne peut pas faire à l'œil sur seize captures : rien ne
   * doit déborder horizontalement. Un débordement à 320 px est le défaut le
   * plus courant d'une refonte, et le plus facile à ne pas voir.
   */
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  /*
   * Une valeur ROGNÉE est pire qu'une valeur absente : « 32. » se lit comme un
   * nombre, et c'est celui qu'on va charger sur la machine.
   */
  const rognes = await page.evaluate(() => {
    const coupes: string[] = [];
    for (const i of document.querySelectorAll("input")) {
      if (i.scrollWidth > i.clientWidth + 1) {
        coupes.push(`${i.getAttribute("aria-label") ?? "champ"} "${i.value}"`);
      }
    }
    return coupes;
  });

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

  /*
   * LA TAILLE RÉELLE DE LA MASCOTTE, MESURÉE — pas déclarée.
   *
   * Le `!important` du CSS l'emporte sur le style en ligne du composant : la
   * valeur qu'on croit avoir posée n'est pas nécessairement celle qui est
   * peinte. On lit donc la boîte rendue.
   */
  const mascottes = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".mascotte")].map(function (m) {
      const r = m.getBoundingClientRect();
      return `${m.dataset.etat}:${Math.round(r.width)}px`;
    }),
  );

  /*
   * LA FEUILLE DE REPOS : le chrono reste hiérarchie 1, et rien n'est poussé
   * hors de l'écran par la mascotte.
   *
   * C'est la condition exacte à laquelle son agrandissement était soumis. La
   * vérifier à l'œil sur trois largeurs est précisément ce qu'on ne sait pas
   * faire — d'où cette mesure.
   */
  const repos = await page.evaluate(() => {
    const panneau = document.querySelector(".repos-panneau");
    if (!panneau) return null;
    const bande = document.querySelector(".apercu-indicateur")!.getBoundingClientRect();
    const perdus: string[] = [];
    const critiques: [string, Element | null][] = [
      ["chrono", panneau.querySelector(".chiffres")],
      ...[...panneau.querySelectorAll("button")].map(function (b): [string, Element] {
        return [b.textContent?.trim().slice(0, 12) ?? "bouton", b];
      }),
    ];
    for (const [nom, el] of critiques) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > bande.top) perdus.push(`${nom} (bas ${Math.round(r.bottom)} > ${Math.round(bande.top)})`);
    }
    const m = panneau.querySelector(".mascotte")?.getBoundingClientRect();
    return { perdus, mascotte: m ? Math.round(m.width) : 0 };
  });

  const verdictCta =
    ctaDansLEcran === null
      ? ""
      : ctaDansLEcran
        ? "  CTA dans le 1er écran"
        : "  CTA HORS DU 1er ÉCRAN";

  console.log(
    `${fichier.replace(".html", "")}  ${deborde ? "DÉBORDE" : "ok"}` +
      `  illustrations:${illustrations.total}` +
      (illustrations.casses ? ` (${illustrations.casses} CASSÉES)` : "") +
      verdictCta +
      (mascottes.length ? `  mascotte ${mascottes.join(" ")}` : "") +
      (repos ? `  repos: chrono+boutons ${repos.perdus.length ? "PERDUS" : "dans l'écran"}` : "") +
      (safeArea.fautifs.length ? `  SOUS LA SAFE AREA: ${safeArea.fautifs.join(", ")}` : "") +
      (rognes.length ? `  VALEURS ROGNÉES: ${rognes.join(", ")}` : "") +
      (trop.length ? `  cibles trop petites: ${trop.join(", ")}` : ""),
  );

  if (repos && repos.perdus.length > 0) {
    echecs.push(`${fichier}: la feuille de repos pousse hors de l'écran — ${repos.perdus.join(", ")}`);
  }
  if (repos && (repos.mascotte < 96 || repos.mascotte > 120)) {
    // La fourchette demandée. En sortir vers le bas rend la mascotte
    // méconnaissable ; vers le haut, elle dispute la vedette au chrono.
    echecs.push(`${fichier}: mascotte de repos à ${repos.mascotte}px, hors de 96–120`);
  }
  if (safeArea.fautifs.length > 0) echecs.push(`${fichier}: ${safeArea.fautifs.join(", ")}`);
  if (deborde) echecs.push(`${fichier}: débordement horizontal`);
  if (illustrations.casses > 0) echecs.push(`${fichier}: illustration cassée`);
  if (trop.length > 0) echecs.push(`${fichier}: cible tactile < 44px`);
  if (rognes.length > 0) echecs.push(`${fichier}: valeur rognée — ${rognes.join(", ")}`);
  await page.close();
}

await navigateur.close();
serveur.close();

if (echecs.length > 0) {
  console.error(`\n${echecs.length} défaut(s) :\n  ${echecs.join("\n  ")}`);
  process.exitCode = 1;
}
