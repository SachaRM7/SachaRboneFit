"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Clock } from "lucide-react";

interface AdjustmentBannerProps {
  totalPct: number;
  raisons: string[];
  proposeDeloadImprovise?: boolean;
  proposeReport?: boolean;
  musclesAReporter?: string[];
  feu?: "vert" | "orange" | "rouge";
}

export function AdjustmentBanner({
  totalPct,
  raisons,
  proposeDeloadImprovise,
  proposeReport,
  musclesAReporter,
  feu,
}: AdjustmentBannerProps) {
  if (totalPct === 0 && !proposeDeloadImprovise && !proposeReport) {
    return null;
  }

  return (
    <div className="space-y-2">
      {totalPct !== 0 && (
        <Alert className="bg-yellow-900/20 border-yellow-700 text-yellow-200">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <AlertTitle>Volume ajuste</AlertTitle>
          <AlertDescription>
            {raisons.length > 0 ? raisons.join(" + ") : `${totalPct}%`}
            {feu && (
              <span className="ml-2 text-xs">
                {" "}
                — Feu{" "}
                <span
                  className={
                    feu === "vert"
                      ? "text-green-400"
                      : feu === "orange"
                      ? "text-yellow-400"
                      : "text-red-400"
                  }
                >
                  {feu}
                </span>
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {proposeDeloadImprovise && (
        <Alert className="bg-red-900/20 border-red-700 text-red-200">
          <Clock className="h-4 w-4 text-red-400" />
          <AlertTitle>Deload improvise conseille</AlertTitle>
          <AlertDescription>
            Energie basse. Reduire le volume ou reporter la seance.
          </AlertDescription>
        </Alert>
      )}

      {proposeReport && musclesAReporter && musclesAReporter.length > 0 && (
        <Alert className="bg-red-900/20 border-red-700 text-red-200">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle>Courbatures fortes</AlertTitle>
          <AlertDescription>
            Muscles concernes : {musclesAReporter.join(", ")}. Reporter ces exercices ?
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
