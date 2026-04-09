"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { CHART_THEME } from "@/lib/chart-theme";

interface BodyWeightChartProps {
  months: number;
}

export function BodyWeightChart({ months }: BodyWeightChartProps) {
  const [data, setData] = useState<{ date: string; poids: number; movingAvg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/progression/bodyweight?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [months]);

  if (loading) {
    return <div className="h-64 bg-zinc-800/50 rounded-lg animate-pulse" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-zinc-500 text-center py-12">
        Pas encore de données de poids corporel
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    poids: d.poids,
    moyenne: d.movingAvg,
  }));

  const minWeight = Math.min(...data.map((d) => d.poids));
  const maxWeight = Math.max(...data.map((d) => d.poids));
  const yMin = Math.floor(minWeight - 2);
  const yMax = Math.ceil(maxWeight + 2);

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
                color: "#fff",
              }}
            />
            {/* Raw data - thin line */}
            <Line
              type="monotone"
              dataKey="poids"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1}
              dot={{ fill: "rgba(255,255,255,0.5)", strokeWidth: 0, r: 3 }}
              name="Poids"
            />
            {/* Moving average - thick line */}
            <Line
              type="monotone"
              dataKey="moyenne"
              stroke="#06B6D4"
              strokeWidth={2}
              dot={false}
              name="Moyenne mobile"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-zinc-500 text-sm text-center">
        {data.length} pesée{data.length > 1 ? "s" : ""} —{" "}
        dernière: {data[data.length - 1]?.poids}kg — moyenne: {data[data.length - 1]?.movingAvg}kg
      </div>
    </div>
  );
}