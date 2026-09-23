"use client";

import { useEffect } from "react";
import { LoadError } from "@/components/load-error";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      console.error("Application runtime error:", error?.digest || error?.message || "unknown");
    } catch {
      // Ignore console logging errors
    }
  }, [error]);

  return (
    <LoadError
      message={error?.message || "Something went wrong. Try again, or return home."}
      onRetry={reset}
      href="/"
      linkLabel="Back to home"
    />
  );
}
