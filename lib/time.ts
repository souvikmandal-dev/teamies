/**
 * Utility functions for relative timestamps and project health activity.
 */

export function formatRelativeActivity(dateValue: string | number | Date | null | undefined): string {
  if (!dateValue) return "Active recently";

  const date = new Date(dateValue);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0 || isNaN(diffMs)) {
    return "Active recently";
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMin < 1) {
    return "Active just now";
  }
  if (diffMin < 60) {
    return `Active ${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  }
  if (diffHours < 24) {
    return `Active ${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }
  if (diffDays === 1) {
    return "Active yesterday";
  }
  if (diffDays < 7) {
    return `Active ${diffDays} days ago`;
  }
  if (diffWeeks < 4) {
    return `Active ${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
  }
  if (diffMonths < 12) {
    return `Active ${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
  }

  return `Active over a year ago`;
}

/**
 * A project is considered "Stale" ONLY if:
 * 1. Project is actively open (status is 'open' or 'active')
 * 2. Recruitment is currently open (not paused or closed)
 * 3. It still has unfilled open roles
 * 4. Last activity was more than 30 days ago.
 * Completed, cancelled, or archived projects are NEVER considered stale.
 */
export function isProjectStale(
  lastActivityAt: string | null | undefined,
  hasOpenRoles: boolean,
  projectStatus: string = "open",
  recruitingStatus: string = "open"
): boolean {
  const normProjectStatus = (projectStatus || "").toLowerCase();
  const normRecruitingStatus = (recruitingStatus || "").toLowerCase();

  // Completed, cancelled, and archived projects never receive stale warnings
  if (normProjectStatus !== "open" && normProjectStatus !== "active") {
    return false;
  }

  // Projects where recruitment is paused or closed do not receive stale warnings
  if (normRecruitingStatus !== "open") {
    return false;
  }

  if (!hasOpenRoles) return false;
  if (!lastActivityAt) return false;

  const date = new Date(lastActivityAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  return diffMs > thirtyDaysMs;
}

/**
 * Checks if a date falls within a given activity window ('7d' or '30d').
 */
export function matchesActivityFilter(
  dateValue: string | null | undefined,
  filter: string
): boolean {
  if (!filter || filter === "all") return true;
  if (!dateValue) return false;

  const date = new Date(dateValue);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (filter === "7d") {
    return diffMs <= 7 * 24 * 60 * 60 * 1000;
  }
  if (filter === "30d") {
    return diffMs <= 30 * 24 * 60 * 60 * 1000;
  }

  return true;
}

