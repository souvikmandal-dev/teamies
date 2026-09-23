/** Only HTTP(S) links without credentials, control characters or backslashes. */
export function isValidSocialUrl(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function normalizeSocialUrl(value: string | null | undefined, fallbackDomain?: string): string {
  if (!value || typeof value !== "string") return "";
  const clean = value.trim().replace(/^@+/, "");
  if (!clean) return "";
  // Keep invalid schemes invalid so form validation reports them rather than silently saving them.
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return clean;
  if (fallbackDomain && /^[a-z0-9_-]+$/i.test(clean)) return `https://${fallbackDomain}/${clean}`;
  return `https://${clean}`;
}

export function normalizeInstagramUrl(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  const clean = value.trim().replace(/^@+/, "");
  if (!clean) return "";
  if (/^[a-z0-9._]{1,30}$/i.test(clean)) return `https://instagram.com/${clean}`;
  const candidate = normalizeSocialUrl(clean);
  if (!isValidSocialUrl(candidate)) return candidate;
  const url = new URL(candidate);
  if (["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase()) &&
      /^\/@?[a-z0-9._]{1,30}\/?$/i.test(url.pathname)) {
    return `https://instagram.com/${url.pathname.replace(/^\/@?/, "").replace(/\/$/, "")}`;
  }
  return candidate;
}
