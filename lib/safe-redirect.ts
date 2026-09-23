/** Restrict redirects and stored internal navigation links to this application's origin. */
export function safeInternalPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return fallback;
  try {
    const url = new URL(value, "https://teamies.invalid");
    return url.origin === "https://teamies.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
