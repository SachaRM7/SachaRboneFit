import { Badge } from "@/components/ui/badge";

type Pilier = "P1_poussee" | "P2_tirage" | "P3_squat" | "P4_hanche" | "epaules" | "bras_biceps" | "bras_triceps" | "jambes_iso" | "core";

const pilierColors: Record<Pilier, string> = {
  P1_poussee: "border-blue-600 text-blue-500",
  P2_tirage: "border-green-600 text-green-500",
  P3_squat: "border-orange-600 text-orange-500",
  P4_hanche: "border-red-600 text-red-500",
  epaules: "border-cyan-600 text-cyan-500",
  bras_biceps: "border-purple-600 text-purple-500",
  bras_triceps: "border-pink-600 text-pink-500",
  jambes_iso: "border-yellow-600 text-yellow-500",
  core: "border-zinc-500 text-zinc-400",
};

const pilierLabels: Record<Pilier, string> = {
  P1_poussee: "P1",
  P2_tirage: "P2",
  P3_squat: "P3",
  P4_hanche: "P4",
  epaules: "Épaule",
  bras_biceps: "Biceps",
  bras_triceps: "Triceps",
  jambes_iso: "Jambes",
  core: "Core",
};

interface PilierBadgeProps {
  pilier: string;
}

export function PilierBadge({ pilier }: PilierBadgeProps) {
  const colorClass = pilierColors[pilier as Pilier] || "border-zinc-600 text-zinc-500";
  const label = pilierLabels[pilier as Pilier] || pilier;

  return (
    <Badge variant="outline" className={`${colorClass} text-xs`}>
      {label}
    </Badge>
  );
}
