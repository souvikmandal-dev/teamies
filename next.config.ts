import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";
const supabaseOrigins: string[] = [];
try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co");
  supabaseOrigins.push(url.origin, `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
} catch { /* Configuration validation occurs when the Supabase client starts. */ }
const csp = [
  "default-src 'self'",
  // Next hydration uses inline scripts. Nonce adoption requires dynamic rendering.
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  `connect-src 'self' ${supabaseOrigins.join(" ")}${production ? "" : " ws: wss:"}`,
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "128kb" } },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(production && process.env.ENABLE_HSTS === "true"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ] }];
  },
};
export default nextConfig;
