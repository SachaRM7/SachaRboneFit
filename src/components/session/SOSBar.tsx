"use client";

import { AlertTriangle, RefreshCw, Activity, Clock } from "lucide-react";

interface SOSBarProps {
  onMachineOccupee: () => void;
  onDouleur: () => void;
  /**
   * « État ↓ » : baisse d'énergie OU symptôme général.
   *
   * La barre reste à QUATRE boutons. Un cinquième aurait rétréci les cinq, et
   * c'est la cible tactile de « Douleur » — le geste le plus urgent — qui
   * aurait payé la place du moins urgent. Le choix se fait donc derrière,
   * dans `SOSEtat`. Les deux données restent distinctes en base.
   */
  onEtat: () => void;
  onTempsDepasse: () => void;
}

const sosButtons = [
  { label: "Occupée", icon: RefreshCw, onClick: (fn: () => void) => fn, key: "machine" },
  { label: "Douleur", icon: AlertTriangle, onClick: (fn: () => void) => fn, key: "douleur" },
  { label: "État ↓", icon: Activity, onClick: (fn: () => void) => fn, key: "etat" },
  { label: "Temps ↑", icon: Clock, onClick: (fn: () => void) => fn, key: "temps" },
] as const;

export function SOSBar({ onMachineOccupee, onDouleur, onEtat, onTempsDepasse }: SOSBarProps) {
  const handlers = {
    machine: onMachineOccupee,
    douleur: onDouleur,
    etat: onEtat,
    temps: onTempsDepasse,
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-carte/90 backdrop-blur rounded-lg border border-filet">
      {sosButtons.map((btn) => (
        <button
          key={btn.key}
          onClick={handlers[btn.key]}
          className="flex flex-col items-center gap-1 px-3 py-2 min-w-[64px] rounded-lg bg-papier-2 hover:bg-papier-2 active:bg-filet transition-colors"
        >
          <btn.icon className="w-5 h-5 text-feu-orange" />
          <span className="text-xs text-encre-2 font-medium">{btn.label}</span>
        </button>
      ))}
    </div>
  );
}