"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_THEME } from "@/lib/chart-theme";

interface DataPoint {
  date: string;
  best1RM: number;
  totalVolume: number;
  bestSet: { charge: number; reps: number };
}

interface ExerciseProgressionChartProps {
  instanceId: string;
  months: number;
}

export function ExerciseProgressionChart({ instanceId, months }: ExerciseProgressionChartProps) {
  // Le resultat porte la cle de la requete qui l'a produit. `loading` en derive,
  // ce qui evite un setState synchrone en tete d'effet a chaque changement de cle.
  const [result, setResult] = useState<{ cle: string; points: DataPoint[] } | null>(null);
  const [mode, setMode] = useState<"1rm" | "volume">("1rm");

  const cle = `${instanceId}:${months}`;
  const loading = result?.cle !== cle;
  const data = result?.cle === cle ? result.points : [];

  useEffect(() => {
    if (!instanceId) return;
    let annule = false;
    fetch(`/api/progression/exercise?instanceId=${instanceId}&months=${months}`)
      .then((r) => r.json())
      .then((d: DataPoint[]) => {
        if (!annule) setResult({ cle: `${instanceId}:${months}`, points: d ?? [] });
      })
      .catch(() => {
        if (!annule) setResult({ cle: `${instanceId}:${months}`, points: [] });
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
    date: new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
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
          1RM estimé
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
                color: "#fff",
              }}
              formatter={(value, name, props: { dataPointIndex?: number }) => {
                const point = props.dataPointIndex === undefined ? undefined : data[props.dataPointIndex];
                if (!point) return [value, mode === "1rm" ? "1RM" : "Volume"];
                return [
                  `${value}${mode === "1rm" ? "kg" : "kg×rep"}`,
                  mode === "1rm"
                    ? `1RM estimé — ${point.bestSet.charge}kg × ${point.bestSet.reps}`
                    : `Volume total`,
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: "#22c55e", strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Data summary */}
      <div className="text-encre-3 text-sm text-center">
        {data.length} séance{data.length > 1 ? "s" : ""} —{" "}
        {mode === "1rm"
          ? `Meilleur 1RM: ${Math.max(...data.map((d) => d.best1RM))}kg`
          : `Volume total: ${Math.round(data.reduce((sum, d) => sum + d.totalVolume, 0))}kg×rep`}
      </div>
    </div>
  );
}