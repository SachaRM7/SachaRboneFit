"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info, AlertOctagon } from "lucide-react";
import type { Alert as AlertType } from "@/lib/engine/alerts";

interface AlertCardProps {
  alert: AlertType;
  onAction?: () => void;
}

const priorityStyles = {
  info: "bg-blue-900/20 border-blue-700 text-blue-200",
  warning: "bg-yellow-900/20 border-yellow-700 text-yellow-200",
  danger: "bg-red-900/20 border-red-700 text-red-200",
};

const priorityIcons = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertOctagon,
};

export function AlertCard({ alert }: AlertCardProps) {
  const Icon = priorityIcons[alert.priority];

  return (
    <Alert className={priorityStyles[alert.priority]}>
      <Icon className="h-4 w-4" />
      <div className="flex-1">
        {alert.exerciseName && (
          <AlertTitle className="text-white">{alert.exerciseName}</AlertTitle>
        )}
        <AlertDescription>{alert.message}</AlertDescription>
      </div>
    </Alert>
  );
}
