"use client";

import { useEffect, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { checkPauseLongue, type ProactiveCheckResult } from "@/lib/coach/proactive-checks";
import { useSessionStore } from "@/stores/sessionStore";

interface ProactiveAlertProps {
  onShowSOS?: () => void;
}

export function ProactiveAlert({ onShowSOS }: ProactiveAlertProps) {
  const { active, updateLastAction, addProactiveAlertShown } = useSessionStore();
  const [alert, setAlert] = useState<ProactiveCheckResult | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;

    const checkAndShow = () => {
      const now = Date.now();
      const diffMin = Math.floor((now - active.lastActionTimestamp) / (60 * 1000));

      if (diffMin >= 5 && !active.shownProactiveAlerts?.includes("pause_longue")) {
        setAlert({ type: "pause_longue", minutes_ecoulees: diffMin });
        setVisible(true);
        addProactiveAlertShown("pause_longue");
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkAndShow();
      }
    };

    // Check on mount and visibility change
    checkAndShow();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [active?.lastActionTimestamp]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setVisible(false), 15000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible || !alert) return null;

  const handleDismiss = () => {
    setVisible(false);
    updateLastAction();
  };

  const message = alert.type === "pause_longue"
    ? `Tu es revenu après ${alert.minutes_ecoulees} min. Tout va bien ? Tu peux adapter la séance si besoin.`
    : "";

  return (
    <div className="bg-feu-orange/10 border border-feu-orange/25 rounded-lg p-3 flex items-start gap-3 animate-in slide-in-from-top">
      <AlertTriangle className="w-5 h-5 text-feu-orange mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-feu-orange text-sm">{message}</p>
        {onShowSOS && (
          <button
            onClick={onShowSOS}
            className="text-feu-orange text-sm font-medium mt-1 hover:underline"
          >
            Voir SOS
          </button>
        )}
      </div>
      <button onClick={handleDismiss} className="p-1 shrink-0">
        <X className="w-4 h-4 text-feu-orange" />
      </button>
    </div>
  );
}