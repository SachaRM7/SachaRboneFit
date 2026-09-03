import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Le garde d'entrée : une seule vérification, et rien de moins gardé qu'avant.
 *
 * Le test précédent compte les appels dans le TEXTE. Celui-ci les compte à
 * l'exécution, ce qui attrape la forme que la lecture rate : un appel caché
 * dans une branche, une boucle, un helper. Le client Supabase est remplacé par
 * un compteur — on ne mesure pas Supabase, on mesure combien de fois le proxy
 * le sollicite.
 */

const appels = { getClaims: 0, getUser: 0, getSession: 0 };
let claims: { sub: string } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => {
        appels.getClaims += 1;
        return claims ? { data: { claims }, error: null } : { data: null, error: null };
      },
      getUser: async () => {
        appels.getUser += 1;
        return { data: { user: null }, error: null };
      },
      getSession: async () => {
        appels.getSession += 1;
        return { data: { session: null }, error: null };
      },
    },
  }),
}));

const { proxy, config, PROTEGES } = await import("@/proxy");
const { NextRequest } = await import("next/server");

function requete(chemin: string) {
  return new NextRequest(new Request(`https://exemple.test${chemin}`));
}

beforeEach(() => {
  appels.getClaims = 0;
  appels.getUser = 0;
  appels.getSession = 0;
  claims = null;
});

describe("une seule vérification par passage", () => {
  it("connecté : une vérification, aucune autre", async () => {
    claims = { sub: "11111111-1111-1111-1111-111111111111" };
    await proxy(requete("/dashboard"));
    expect(appels).toEqual({ getClaims: 1, getUser: 0, getSession: 0 });
  });

  it("déconnecté : une aussi — le refus ne coûte pas plus cher", async () => {
    await proxy(requete("/dashboard"));
    expect(appels).toEqual({ getClaims: 1, getUser: 0, getSession: 0 });
  });
});

describe("ce qu'il garde n'a pas changé", () => {
  it("sans session, tout chemin protégé renvoie à la connexion", async () => {
    for (const prefixe of PROTEGES) {
      appels.getClaims = 0;
      const reponse = await proxy(requete(`${prefixe}/quelque-chose`));
      expect(reponse.status, prefixe).toBe(307);
      expect(new URL(reponse.headers.get("location")!).pathname, prefixe).toBe("/login");
    }
  });

  it("avec session, le chemin protégé passe", async () => {
    claims = { sub: "11111111-1111-1111-1111-111111111111" };
    const reponse = await proxy(requete("/dashboard"));
    expect(reponse.headers.get("location")).toBeNull();
  });

  it("un jeton refusé ne vaut pas une session", async () => {
    // La vérification est locale, mais elle VÉRIFIE : signature invalide,
    // jeton expiré, `sub` absent — tout cela doit renvoyer à la connexion.
    claims = null;
    const reponse = await proxy(requete("/dashboard"));
    expect(new URL(reponse.headers.get("location")!).pathname).toBe("/login");
  });

  it("connecté, la page de connexion renvoie à l'accueil", async () => {
    claims = { sub: "11111111-1111-1111-1111-111111111111" };
    const reponse = await proxy(requete("/login"));
    expect(new URL(reponse.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("un chemin public n'est pas gardé", async () => {
    const reponse = await proxy(requete("/mentions"));
    expect(reponse.headers.get("location")).toBeNull();
  });
});

describe("le matcher couvre ce que la liste déclare protégé", () => {
  it("chaque préfixe protégé est réellement intercepté", () => {
    // Sans cette confrontation, ajouter un écran à PROTEGES sans l'ajouter au
    // matcher donne une protection qui n'existe pas : le proxy n'est jamais
    // appelé sur ce chemin, et le test de redirection ci-dessus passe quand
    // même puisqu'il appelle la fonction directement.
    const couverts = new Set(
      config.matcher.map((m) => m.replace("/:path*", "")),
    );
    for (const prefixe of PROTEGES) {
      expect(couverts.has(prefixe), `${prefixe} absent du matcher`).toBe(true);
    }
  });

  it("et le matcher n'intercepte rien qui ne soit ni protégé ni public", () => {
    // L'inverse compte aussi : chaque entrée du matcher fait tourner le proxy,
    // donc paie une vérification. Une entrée oubliée est un coût permanent.
    const publics = new Set(["/login", "/register"]);
    for (const entree of config.matcher) {
      const prefixe = entree.replace("/:path*", "");
      expect(
        publics.has(prefixe) || (PROTEGES as readonly string[]).includes(prefixe),
        `${entree} n'est ni protégé ni public`,
      ).toBe(true);
    }
  });
});
