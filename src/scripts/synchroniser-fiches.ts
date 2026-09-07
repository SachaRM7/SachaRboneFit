import { db } from "@/db/client";
import { exercises } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { CATALOGUE_PAR_SLUG } from "@/lib/referentiels/catalogue";
import { FICHES_TECHNIQUES, TEMPOS_PAR_DEFAUT } from "@/lib/referentiels/fiches-techniques";
import { ficheRenseignee } from "@/lib/engine/execution";

/**
 * Poser les fiches et les tempos sur une base qui existe déjà.
 *
 * `seed.ts` les écrit à la création, ce qui suffit pour une base neuve. Une
 * base en service, elle, a été peuplée il y a des mois : ses exercices sont
 * là, avec leur historique, leurs instances et leurs séries. Il faut donc un
 * chemin qui COMPLÈTE sans rien recréer.
 *
 * CE QU'IL FAIT, ET SURTOUT CE QU'IL NE FAIT PAS
 *
 *   UPDATE seulement, jamais INSERT. Un slug absent de la base est signalé et
 *   sauté. Créer la ligne manquante produirait un doublon d'un exercice
 *   existant sous un autre nom, et les séries déjà enregistrées resteraient
 *   accrochées à l'ancien — c'est-à-dire une progression coupée en deux.
 *
 *   Deux colonnes touchées, pas une de plus : `fiche_technique` et
 *   `tempo_par_defaut`. Ni le nom, ni les muscles, ni le pilier — ils ont pu
 *   être corrigés à la main depuis, et les réécrire depuis le catalogue
 *   effacerait ces corrections sans prévenir.
 *
 *   Le tempo n'écrase JAMAIS une valeur déjà posée. Le catalogue n'en propose
 *   que trois, et une prescription saisie par ailleurs vaut mieux que le repli
 *   canonique.
 *
 * IDEMPOTENT : le relancer ne change rien de plus. Il rapporte ce qu'il a fait
 * et ce qu'il a sauté, parce qu'un script silencieux ne se vérifie pas.
 *
 *     npx tsx src/scripts/synchroniser-fiches.ts            # rapport seul
 *     npx tsx src/scripts/synchroniser-fiches.ts --ecrire   # applique
 *
 * Sans `--ecrire`, il ne touche à rien : on lit d'abord ce qu'il ferait.
 */

interface Bilan {
  ecrites: string[];
  inchangees: string[];
  absentes: string[];
  temposEcrits: string[];
  temposConserves: string[];
}

export async function synchroniserFiches(ecrire: boolean): Promise<Bilan> {
  const slugs = [...new Set([...Object.keys(FICHES_TECHNIQUES), ...Object.keys(TEMPOS_PAR_DEFAUT)])];

  const lignes = await db.query.exercises.findMany({
    where: inArray(exercises.slug, slugs),
    columns: { id: true, slug: true, ficheTechnique: true, tempoParDefaut: true },
  });

  /*
   * TOUTES les lignes d'un slug, pas la première.
   *
   * `exercises.slug` ne porte pas de contrainte d'unicité : une base en
   * service peut contenir deux lignes pour le même mouvement — un import
   * rejoué, un exercice ressaisi à la main. N'en servir qu'une laisserait
   * l'autre sans fiche, et c'est peut-être elle que les instances utilisent.
   */
  const parSlug = new Map<string, typeof lignes>();
  for (const l of lignes) {
    if (!l.slug) continue;
    const deja = parSlug.get(l.slug);
    if (deja) deja.push(l);
    else parSlug.set(l.slug, [l]);
  }

  const bilan: Bilan = {
    ecrites: [], inchangees: [], absentes: [], temposEcrits: [], temposConserves: [],
  };

  for (const slug of slugs) {
    const cibles = parSlug.get(slug);
    if (!cibles || cibles.length === 0) {
      // Signalé, jamais créé : voir l'en-tête.
      bilan.absentes.push(slug);
      continue;
    }

    const fiche = FICHES_TECHNIQUES[slug];
    const tempoCatalogue = TEMPOS_PAR_DEFAUT[slug];

    let uneEcriture = false;
    let unTempoEcrit = false;

    for (const ligne of cibles) {
      const maj: Partial<typeof exercises.$inferInsert> = {};

      if (fiche && !memeContenu(ligne.ficheTechnique, fiche)) {
        maj.ficheTechnique = fiche;
        uneEcriture = true;
      }
      if (tempoCatalogue && !ligne.tempoParDefaut) {
        maj.tempoParDefaut = tempoCatalogue;
        unTempoEcrit = true;
      }

      if (ecrire && Object.keys(maj).length > 0) {
        await db.update(exercises)
          .set({ ...maj, updatedAt: new Date() })
          .where(eq(exercises.id, ligne.id));
      }
    }

    if (fiche) (uneEcriture ? bilan.ecrites : bilan.inchangees).push(slug);
    if (tempoCatalogue) (unTempoEcrit ? bilan.temposEcrits : bilan.temposConserves).push(slug);
  }

  return bilan;
}

