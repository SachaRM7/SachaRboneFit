interface FeuBiologiqueProps {
  feu: "vert" | "orange" | "rouge";
  label?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-12 h-12 text-base",
};

const colorMap = {
  vert: "bg-feu-vert",
  orange: "bg-feu-orange",
  rouge: "bg-feu-rouge",
};

const labelMap = {
  vert: "OK",
  orange: "Ca va",
  rouge: "Repos",
};

export function FeuBiologique({ feu, label, size = "md" }: FeuBiologiqueProps) {
  const sizeClass = sizeMap[size];
  const colorClass = colorMap[feu];
  const displayLabel = label ?? labelMap[feu];

  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center`}>
        <span className="text-encre font-bold text-inherit">{displayLabel[0]!.toUpperCase()}</span>
      </div>
      {label && size === "lg" && (
        <span className="text-encre text-sm font-medium">{label}</span>
      )}
    </div>
  );
}
