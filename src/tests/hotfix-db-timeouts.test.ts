import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(import.meta.dirname, "..");

function source(fichier: string): string {
  return readFileSync(path.join(RACINE, fichier), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("hotfix des timeouts postgres", () => {
  it("ne modifie plus le protocole Query de postgres.js", () => {
    const client = source("db/client.ts");

    expect(client).not.toMatch(/brancherCompteur/);
    expect(client).not.toMatch(/\.then\s*=/);
    expect(client).toMatch(/debug:\s*debugPostgres/);
    expect(client).toMatch(/max:\s*1/);
    expect(client).toMatch(/max_pipeline:\s*0/);
    expect(client).toMatch(/clientTransaction/);
    expect(client).toMatch(/beginSansPipeline/);
    expect(client).toMatch(/fetch_types:\s*false/);
    expect(client).toMatch(/idle_timeout:\s*20/);
    expect(client).toMatch(/connect_timeout:\s*10/);
  });

  it("compte au hook supporté sans journaliser SQL, paramètres ou compte", () => {
    const client = source("db/client.ts");

    expect(client).toMatch(/function debugPostgres\(/);
    expect(client).toMatch(/noter\("db",\s*"requete_envoyee"/);
    expect(client).toMatch(/_requete/);
    expect(client).toMatch(/_parametres/);
    expect(client).toMatch(/_types/);
    expect(client).not.toMatch(/console\.(log|error).*_requete/);
  });

  it("rend le complément tolérant à une branche et le partage dans le rendu", () => {
    const service = source("services/tableau-de-bord.ts");
    const composant = source("components/dashboard/ComplementTableauDeBord.tsx");
    const programme = source("components/dashboard/CarteProgramme.tsx");

    expect(service).toMatch(/Promise\.allSettled\(/);
    expect(service).toMatch(/complementTableauDeBordMemoise/);
    expect(service).toMatch(/complement_echec_route/);
    expect(composant).toMatch(/try\s*\{/);
    expect(composant).toMatch(/role="status"/);
    expect(composant).toMatch(/data\.recuperation\s*&&/);
    expect(programme).toMatch(/complementTableauDeBordMemoise/);
  });
});
