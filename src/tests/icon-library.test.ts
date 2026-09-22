import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(process.cwd(), "src");
const FORBIDDEN_PACKAGES = [
  ["lu", "cide", "-react"].join(""),
  ["react", "icons"].join("-"),
  ["@", "heroicons"].join(""),
  ["@", "fortawesome"].join(""),
  ["phosphor", "react"].join("-"),
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [file] : [];
  });
}

describe("bibliothèque d’icônes", () => {
  it("garde Tabler comme seule source d’icônes applicative", () => {
    const files = sourceFiles(SOURCE_ROOT).filter((file) => !file.endsWith("icon-library.test.ts"));
    const imports = files.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      return FORBIDDEN_PACKAGES.filter((packageName) => content.includes(packageName));
    });
    const directTablerImports = files.filter((file) => {
      if (file.endsWith(join("components", "ui", "icons.tsx"))) return false;
      return readFileSync(file, "utf8").includes("@tabler/icons-react");
    });

    expect(imports).toEqual([]);
    expect(directTablerImports).toEqual([]);
    expect(readFileSync(join(process.cwd(), "package.json"), "utf8")).not.toContain(FORBIDDEN_PACKAGES[0]);
  });
});
