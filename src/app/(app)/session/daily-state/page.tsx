"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DailyStateForm } from "@/components/daily-state/DailyStateForm";

export default function DailyStatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-papier flex items-center justify-center"><div className="text-encre-3">Chargement...</div></div>}>
      <DailyStatePageContent />
    </Suspense>
  );
}

function DailyStatePageContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const preselectedGymId = searchParams.get("gymId") || undefined;

  return (
    <div className="min-h-screen bg-papier px-4 py-6">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-encre">État du jour</h1>
          <p className="text-encre-3 text-sm mt-1">Avant de démarrer ta séance</p>
        </div>
        <DailyStateForm initialDate={date} preselectedGymId={preselectedGymId} />
      </div>
    </div>
  );
}
