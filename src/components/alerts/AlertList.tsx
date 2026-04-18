"use client";
import { AlertCard } from "./AlertCard";
import type { Alert } from "@/lib/engine/alerts";

interface AlertListProps {
  alerts: Alert[];
}

export function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <AlertCard key={i} alert={alert} />
      ))}
    </div>
  );
}
