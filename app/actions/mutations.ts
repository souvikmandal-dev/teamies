"use server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RateLimitAction } from "@/lib/rate-limit";

export type ServerActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Server action to check rate limit on any mutation path.
 * Can be called before executing high-risk mutations.
 */
export async function enforceRateLimit(action: RateLimitAction): Promise<ServerActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "You must be signed in to perform this action." };
    }

    const limitResult = await checkRateLimit(supabase, user.id, action);
    if (!limitResult.allowed) {
      return {
        success: false,
        error: limitResult.message || "You're doing that too fast — try again in a few minutes.",
      };
    }

    return { success: true };
  } catch {
    // Authentication and infrastructure failures must not authorize writes.
    return { success: false, error: "Unable to verify this request. Please try again." };
  }
}

