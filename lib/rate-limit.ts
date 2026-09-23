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

const ALL_ACTIONS = new Set([
  "application_create",
  "project_create",
  "profile_update",
  "project_manage",
  "project_delete",
  "report_create",
  "application_decision",
]);

/** Read-only UX preflight. Database triggers atomically enforce every write. */
export async function checkRateLimit(supabase: SupabaseClient, _userId: string, action: RateLimitAction): Promise<RateLimitResult> {
  if (!ALL_ACTIONS.has(action)) {
    return { allowed: false, message: "Invalid action." };
  }
  try {
    const { data, error } = await supabase.rpc("mutation_limit_available", { p_action: action });
    if (error) {
      return { allowed: false, message: "Unable to verify request limits. Please try again later." };
    }
    return { allowed: data === true, message: data === true ? undefined : RATE_LIMIT_ERROR_MESSAGE };
  } catch {
    return { allowed: false, message: "Unable to verify request limits. Please try again later." };
  }
}
