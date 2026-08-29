import { versMuscle, type Muscle } from "@/lib/referentiels/muscles";
import type { Anomalie } from "./validation-seance";

/**
 * Contrôle de l'équilibre hebdomadaire.
 *
 * Une séance peut être irréprochable et donner une semaine bancale. Superbe
 * séance de poussée aujourd'hui, mais au total les épaules prennent vingt-deux
 * séries et les ischios quatre : chaque séance validée, la semaine ratée.
 *
 * Ce contrôle raisonne donc au niveau où le déséquilibre existe. Il regarde ce
 * qui est déjà fait plus ce qui est proposé, et compare à la fois au volume
 * attendu et à l'équilibre entre antagonistes — un rapport poussée/tirage qui
 * dérive est un problème avant d'être une préférence.
 */

export interface ImpactSemaine {
  /** Séries déjà réalisées cette semaine, par muscle canonique. */
  seriesRealisees: Record<string, number>;
  /** Séries qu'ajouterait la séance proposée. */
  seriesProposees: Record<string, number>;
  /** Cible hebdomadaire, quand le programme en fixe une. */
  cibles?: Record<string, number>;
  /** Muscles que l'utilisateur a désignés comme prioritaires. */
  prioritaires?: string[];
  /** Jours restants dans la semaine après cette séance. */
  joursRestants: number;
}

export interface ResultatSemaine {
  valide: boolean;
  anomalies: Anomalie[];
  /** Total par muscle après la séance proposée. */
  totalParMuscle: Record<string, number>;
  /** Rapports d'équilibre notables, pour l'explication. */
  equilibres: Record<string, number>;
}

/** Sous cette part de la cible, le muscle ne sera pas rattrapable. */
const PART_MINIMALE_ATTEIGNABLE = 0.6;

/** Séries maximales qu'on peut raisonnablement rattraper en un jour. */
const RATTRAPAGE_PAR_JOUR = 8;

/** Au-delà, la cible est franchement dépassée. */
const DEPASSEMENT_NET = 1.4;

/** Rapport acceptable entre deux groupes antagonistes. */
const DESEQUILIBRE_TOLERE = 1.8;

/** Paires dont le déséquilibre durable pose un problème de structure. */
const ANTAGONISTES: Array<[Muscle, Muscle, string]> = [
  ["pectoraux", "dorsaux", "poussée / tirage"],
  ["quadriceps", "ischios", "quadriceps / ischios"],
];

function cumuler(...sources: Record<string, number>[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const source of sources) {
    for (const [brut, valeur] of Object.entries(source)) {
      const muscle = versMuscle(brut);
      if (!muscle) continue;
      total[muscle] = (total[muscle] ?? 0) + valeur;
    }
  }
  return total;
}

export function validerImpactSemaine(impact: ImpactSemaine): ResultatSemaine {
  const anomalies: Anomalie[] = [];
  const totalParMuscle = cumuler(impact.seriesRealisees, impact.seriesProposees);
  const equilibres: Record<string, number> = {};

  const prioritaires = new Set(
    (impact.prioritaires ?? []).map(versMuscle).filter((m): m is Muscle => m !== null),
  );

  // --- Volume par rapport à la cible ---
  for (const [brut, cible] of Object.entries(impact.cibles ?? {})) {
    const muscle = versMuscle(brut);
    if (!muscle || cible <= 0) continue;

    const total = totalParMuscle[muscle] ?? 0;

    if (total > cible * DEPASSEMENT_NET) {
      anomalies.push({
        code: "volume_hebdo_excessif",
        // Dépasser sa cible n'abîme rien en soi ; c'est le reste de la semaine
        // que cela compromet, et cela reste rattrapable.
        gravite: "avertissement",
        message: `${muscle} : ${total} séries pour une cible de ${cible} — le reste de la semaine devra être allégé.`,
      });
    }

    // Un manque ne se juge qu'à l'aune de ce qu'il reste de temps pour le combler.
    const manque = cible * PART_MINIMALE_ATTEIGNABLE - total;
    const rattrapable = impact.joursRestants * RATTRAPAGE_PAR_JOUR;
    if (manque > 0 && manque > rattrapable) {
      anomalies.push({
        code: "volume_hebdo_inatteignable",
        gravite: prioritaires.has(muscle) ? "bloquant" : "avertissement",
        message: `${muscle} : ${total} séries, cible ${cible}, ${impact.joursRestants} jour(s) restant(s) — le retard ne sera pas comblé.`,
      });
    }
  }

  // --- Équilibre entre antagonistes ---
  for (const [a, b, libelle] of ANTAGONISTES) {
    const va = totalParMuscle[a] ?? 0;
    const vb = totalParMuscle[b] ?? 0;
    if (va + vb < 6) continue; // trop peu de volume pour qu'un rapport signifie quoi que ce soit

    const rapport = vb === 0 ? Infinity : va / vb;
    equilibres[libelle] = Number.isFinite(rapport) ? Math.round(rapport * 100) / 100 : 99;

    if (rapport > DESEQUILIBRE_TOLERE || rapport < 1 / DESEQUILIBRE_TOLERE) {
      const dominant = rapport > 1 ? a : b;
      const domine = rapport > 1 ? b : a;
      anomalies.push({
        code: "desequilibre_antagonistes",
        gravite: "avertissement",
        message: `${libelle} : ${va} contre ${vb} séries. ${dominant} domine ${domine} au-delà du raisonnable.`,
      });
    }
  }

  return {
    valide: !anomalies.some((x) => x.gravite === "bloquant"),
    anomalies,
    totalParMuscle,
    equilibres,
  };
}
