export type AvailabilityLabel = "Likely Available" | "Maybe Available" | "Low Confidence" | "Illegal";

export function scoreToColor(score: number, isLegal: boolean): string {
  if (!isLegal) return "#dc2626";   // red
  if (score >= 0.65) return "#22c55e"; // green
  if (score >= 0.35) return "#f59e0b"; // amber
  return "#ef4444";                    // red-orange
}

export function scoreToLabel(score: number, isLegal: boolean): AvailabilityLabel {
  if (!isLegal) return "Illegal";
  if (score >= 0.65) return "Likely Available";
  if (score >= 0.35) return "Maybe Available";
  return "Low Confidence";
}

export function scoreToOpacity(score: number, isLegal: boolean): number {
  if (!isLegal) return 0.5;
  return 0.4 + score * 0.6; // range: 0.4–1.0
}
