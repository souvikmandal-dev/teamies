/**
 * Safely humanize snake_case or slug strings into title-cased labels.
 * Designed to NEVER throw on null, undefined, empty, non-string, or whitespace values.
 *
 * Examples:
 * - humanize(null) => "Not specified"
 * - humanize(undefined) => "Not specified"
 * - humanize("") => "Not specified"
 * - humanize("   ") => "Not specified"
 * - humanize("beginner") => "Beginner"
 * - humanize("full_stack_developer") => "Full Stack Developer"
 * - humanize("mvp") => "MVP"
 */
export function humanize(value?: string | null, fallback = "Not specified"): string {
  if (!value || typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.toLowerCase() === "mvp") return "MVP";

  return trimmed
    .split("_")
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .filter(Boolean)
    .join(" ");
}

