import { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitAction =
  | "application_create"
  | "project_create"
  | "profile_update"
  | "project_manage"
  | "project_delete"
  | "report_create"
  | "application_decision";

export const RATE_LIMIT_ERROR_MESSAGE = "You're doing that too fast — try again later.";
export type RateLimitResult = { allowed: boolean; message?: string };

const ALL_ACTIONS = new Set<RateLimitAction>([
  "application_create",
  "project_create",
  "profile_update",
  "project_manage",
  "project_delete",
  "report_create",
  "application_decision",
]);

interface RateLimitConfig {
  maximum: number;
  windowMs: number;
}

const ACTION_CONFIGS: Record<RateLimitAction, RateLimitConfig> = {
  project_create: { maximum: 5, windowMs: 24 * 60 * 60 * 1000 },
  profile_update: { maximum: 20, windowMs: 60 * 60 * 1000 },
  application_create: { maximum: 10, windowMs: 60 * 60 * 1000 },
  project_manage: { maximum: 100, windowMs: 60 * 60 * 1000 },
  project_delete: { maximum: 10, windowMs: 60 * 60 * 1000 },
  report_create: { maximum: 10, windowMs: 60 * 60 * 1000 },
  application_decision: { maximum: 100, windowMs: 60 * 60 * 1000 },
};

// In-memory sliding window fallback when database rate-limit RPC is unavailable.
// Ensures rate limiting is actively enforced without taking down the application
// due to database RPC or schema cache issues.
const memoryLimits = new Map<string, number[]>();

function checkMemoryLimit(userId: string, action: RateLimitAction): RateLimitResult {
  const config = ACTION_CONFIGS[action];
  if (!config) return { allowed: false, message: "Invalid action." };

  const key = `${userId}:${action}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  const timestamps = (memoryLimits.get(key) || []).filter((t) => t > cutoff);
  if (timestamps.length >= config.maximum) {
    return { allowed: false, message: RATE_LIMIT_ERROR_MESSAGE };
  }

  timestamps.push(now);
  memoryLimits.set(key, timestamps);
  return { allowed: true };
}

/**
 * Multi-tier rate limit check:
 * 1. Checks database-level mutation_limit_available RPC if present in Supabase schema.
 * 2. If the RPC is missing or fails due to database infrastructure error, gracefully
 *    falls back to the server in-memory sliding-window limiter.
 * This guarantees rate limits are strictly enforced without failing closed and blocking
 * legitimate users during signup, onboarding, project creation, or applications.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  action: RateLimitAction
): Promise<RateLimitResult> {
  if (!ALL_ACTIONS.has(action)) {
    return { allowed: false, message: "Invalid action." };
  }

  try {
    const { data, error } = await supabase.rpc("mutation_limit_available", { p_action: action });
    if (!error && typeof data === "boolean") {
      return { allowed: data, message: data ? undefined : RATE_LIMIT_ERROR_MESSAGE };
    }

    // Database RPC is missing (PGRST202) or table missing: fall back to server limiter
    return checkMemoryLimit(userId || "anonymous", action);
  } catch {
    // Infrastructure exception: fall back to server limiter
    return checkMemoryLimit(userId || "anonymous", action);
  }
}
