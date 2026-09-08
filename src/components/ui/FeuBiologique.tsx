interface FeuBiologiqueProps {
  feu: "vert" | "orange" | "rouge";
  label?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "min-w-12 h-10 px-3 text-sm",
};

const colorMap = {
  vert: "bg-feu-vert/10 text-feu-vert",
  orange: "bg-feu-orange/10 text-feu-orange",
  rouge: "bg-feu-rouge/10 text-feu-rouge",
};

const labelMap = {
  vert: "OK",
  orange: "Ça va",
  rouge: "Repos",
};

export function FeuBiologique({ feu, label, size = "md" }: FeuBiologiqueProps) {
  const sizeClass = sizeMap[size];
  const colorClass = colorMap[feu];
  const displayLabel = label ?? labelMap[feu];

  return (
    <div className="flex items-center gap-2">
      <div title={displayLabel} aria-label={displayLabel} className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center`}>
        <span aria-hidden className="font-semibold">{size === "lg" ? displayLabel : displayLabel[0]!.toUpperCase()}</span>
      </div>
    </div>
  );
}
