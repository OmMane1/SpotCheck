// score is lower-is-better (0.0 = closest + safest, ~1.0 = far + risky)
export type AvailabilityLabel = "Best Match" | "Good Option" | "Fair Option";

export function scoreToColor(score: number): string {
  if (score <= 0.35) return "#22c55e"; // green
  if (score <= 0.60) return "#f59e0b"; // amber
  return "#ef4444";                    // red-orange
}

export function scoreToLabel(score: number): AvailabilityLabel {
  if (score <= 0.35) return "Best Match";
  if (score <= 0.60) return "Good Option";
  return "Fair Option";
}

export function scoreToOpacity(score: number): number {
  // invert so best (lowest score) = most opaque
  return 0.45 + (1 - Math.min(score, 1)) * 0.55;
}

export function rankLabel(index: number): string {
  const labels = ["1st", "2nd", "3rd", "4th", "5th"];
  return labels[index] ?? `${index + 1}th`;
}