/**
 * Deux fiches disent-elles la même chose ?
 *
 * Comparées clé par clé, TRIÉES. PostgreSQL range les clés d'un `jsonb` dans
 * son propre ordre — court d'abord, puis alphabétique — et ne rend donc pas
 * l'objet tel qu'il a été écrit. Un `JSON.stringify` brut les voit toujours
 * différentes, ce qui rendrait ce script non idempotent : il réécrirait
 * l'intégralité des fiches à chaque passage, sans jamais rien changer.
 */
function memeContenu(a: unknown, b: unknown): boolean {
  const stable = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
    if (v && typeof v === "object") {
      return `{${Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
        .join(",")}}`;
    }
    return JSON.stringify(v) ?? "null";
  };
  return stable(a) === stable(b);
}

async function principal() {
  const ecrire = process.argv.includes("--ecrire");

  // Un garde de rédaction, avant de toucher quoi que ce soit : une fiche que
  // `ficheRenseignee` ne reconnaît pas ne s'afficherait jamais, et l'écrire
  // donnerait l'illusion du travail fait.
  const vides = Object.entries(FICHES_TECHNIQUES)
    .filter(([, f]) => !ficheRenseignee(f))
    .map(([slug]) => slug);
  if (vides.length > 0) {
    throw new Error(`Fiches vides, elles ne s'afficheraient pas : ${vides.join(", ")}`);
  }

  const inconnus = Object.keys(FICHES_TECHNIQUES).filter((s) => !CATALOGUE_PAR_SLUG.has(s));
  if (inconnus.length > 0) {
    throw new Error(`Slugs absents du catalogue : ${inconnus.join(", ")}`);
  }

  const bilan = await synchroniserFiches(ecrire);

  console.log(ecrire ? "— ÉCRITURE —" : "— SIMULATION (ajoute --ecrire pour appliquer) —");
  console.log(`fiches à écrire      : ${bilan.ecrites.length}${bilan.ecrites.length ? ` (${bilan.ecrites.join(", ")})` : ""}`);
  console.log(`fiches déjà à jour   : ${bilan.inchangees.length}`);
  console.log(`tempos à écrire      : ${bilan.temposEcrits.length}${bilan.temposEcrits.length ? ` (${bilan.temposEcrits.join(", ")})` : ""}`);
  console.log(`tempos conservés     : ${bilan.temposConserves.length}`);
  if (bilan.absentes.length > 0) {
    console.log(`slugs absents de la base, SAUTÉS : ${bilan.absentes.join(", ")}`);
  }
  process.exit(0);
}

// Exécuté comme script, importable comme module par les tests.
if (process.argv[1]?.includes("synchroniser-fiches")) {
  principal().catch((e) => { console.error(e); process.exit(1); });
}
