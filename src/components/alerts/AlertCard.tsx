"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info, AlertOctagon } from "lucide-react";
import type { Alert as AlertType } from "@/lib/engine/alerts";

interface AlertCardProps {
  alert: AlertType;
  onAction?: () => void;
}

const priorityStyles = {
  info: "bg-papier-2 border-filet text-encre-2",
  warning: "bg-feu-orange/10 border-feu-orange/30 text-feu-orange",
  danger: "bg-perte-fond border-perte text-perte",
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
          <AlertTitle className="text-encre">{alert.exerciseName}</AlertTitle>
        )}
        <AlertDescription>{alert.message}</AlertDescription>
      </div>
    </Alert>
  );
}
