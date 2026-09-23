"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      console.error("Global application error:", error?.digest || error?.message || "unknown");
    } catch {
      // Ignore logging failures
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#0d0f11] text-[#f2f4f8] px-5 py-12 font-sans">
        <section className="w-full max-w-md rounded-xl border border-[#2b303b] bg-[#14171c] p-6 text-center sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#f2f4f8]">Something went wrong</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-[#9ea8b6]">
            {error?.message || "A critical error occurred. Please reload to try again."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#2563eb] px-5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#2b303b] bg-[#1c2027] px-5 text-sm font-medium text-[#f2f4f8] hover:bg-[#252b35]"
            >
              Back to home
            </a>
          </div>
        </section>
      </body>
    </html>
  );
}
