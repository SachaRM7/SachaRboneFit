"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_THEME, couleursGraphique, getPillarColor } from "@/lib/chart-theme";
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
  const [resultat, setResultat] = useState<{ cle: number; semaines: Semaine[]; echec: boolean } | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/progression/pillar-volume?months=${months}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!annule) setResultat({ cle: months, semaines: Array.isArray(d) ? d : [], echec: false });
      })
      // Sans ce `catch`, une réponse en erreur laissait le squelette pulser
      // indéfiniment : le chargement ne finissait jamais, ni en données ni en
      // message.
      .catch(() => {
        if (!annule) setResultat({ cle: months, semaines: [], echec: true });
      });
    return () => { annule = true; };
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
        Impossible de lire ton volume pour l&apos;instant. Réessaie dans un moment.
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-encre-3 text-sm py-8 text-center">
        Pas encore de volume à répartir — enregistre une séance.
      </p>
    );
  }

  const presents = new Set<string>();
  for (const semaine of data) {
    for (const cle of Object.keys(semaine)) {
      if (cle !== "week") presents.add(cle);
    }
  }
  const series = ORDRE.filter((p) => presents.has(p));

  // L'axe portait la date ISO du lundi. C'est une clé, pas une étiquette.
  const parSemaine = data.map((s) => ({
    ...s,
    semaine: typeof s.week === "string" ? jourCourt(s.week) : String(s.week),
  }));

  return (
    <div className="space-y-4">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={parSemaine}>
            <XAxis
              dataKey="semaine"
              tick={{ fill: CHART_THEME.textColor, fontSize: CHART_THEME.fontSize.xs }}
              axisLine={{ stroke: CHART_THEME.gridColor }}
            />
            <YAxis
              tick={{ fill: CHART_THEME.textColor, fontSize: CHART_THEME.fontSize.sm }}
              axisLine={{ stroke: CHART_THEME.gridColor }}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_THEME.tooltipBg,
                border: `1px solid ${CHART_THEME.tooltipBorder}`,
                borderRadius: "8px",
                color: couleursGraphique().trace,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: CHART_THEME.fontSize.sm, color: CHART_THEME.textColor }}
            />
            {series.map((pilier) => (
              <Bar
                key={pilier}
                dataKey={pilier}
                stackId="a"
                fill={getPillarColor(pilier)}
                name={nomDeSerie(pilier)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-encre-3 text-xs text-center">
        Volume soulevé par semaine — charge × répétitions, empilé par pilier.
      </p>
    </div>
  );
}
