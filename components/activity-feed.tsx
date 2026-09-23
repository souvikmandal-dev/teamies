"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ActivityEvent } from "@/lib/types/activity";
import { getRecentActivityEvents } from "@/app/actions/activity";
import { formatRelativeActivity } from "@/lib/time";

type ActivityFeedProps = {
  initialEvents?: ActivityEvent[];
  limit?: number;
  className?: string;
  autoRefreshIntervalMs?: number; // default 60000ms (60s)
};

function formatEventTime(dateValue: string): string {
  const relative = formatRelativeActivity(dateValue);
  // Strip "Active " prefix so it reads "just now", "2 hours ago", etc.
  return relative.replace(/^Active\s+/i, "");
}

function getEventDetails(event: ActivityEvent): {
  icon: string;
  headline: string;
  subtext?: string;
} {
  const meta = event.metadata ?? {};
  const projectName = typeof meta.project_name === "string" ? meta.project_name : "A project";
  const roleTitle = typeof meta.role_title === "string" ? meta.role_title : "a role";

  switch (event.event_type) {
    case "project_created":
      return {
        icon: "✦",
        headline: `New project launched: ${projectName}`,
        subtext: meta.category ? `Category: ${meta.category}` : undefined,
      };

    case "application_accepted":
      return {
        icon: "✓",
        headline: `A builder joined ${projectName}`,
        subtext: `Role: ${roleTitle}`,
      };

    case "role_filled":
      return {
        icon: "★",
        headline: `${roleTitle} position filled on ${projectName}`,
        subtext: "Role capacity reached",
      };

    case "project_stale":
      return {
        icon: "◎",
        headline: `${projectName} is looking for active momentum and contributors`,
        subtext: "Open positions available",
      };

    default:
      return {
        icon: "•",
        headline: `Activity on ${projectName}`,
      };
  }
}

export function ActivityFeed({
  initialEvents = [],
  limit = 10,
  className = "",
  autoRefreshIntervalMs = 60000,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [isLoading, setIsLoading] = useState(initialEvents.length === 0);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await getRecentActivityEvents(limit);
      if (res.success && res.events) {
        setEvents(res.events);
      }
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    if (initialEvents.length === 0) {
      void refreshEvents();
    }
  }, [initialEvents, refreshEvents]);

  // Periodic refresh (default 60s, without websockets)
  useEffect(() => {
    if (autoRefreshIntervalMs <= 0) return;
    const interval = setInterval(() => {
      void refreshEvents();
    }, autoRefreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefreshIntervalMs, refreshEvents]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-[var(--theme-accent)] animate-pulse" aria-hidden="true" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Recent Platform Activity
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void refreshEvents()}
          className="font-mono text-xs text-[var(--theme-text-muted)] transition-colors hover:text-[var(--theme-text)]"
          title="Refresh activity"
        >
          ↻ Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-center font-mono text-xs text-[var(--theme-text-muted)]">
          Loading platform activity...
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-center font-mono text-xs leading-5 text-[var(--theme-text-muted)]">
          No recent platform activity yet. Be the first to{" "}
          <Link href="/projects/new" className="font-medium text-[var(--theme-text)] underline underline-offset-4">
            start a project
          </Link>
          !
        </div>
      ) : (
        <ul className="divide-y divide-[var(--theme-border)] rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] overflow-hidden" role="feed" aria-label="Recent platform activity">
          {events.map((event) => {
            const { icon, headline, subtext } = getEventDetails(event);
            const content = (
              <div className="flex items-start gap-3 p-3.5 transition-colors hover:bg-[var(--theme-bg)]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--theme-tag-soft)] text-xs font-bold text-[var(--theme-tag)]" aria-hidden="true">
                  {icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--theme-text)] line-clamp-1">{headline}</p>
                  {subtext ? <p className="text-[11px] text-[var(--theme-text-muted)] line-clamp-1">{subtext}</p> : null}
                </div>
                <time className="shrink-0 font-mono text-[11px] text-[var(--theme-text-muted)]" dateTime={event.created_at}>
                  {formatEventTime(event.created_at)}
                </time>
              </div>
            );

            return (
              <li key={event.id}>
                {event.project_id ? (
                  <Link href={`/projects/${event.project_id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

