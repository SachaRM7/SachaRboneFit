"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExerciseProgressionChart } from "@/components/progression/ExerciseProgressionChart";
import { PillarVolumeChart } from "@/components/progression/PillarVolumeChart";
import { BodyWeightChart } from "@/components/progression/BodyWeightChart";
import { FeuHeatmap } from "@/components/progression/FeuHeatmap";

type Tab = "exercice" | "pilier" | "poids" | "calendrier";

export default function ProgressionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("exercice");
  const [exerciseInstanceId, setExerciseInstanceId] = useState<string>("");
  const [periodMonths, setPeriodMonths] = useState(3);

  const tabs: { key: Tab; label: string }[] = [
    { key: "exercice", label: "Par exercice" },
    { key: "pilier", label: "Par pilier" },
    { key: "poids", label: "Poids" },
    { key: "calendrier", label: "Calendrier" },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Progression</h1>
      </div>

      {/* Tabs */}
      <div className="px-4 flex gap-2 overflow-x-auto pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "bg-white text-black"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-20">
        {activeTab === "exercice" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <select
                className="bg-zinc-800 border-zinc-700 text-white rounded px-3 py-2 text-sm flex-1"
                value={exerciseInstanceId}
                onChange={(e) => setExerciseInstanceId(e.target.value)}
              >
                <option value="">Sélectionner un exercice</option>
              </select>
              <select
                className="bg-zinc-800 border-zinc-700 text-white rounded px-3 py-2 text-sm"
                value={periodMonths}
                onChange={(e) => setPeriodMonths(Number(e.target.value))}
              >
                <option value={1}>1 mois</option>
                <option value={3}>3 mois</option>
                <option value={6}>6 mois</option>
              </select>
            </div>
            {exerciseInstanceId ? (
              <ExerciseProgressionChart instanceId={exerciseInstanceId} months={periodMonths} />
            ) : (
              <div className="text-zinc-500 text-center py-12">
                Sélectionnez un exercice pour voir la progression
              </div>
            )}
          </div>
        )}

        {activeTab === "pilier" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <select
                className="bg-zinc-800 border-zinc-700 text-white rounded px-3 py-2 text-sm"
                value={periodMonths}
                onChange={(e) => setPeriodMonths(Number(e.target.value))}
              >
                <option value={1}>1 mois</option>
                <option value={3}>3 mois</option>
              </select>
            </div>
            <PillarVolumeChart months={periodMonths} />
          </div>
        )}

        {activeTab === "poids" && <BodyWeightChart months={6} />}

        {activeTab === "calendrier" && <FeuHeatmap months={3} />}
      </div>
    </div>
  );
}