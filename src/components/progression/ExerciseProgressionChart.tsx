"use client";
import { useEffect, useState } from "react";
import { avecUnite } from "@/lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_THEME, couleursGraphique } from "@/lib/chart-theme";
import { jourCourt } from "@/lib/format-date";
import { libelleDeLaMesure, type PorteeDeLaMesure } from "@/lib/engine/charges";

interface DataPoint {
  date: string;
  best1RM: number;
  totalVolume: number;
  bestSet: { charge: number; reps: number };
}

interface ReponseProgression {
  /** Ce que le nombre mesure ici : des kilos, un indice local, une assistance. */
  portee: PorteeDeLaMesure;
  points: DataPoint[];
}

interface ExerciseProgressionChartProps {
  instanceId: string;
  months: number;
}

export function ExerciseProgressionChart({ instanceId, months }: ExerciseProgressionChartProps) {
  // Le resultat porte la cle de la requete qui l'a produit. `loading` en derive,
  // ce qui evite un setState synchrone en tete d'effet a chaque changement de cle.
  const [result, setResult] = useState<{ cle: string; points: DataPoint[]; portee: PorteeDeLaMesure } | null>(null);
  const [mode, setMode] = useState<"1rm" | "volume">("1rm");

  const cle = `${instanceId}:${months}`;
  const loading = result?.cle !== cle;
  const data = result?.cle === cle ? result.points : [];
  /**
   * « 1RM estimé » sur une pile sélectorisée annonçait une force absolue en
   * kilos que le nombre ne mesure pas : deux marques affichant 40 ne déplacent
   * pas la même chose. La courbe reste juste — comparée à elle-même sur cette
   * entrée — c'est son nom qui promettait trop.
   */
  const portee = result?.cle === cle ? result.portee : "kilos";
  const libelle = libelleDeLaMesure(portee);
  const assistance = portee === "assistance";

  useEffect(() => {
    if (!instanceId) return;
    let annule = false;
    fetch(`/api/progression/exercise?instanceId=${instanceId}&months=${months}`)
      .then((r) => r.json())
      .then((d: ReponseProgression) => {
        if (!annule) {
          setResult({
            cle: `${instanceId}:${months}`,
            points: d?.points ?? [],
            portee: d?.portee ?? "kilos",
          });
        }
      })
      .catch(() => {
        if (!annule) setResult({ cle: `${instanceId}:${months}`, points: [], portee: "kilos" });
      });
    return () => { annule = true; };
  }, [instanceId, months]);

  if (loading) {
    return <div className="h-64 bg-papier-2 rounded-lg animate-pulse" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-encre-3 text-center py-12">
        Pas encore de données. Enregistre ta première séance !
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: jourCourt(d.date),
    value: mode === "1rm" ? d.best1RM : d.totalVolume,
  }));

  return (
    <div className="space-y-4">
      {/* Toggle 1RM / Volume */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("1rm")}
          className={`px-3 py-1 rounded text-sm ${
            mode === "1rm" ? "bg-papier-2 text-encre" : "bg-papier-2 text-encre-2"
          }`}
        >
          {libelle}
        </button>
        <button
          onClick={() => setMode("volume")}
          className={`px-3 py-1 rounded text-sm ${
            mode === "volume" ? "bg-papier-2 text-encre" : "bg-papier-2 text-encre-2"
          }`}
        >
          Volume total
        </button>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              tick={{ fill: CHART_THEME.textColor, fontSize: CHART_THEME.fontSize.sm }}
              axisLine={{ stroke: CHART_THEME.gridColor }}
            />
            <YAxis
              tick={{ fill: CHART_THEME.textColor, fontSize: CHART_THEME.fontSize.sm }}
              axisLine={{ stroke: CHART_THEME.gridColor }}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_THEME.tooltipBg,
                border: `1px solid ${CHART_THEME.tooltipBorder}`,
                borderRadius: "8px",
                color: couleursGraphique().trace,
              }}
              formatter={(value, name, props: { dataPointIndex?: number }) => {
                const point = props.dataPointIndex === undefined ? undefined : data[props.dataPointIndex];
                if (!point) return [value, mode === "1rm" ? libelle : "Volume"];
                return [
                  `${value}${mode === "1rm" ? "kg" : "kg×rep"}`,
                  mode === "1rm"
                    ? `${libelle} — ${point.bestSet.charge}kg × ${point.bestSet.reps}`
                    : `Volume total`,
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={couleursGraphique().trace}
              strokeWidth={2}
              dot={{ fill: couleursGraphique().trace, strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Data summary */}
      <div className="text-encre-3 text-sm text-center">
        {data.length} séance{data.length > 1 ? "s" : ""} —{" "}
        {mode === "1rm"
          ? assistance
            // Moins d'assistance = plus de poids du corps porté. Le minimum est
            // donc la meilleure séance, et le dire évite de lire la courbe à
            // l'envers.
            ? `Assistance la plus faible : ${avecUnite(Math.min(...data.map((d) => d.best1RM)), "kg")} — moins, c'est mieux`
            : `Meilleur ${libelle.toLowerCase()} : ${avecUnite(Math.max(...data.map((d) => d.best1RM)), "kg")}`
          : `Volume total : ${avecUnite(Math.round(data.reduce((sum, d) => sum + d.totalVolume, 0)), "kg soulevés")}`}
      </div>
    </div>
  );
}