"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_THEME, getPillarColor } from "@/lib/chart-theme";

interface PillarVolumeChartProps {
  months: number;
}

const PILLIER_ORDER = ["poussee", "tirage", "squat", "hanche", "epaules", "bras", "jambes_iso", "core"];

export function PillarVolumeChart({ months }: PillarVolumeChartProps) {
  const [data, setData] = useState<Record<string, string | number>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/progression/pillar-volume?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [months]);

  if (loading) {
    return <div className="h-64 bg-papier-2 rounded-lg animate-pulse" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-encre-3 text-center py-12">
        Pas encore de données de volume par pilier
      </div>
    );
  }

  // Gather all pilier keys present in data
  const pilierKeys = new Set<string>();
  for (const week of data) {
    for (const key of Object.keys(week)) {
      if (key !== "week") pilierKeys.add(key);
    }
  }
  const orderedPilliers = PILLIER_ORDER.filter((p) => pilierKeys.has(p));

  return (
    <div className="space-y-4">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis
              dataKey="week"
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
                color: "#fff",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: CHART_THEME.fontSize.sm, color: CHART_THEME.textColor }}
            />
            {orderedPilliers.map((pilier) => (
              <Bar
                key={pilier}
                dataKey={pilier}
                stackId="a"
                fill={getPillarColor(pilier)}
                name={pilier.charAt(0).toUpperCase() + pilier.slice(1).replace("_", " ")}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}