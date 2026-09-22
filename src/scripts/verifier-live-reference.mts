import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const origin = process.argv[2];
if (!origin?.startsWith("https://")) throw new Error("Provide the preview HTTPS origin.");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const results = [];
mkdirSync("apercus/reference/png", { recursive: true });
try {
  for (const width of [390, 430, 320]) {
    for (const scene of ["focus", "vide", "liste"]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
      if (process.env.VERCEL_COOKIE_JAR) {
        const cookies = readFileSync(process.env.VERCEL_COOKIE_JAR, "utf8").split(/\r?\n/)
          .filter((line) => line && (!line.startsWith("#") || line.startsWith("#HttpOnly_")))
          .map((line) => {
            const [domain, , path, secure, expires, name, value] = line.replace(/^#HttpOnly_/, "").split("\t");
            return { domain: domain!, path: path!, secure: secure === "TRUE", expires: Number(expires) || -1, name: name!, value: value! };
          });
        await page.context().addCookies(cookies);
      }
      await page.addInitScript("globalThis.__name = (value) => value;");
      // The page markup is an isolated fixture; CSS, fonts and illustrations are fetched from the preview.
      await page.route(`${origin}/__live-reference/${scene}`, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: readFileSync(`apercus/reference/${scene}.html`, "utf8") }));
      await page.goto(`${origin}/__live-reference/${scene}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const measures = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const { x, y, width, height, bottom } = element.getBoundingClientRect();
          return { x, y, width, height, bottom };
        };
        return {
          viewport: window.innerWidth, documentHeight: document.documentElement.scrollHeight,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          title: rect(".live-focus-title h1"), header: rect(".live-session-header"),
          exercise: rect(".focus-exercise-card"), series: rect(".serie-en-cours"),
          history: rect(".focus-history-block"), actions: rect(".lecteur-actions"),
          list: rect(".live-list"), note: rect(".live-quick-note"),
          headingFont: getComputedStyle(document.querySelector("h1")!).fontFamily,
        };
      });
      await page.screenshot({ path: `apercus/reference/png/${scene}-${width}.png`, fullPage: false });
      const last = measures.actions ?? measures.note;
      const fits = last !== null && last.bottom <= 810;
      results.push({ scene, width, fits, ...measures });
      console.log(JSON.stringify({ scene, width, fits, ...measures }));
      await page.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync("apercus/reference/measurements.json", JSON.stringify(results, null, 2));
if (results.some((result) => result.overflow || (result.width >= 390 && !result.fits))) process.exitCode = 1;
