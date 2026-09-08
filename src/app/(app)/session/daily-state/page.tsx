"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DailyStateForm } from "@/components/daily-state/DailyStateForm";

export default function DailyStatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-papier flex items-center justify-center">
          <div className="text-encre-3">Chargement...</div>
        </div>
      }
    >
      <DailyStatePageContent />
    </Suspense>
  );
}

function DailyStatePageContent() {
  const searchParams = useSearchParams();
  const date =
    searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const preselectedGymId = searchParams.get("gymId") || undefined;

  return (
    <div className="daily-page p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="checkin-intro">
          <p className="eyebrow">Avant ta séance</p>
          <h1>On fait le point.</h1>
          <p>Ton état du jour aide à ajuster ta séance.</p>
        </div>
        <DailyStateForm
          initialDate={date}
          preselectedGymId={preselectedGymId}
        />
      </div>
    </div>
  );
}
