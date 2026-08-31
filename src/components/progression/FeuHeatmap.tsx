"use client";
import { useEffect, useState } from "react";
import { libelleFeu } from "@/lib/referentiels/libelles";
import { CHART_THEME } from "@/lib/chart-theme";

interface FeuHeatmapProps {
  months: number;
}

interface HeatmapData {
  date: string;
  feuJour: "vert" | "orange" | "rouge" | null;
  feuTendance: "vert" | "orange" | "rouge" | null;
  templateLettre: string | null;
}

const FEU_COLORS: Record<string, string> = {
  vert: "#22c55e",
  orange: "#f97316",
  rouge: "#ef4444",
};

export function FeuHeatmap({ months }: FeuHeatmapProps) {
  const [data, setData] = useState<HeatmapData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/progression/feu-heatmap?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [months]);

  if (loading) {
    return <div className="h-48 bg-papier-2 rounded-lg animate-pulse" />;
  }

  // Build calendar grid (7 columns, Mon-Sun)
  const dataMap = new Map<string, HeatmapData>();
  for (const d of data) {
    dataMap.set(d.date, d);
  }

  // Get first day of first week with data, and last day
  const allDates = data.map((d) => d.date).sort();
  if (allDates.length === 0) {
    return (
      <div className="text-encre-3 text-center py-12">
        Pas encore de séances enregistrées
      </div>
    );
  }

  const firstDate = new Date(allDates[0]!);
  const lastDate = new Date(allDates[allDates.length - 1]!);

  // Start from Monday of first week
  const startDate = new Date(firstDate);
  startDate.setDate(startDate.getDate() - startDate.getDay() + 1);

  // End on Sunday of last week
  const endDate = new Date(lastDate);
  endDate.setDate(endDate.getDate() + (7 - endDate.getDay()) % 7);

  // Generate weeks
  const weeks: { date: Date; data: HeatmapData | null; isCurrentMonth: boolean }[][] = [];
  let currentWeek: { date: Date; data: HeatmapData | null; isCurrentMonth: boolean }[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    const dayData = dataMap.get(dateStr) || null;
    currentWeek.push({
      date: new Date(currentDate),
      data: dayData,
      isCurrentMonth: currentDate.getMonth() === firstDate.getMonth() ||
                      currentDate.getMonth() === lastDate.getMonth(),
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <div className="space-y-2">
      {/* Day labels */}
      <div className="grid grid-cols-8 gap-1 text-center text-xs text-encre-3 mb-2">
        <div />
        {dayLabels.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-8 gap-1">
          <div className="text-xs text-encre-3 flex items-center">
            {week[0]!.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </div>
          {week.map((day, di) => {
            const hasData = day.data !== null;
            const feuJour = day.data?.feuJour || null;
            const feuTendance = day.data?.feuTendance || null;
            const bgColor = hasData && feuJour ? FEU_COLORS[feuJour] : hasData ? "#6b7280" : "transparent";
            const borderColor = feuTendance && hasData ? FEU_COLORS[feuTendance] : "transparent";
            const borderWidth = feuTendance ? "2px" : "0";

            return (
              <div
                key={di}
                className="h-8 rounded flex items-center justify-center text-xs cursor-pointer relative"
                style={{
                  backgroundColor: bgColor,
                  border: borderWidth === "2px" ? `2px solid ${borderColor}` : "none",
                }}
                title={hasData && day.data ? `${day.data.date} — ${libelleFeu(day.data.feuJour)}` : day.date.toLocaleDateString("fr-FR")}
              >
                {!hasData && day.isCurrentMonth && (
                  <span className="text-encre-3">{day.date.getDate()}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex gap-4 justify-center pt-4">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-feu-vert" />
          <span className="text-xs text-encre-3">Vert</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-feu-orange" />
          <span className="text-xs text-encre-3">Orange</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-feu-rouge" />
          <span className="text-xs text-encre-3">Rouge</span>
        </div>
      </div>
    </div>
  );
}