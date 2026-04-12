"use client";

import { AlertTriangle, RefreshCw, BatteryLow, Clock } from "lucide-react";

interface SOSBarProps {
  onMachineOccupee: () => void;
  onDouleur: () => void;
  onEnergie: () => void;
  onTempsDepasse: () => void;
}

const sosButtons = [
  { label: "Occupée", icon: RefreshCw, onClick: (fn: () => void) => fn, key: "machine" },
  { label: "Douleur", icon: AlertTriangle, onClick: (fn: () => void) => fn, key: "douleur" },
  { label: "Énergie ↓", icon: BatteryLow, onClick: (fn: () => void) => fn, key: "energie" },
  { label: "Temps ↑", icon: Clock, onClick: (fn: () => void) => fn, key: "temps" },
] as const;

export function SOSBar({ onMachineOccupee, onDouleur, onEnergie, onTempsDepasse }: SOSBarProps) {
  const handlers = {
    machine: onMachineOccupee,
    douleur: onDouleur,
    energie: onEnergie,
    temps: onTempsDepasse,
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-zinc-900/90 backdrop-blur rounded-lg border border-zinc-800">
      {sosButtons.map((btn) => (
        <button
          key={btn.key}
          onClick={handlers[btn.key]}
          className="flex flex-col items-center gap-1 px-3 py-2 min-w-[64px] rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
        >
          <btn.icon className="w-5 h-5 text-amber-400" />
          <span className="text-xs text-zinc-300 font-medium">{btn.label}</span>
        </button>
      ))}
    </div>
  );
}