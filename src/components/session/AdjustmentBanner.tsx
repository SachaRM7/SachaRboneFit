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
        <Alert className="bg-feu-orange/10 border-feu-orange/30 text-feu-orange">
          <AlertTriangle className="h-4 w-4 text-feu-orange" />
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
                      ? "text-gain"
                      : feu === "orange"
                      ? "text-feu-orange"
                      : "text-perte"
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
        <Alert className="bg-perte-fond border-perte text-perte">
          <Clock className="h-4 w-4 text-perte" />
          <AlertTitle>Deload improvise conseille</AlertTitle>
          <AlertDescription>
            Energie basse. Reduire le volume ou reporter la seance.
          </AlertDescription>
        </Alert>
      )}

      {proposeReport && musclesAReporter && musclesAReporter.length > 0 && (
        <Alert className="bg-perte-fond border-perte text-perte">
          <AlertTriangle className="h-4 w-4 text-perte" />
          <AlertTitle>Courbatures fortes</AlertTitle>
          <AlertDescription>
            Muscles concernes : {musclesAReporter.join(", ")}. Reporter ces exercices ?
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
