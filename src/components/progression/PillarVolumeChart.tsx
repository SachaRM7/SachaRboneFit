"use client";
import { RepereEnConstruction } from "./RepereEnConstruction";
import { useEffect, useState } from "react";
import { PILIERS } from "@/lib/schemas/exercise";
import { libellePilier } from "@/lib/referentiels/libelles";
import { jourCourt } from "@/lib/format-date";

interface PillarVolumeChartProps {
  months: number;
}

/**
 * L'ordre des séries vient du modèle, pas d'une liste écrite à la main.
 *
 * Il y en avait une ici — « poussee », « tirage », « squat », « hanche »,
 * « bras » — qui ne correspondait à aucune clé réellement produite. Les quatre
 * piliers principaux et les bras étaient donc filtrés hors du graphique, en
 * silence : on voyait un empilement plausible qui ne montrait que les épaules,
 * les jambes et le gainage.
 *
 * `autre` ferme la liste : un exercice sans pilier existe, et il valait
 * jusqu'ici « core » — une catégorie inventée pour lui.
 */
const ORDRE = [...PILIERS, "autre"] as const;

function nomDeSerie(cle: string): string {
  return cle === "autre" ? "Autre" : libellePilier(cle);
}

export function PillarVolumeChart({ months }: PillarVolumeChartProps) {
  // Même forme qu'ailleurs : la période demandée fait partie du résultat,
  // plutôt qu'un `setState` synchrone dans le corps de l'effet.
  type Semaine = Record<string, string | number>;
  const [semaineChoisie, setSemaineChoisie] = useState<string>("toutes");
  const [resultat, setResultat] = useState<{
    cle: number;
    semaines: Semaine[];
    echec: boolean;
  } | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/progression/pillar-volume?months=${months}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => {
        if (!annule)
          setResultat({
            cle: months,
            semaines: Array.isArray(d) ? d : [],
            echec: false,
          });
      })
      // Sans ce `catch`, une réponse en erreur laissait le squelette pulser
      // indéfiniment : le chargement ne finissait jamais, ni en données ni en
      // message.
      .catch(() => {
        if (!annule) setResultat({ cle: months, semaines: [], echec: true });
      });
    return () => {
      annule = true;
    };
  }, [months]);

  const chargement = resultat?.cle !== months;
  const data = resultat?.semaines ?? [];
  const echec = resultat?.echec ?? false;

  if (chargement) {
    return <div className="h-64 bg-papier-2 rounded-lg animate-pulse" />;
  }

  if (echec) {
    return (
      <p className="text-encre-2 text-sm py-8 text-center">
        Impossible de lire ton volume pour l&apos;instant. Réessaie dans un
        moment.
      </p>
    );
  }

  if (
    !data.some((s) =>
      ORDRE.some((k) => typeof s[k] === "number" && Number(s[k]) > 0),
    )
  ) {
    return (
      <RepereEnConstruction titre="Ton volume prend forme">
        <p>
          Pas encore de volume chargé mesurable sur cette période. Tes séances
          alimenteront ici la répartition entre les mouvements.
        </p>
        <p>
          Une charge nulle ne signifie pas une séance inutile : le poids du
          corps n’est pas compté dans ce graphique.
        </p>
      </RepereEnConstruction>
    );
  }

  const selection = data.some((s) => s.week === semaineChoisie) ? semaineChoisie : "toutes";
  const semaines = selection === "toutes" ? data : data.filter((s) => s.week === selection);
  const series = ORDRE.map((cle) => ({
    cle,
    volume: semaines.reduce((total, s) => total + (typeof s[cle] === "number" ? Math.max(0, Number(s[cle])) : 0), 0),
  })).filter((s) => s.volume > 0).sort((a, b) => b.volume - a.volume);
  const total = series.reduce((somme, s) => somme + s.volume, 0);
  const format = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  return (
    <section className="pillar-volume" aria-label="Volume par pilier">
      <div className="pillar-period">
        <label htmlFor="pillar-week">Période</label>
        <select id="pillar-week" value={selection} onChange={(event) => setSemaineChoisie(event.target.value)}>
          <option value="toutes">{months} derniers mois</option>
          {[...data].reverse().map((s) => (
            <option key={String(s.week)} value={String(s.week)}>Semaine du {jourCourt(String(s.week))}</option>
          ))}
        </select>
      </div>
      <div className="pillar-total">
        <span className="eyebrow">Volume cumulé</span>
        <p><strong>{format(total)}</strong><span>kg·rép</span></p>
        <span>{series.length} pilier{series.length > 1 ? "s" : ""} travaillé{series.length > 1 ? "s" : ""}</span>
      </div>
      {total > 0 ? (
        <ol className="pillar-ranking">
          {series.map((s, index) => (
            <li key={s.cle}>
              <span className="pillar-rank" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
              <div className="pillar-measure">
                <div><strong>{nomDeSerie(s.cle)}</strong><span>{format(s.volume)} <small>kg·rép</small></span></div>
                <div className="pillar-track" aria-hidden><span style={{ width: `${100 * s.volume / total}%` }} /></div>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="pillar-week-empty">Aucun volume chargé enregistré cette semaine.</p>}
      <details className="pillar-definition">
        <summary>Comment est calculé le volume ?</summary>
        <p>Charge × répétitions, additionnées pour chaque pilier. Les exercices au poids du corps sans charge ajoutée ne sont pas comptés. Ce volume décrit le travail enregistré, pas un score de force.</p>
      </details>
    </section>
  );
}
