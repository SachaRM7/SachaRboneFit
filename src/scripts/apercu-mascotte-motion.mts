/** HTML autonome : mêmes assets et moteur que le composant, aucun réseau. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const racine = path.resolve(import.meta.dirname, "../..");
let html = await readFile(path.join(racine, "src/scripts/fixtures/mascotte-motion.html"), "utf8");
const source = await readFile(path.join(racine, "src/lib/coach/mascotte-motion.ts"), "utf8");
const moteur = ts.transpileModule(source.replace(/^export /gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
const licence = await readFile(path.join(racine, "assets/coach-mascot/rossark-motion.LICENSE"), "utf8");
html = html.replace("__MOTION_MODULE__", `/*\n${licence}\n*/\n${moteur}`);
for (const etat of ["ready", "repos", "encouragement"]) {
  const image = await readFile(path.join(racine, `public/coach-mascot/w/coach-${etat}-hero.webp`));
  html = html.replaceAll(`__${etat.toUpperCase()}__`, `data:image/webp;base64,${image.toString("base64")}`);
}
const dossier = path.join(racine, "apercus");
await mkdir(dossier, { recursive: true });
const destination = path.join(dossier, "mascotte-motion.html");
await writeFile(destination, html);
console.log(destination);
