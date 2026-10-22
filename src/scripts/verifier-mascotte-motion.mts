import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const dossier = path.resolve(import.meta.dirname, "../../apercus");
await mkdir(dossier, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const erreurs: string[] = [];
const reseau: string[] = [];
page.on("pageerror", (error) => erreurs.push(error.message));
page.on("request", (request) => {
  if (/^https?:/.test(request.url())) reseau.push(request.url());
});
const statut = (valeur: string) => page.waitForFunction(
  (etat) => document.querySelector<HTMLElement>("#motion-frame")?.dataset.motion === etat, valeur,
);
const temps = () => page.locator("#moving").evaluate((img) => Number(img.getAnimations()[0]?.currentTime));
const matrice = () => page.locator("#moving").evaluate((img) => getComputedStyle(img).transform);
// WAAPI applique pause() à la prochaine image ; attendre sa promesse ready.
const pauseAppliquee = () => page.locator("#moving").evaluate(async (img) => {
  await img.getAnimations()[0]?.ready;
});
const validations: string[] = [];

try {
  await page.goto(pathToFileURL(path.join(dossier, "mascotte-motion.html")).href);
  await statut("actif");
  const initiale = await matrice();
  await page.waitForTimeout(700);
  assert.notEqual(await matrice(), initiale);
  const boite = await page.locator("#motion-frame").boundingBox();
  await page.waitForTimeout(200);
  assert.deepEqual(await page.locator("#motion-frame").boundingBox(), boite);
  validations.push("Mouvement réel, boîte stable");

  await page.locator("#pause").click();
  await statut("pause");
  await pauseAppliquee();
  const arret = await temps();
  await page.waitForTimeout(220);
  assert.equal(await temps(), arret);
  await page.locator("#pause").click();
  await statut("actif");
  await page.waitForTimeout(100);
  assert.ok(await temps() > arret);
  validations.push("Pause et reprise au même instant");

  await page.evaluate(() => { document.body.style.paddingBottom = "2000px"; window.scrollTo(0, 1800); });
  await statut("pause");
  await pauseAppliquee();
  const horsChamp = await temps();
  await page.waitForTimeout(180);
  assert.equal(await temps(), horsChamp);
  await page.evaluate(() => { window.scrollTo(0, 0); document.body.style.paddingBottom = ""; });
  await statut("actif");
  validations.push("Pause hors écran via IntersectionObserver réel");

  // Headless ne masque pas toujours ses onglets ; on injecte l'événement DOM.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await statut("pause");
  await pauseAppliquee();
  const masque = await temps();
  await page.waitForTimeout(180);
  assert.equal(await temps(), masque);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await statut("actif");
  validations.push("Pause onglet masqué, événement DOM simulé");

  await page.locator("#reduce").check();
  await statut("reduit");
  assert.equal(await matrice(), "none");
  assert.equal(await page.locator("#moving").evaluate((img) => img.getAnimations().length), 0);
  await page.locator("#reduce").uncheck();
  await statut("actif");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await statut("reduit");
  assert.equal(await matrice(), "none");
  assert.ok(await page.locator("#pause").isDisabled());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await statut("actif");
  validations.push("Mouvement réduit manuel et système : image neutre, zéro animation");

  await page.locator('[data-scene="encouragement"]').click();
  await statut("termine");
  const fin = await temps();
  await page.locator("#pause").click();
  await page.locator("#pause").click();
  await page.waitForTimeout(120);
  assert.equal(await temps(), fin);
  await page.locator("#replay").click();
  await statut("actif");
  assert.ok(await temps() < fin);
  validations.push("Encouragement joué une fois, immobile ensuite, rejouable explicitement");

  await page.locator('[data-scene="repos"]').click();
  await statut("actif");
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(dossier, "mascotte-motion-desktop.png"), fullPage: true });
  for (const largeur of [320, 390, 430]) {
    await page.setViewportSize({ width: largeur, height: 1000 });
    for (const taille of ["large", "120", "72", "40"]) {
      await page.locator("#size").selectOption(taille);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.locator("#size").selectOption("large");
  await page.screenshot({ path: path.join(dossier, "mascotte-motion-mobile.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: path.join(dossier, "mascotte-motion-mobile-dark.png"), fullPage: true });
  validations.push("320 / 390 / 430 px sans débordement, tailles 40 / 72 / 120 px, capture sombre");
  assert.deepEqual(erreurs, []);
  assert.deepEqual(reseau, []);
  validations.push("Aucune erreur JavaScript, aucun appel HTTP");
  await writeFile(path.join(dossier, "mascotte-motion-verification.json"), JSON.stringify({ navigateur: "Chromium headless", validations }, null, 2));
  console.log(validations.join("\n"));
} finally {
  await browser.close();
}
