interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 80, height = 24, color }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-center text-zinc-600 text-xs">N/A</div>;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * plotWidth;
    const y = padding + plotHeight - ((value - min) / range) * plotHeight;
    return `${x},${y}`;
  }).join(" ");

  const defaultColor = color || "#22c55e"; // green default
  const trendColor = data[data.length - 1]! >= data[0]! ? "#22c55e" : "#ef4444"; // green up, red down

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color || trendColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}