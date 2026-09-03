"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_THEME, couleursGraphique } from "@/lib/chart-theme";
import { jourCourt } from "@/lib/format-date";

interface BodyWeightChartProps {
  months: number;
}

interface Pesee {
  date: string;
  poids: number;
  movingAvg: number;
}

/** Une courbe ne dit rien avant d'avoir deux points à relier. */
const PESEES_POUR_UNE_COURBE = 2;

export function BodyWeightChart({ months }: BodyWeightChartProps) {
  /**
   * Un seul état, portant la période qu'il décrit.
   *
   * Repasser `chargement` à vrai dans le corps de l'effet déclenche un rendu en
   * cascade. La période demandée fait donc partie du résultat : tant que la
   * clé ne correspond pas, c'est qu'on charge — et changer de période ne peut
   * pas afficher les chiffres de l'ancienne.
   */
  const [resultat, setResultat] = useState<{ cle: number; pesees: Pesee[]; echec: boolean } | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/progression/bodyweight?months=${months}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!annule) setResultat({ cle: months, pesees: Array.isArray(d) ? d : [], echec: false });
      })
      /*
       * Sans ce `catch`, une réponse en erreur laissait le chargement à vrai
       * pour toujours : le squelette pulsait indéfiniment, et l'écran
       * n'annonçait jamais ni donnée ni panne. C'est le « loader qui finit
       * dans le vide » — il ne finissait pas du tout.
       */
      .catch(() => {
        if (!annule) setResultat({ cle: months, pesees: [], echec: true });
      });
    return () => { annule = true; };
  }, [months]);

  const chargement = resultat?.cle !== months;
  const data = resultat?.pesees ?? [];
  const echec = resultat?.echec ?? false;

  if (chargement) {
    return <div className="h-64 bg-papier-2 rounded-lg animate-pulse" />;
  }

  if (echec) {
    return (
      <p className="text-encre-2 text-sm py-8 text-center">
        Impossible de lire tes pesées pour l&apos;instant. Réessaie dans un moment.
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-encre-3 text-sm py-8 text-center">
        Pas encore de pesée enregistrée.
      </p>
    );
  }

  const derniere = data[data.length - 1]!;

  /*
   * Une seule pesée : le chiffre, pas un graphique.
   *
   * Recharts rendait un cadre de 16 rem avec deux axes, une grille et un point
   * unique perdu au milieu — une mise en scène de l'absence de tendance. Le
   * poids du jour se lit mieux écrit.
   */
  if (data.length < PESEES_POUR_UNE_COURBE) {
    return (
      <div className="rounded-xl border border-filet bg-carte p-5 space-y-1">
        <p className="text-encre-2 text-sm">Première pesée</p>
        <p className="text-encre text-3xl font-bold chiffres">
          {derniere.poids} <span className="text-lg font-medium text-encre-2">kg</span>
        </p>
        <p className="text-encre-3 text-sm">
          Le {jourCourt(derniere.date)}. Une deuxième pesée suffira à tracer une tendance.
        </p>
      </div>
    );
  }

  const couleurs = couleursGraphique();

  const chartData = data.map((d) => ({
    date: jourCourt(d.date),
    poids: d.poids,
    moyenne: d.movingAvg,
  }));

  const poids = data.map((d) => d.poids);
  const yMin = Math.floor(Math.min(...poids) - 2);
  const yMax = Math.ceil(Math.max(...poids) + 2);

  return (
    <div className="space-y-4">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              tick={{ fill: CHART_THEME.textColor, fontSize: CHART_THEME.fontSize.sm }}
              axisLine={{ stroke: CHART_THEME.gridColor }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: CHART_THEME.textColor, fontSize: CHART_THEME.fontSize.sm }}
              axisLine={{ stroke: CHART_THEME.gridColor }}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_THEME.tooltipBg,
                border: `1px solid ${CHART_THEME.tooltipBorder}`,
                borderRadius: "8px",
                color: couleurs.trace,
              }}
            />
            {/*
              Les couleurs viennent des tokens du système, pas de valeurs
              écrites ici. Les pesées étaient tracées en blanc translucide et
              la moyenne en cyan : invisibles sur le papier du thème clair, et
              hors palette dans les deux thèmes. La pesée brute est une trace
              douce, la moyenne mobile est la trace pleine — c'est elle qu'on
              lit, le poids d'un jour ne veut pas dire grand-chose.
            */}
            <Line
              type="monotone"
              dataKey="poids"
              stroke={couleurs.traceDouce}
              strokeWidth={1}
              dot={{ fill: couleurs.traceDouce, strokeWidth: 0, r: 3 }}
              name="Pesée"
            />
            <Line
              type="monotone"
              dataKey="moyenne"
              stroke={couleurs.trace}
              strokeWidth={2}
              dot={false}
              name="Moyenne mobile"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-encre-3 text-sm text-center">
        <span className="chiffres">{data.length}</span> pesées — dernière{" "}
        <span className="chiffres">{derniere.poids}</span> kg, moyenne{" "}
        <span className="chiffres">{derniere.movingAvg}</span> kg
      </div>
    </div>
  );
}
