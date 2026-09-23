/**
 * Owner responsiveness calculations and bucket labels.
 * Tone is strictly neutral and supportive — never negative.
 */

export type ResponsivenessData = {
  decided_count: number;
  avg_response_seconds: number | null;
};

export function getResponsivenessLabel(
  avgResponseSeconds: number | null | undefined,
  decidedCount: number | undefined
): string {
  if (!decidedCount || decidedCount === 0 || avgResponseSeconds === null || avgResponseSeconds === undefined) {
    return "New owner — no response history yet";
  }

  const avgDays = avgResponseSeconds / (24 * 3600);

  if (avgDays < 3) {
    return "Usually responds in a couple days";
  }
  if (avgDays <= 14) {
    return "Usually responds in 1–2 weeks";
  }
  return "Usually responds in a few weeks";
}

