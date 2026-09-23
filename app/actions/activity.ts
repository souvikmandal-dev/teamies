"use server";

import { createClient } from "@/lib/supabase/server";
import { ActivityEvent } from "@/lib/types/activity";

export type GetActivityEventsResult = {
  success: boolean;
  events: ActivityEvent[];
  error?: string;
};

/**
 * Fetches recent platform activity events within the last 30 days.
 * Orders most recent first, with defensive fallback if table not yet migrated.
 */
export async function getRecentActivityEvents(
  limit = 15
): Promise<GetActivityEventsResult> {
  try {
    const supabase = await createClient();
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const boundedLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 50) : 15;

    const { data, error } = await supabase
      .from("activity_events")
      .select("id, event_type, project_id, actor_user_id, metadata, created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(boundedLimit);

    if (error) {
      // Defensive fallback if migration 008 is not yet executed in DB
      console.warn("Activity events query failed.");
      return { success: true, events: [] };
    }

    return {
      success: true,
      events: (data ?? []) as ActivityEvent[],
    };
  } catch {
    console.warn("Activity events unavailable.");
    return { success: true, events: [] };
  }
}

