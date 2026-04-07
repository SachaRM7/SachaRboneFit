interface WeightData {
  date: string;
  poids: number;
}

interface WeightSparklineProps {
  data: WeightData[];
}

export function WeightSparkline({ data }: WeightSparklineProps) {
  if (data.length < 2) return null;

  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const weights = sorted.map(d => d.poids);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const width = 300;
  const height = 80;
  const padding = 10;

  const points = sorted.map((d, i) => {
    const x = padding + (i / (sorted.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.poids - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
        <polyline
          points={points}
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
