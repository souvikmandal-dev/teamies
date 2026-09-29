"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "teamies_beta_welcome_dismissed";

export function BetaWelcomeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  function handleDismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Beta tester notice"
      className="mb-8 rounded-xl border border-(--theme-accent)/30 bg-(--theme-accent-soft)/40 p-4 sm:p-5 text-(--theme-text)"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="badge-active text-[10px] uppercase font-mono tracking-wider">Beta Tester</span>
            <h2 className="text-sm font-semibold">Welcome to the Teamies Beta</h2>
          </div>
          <p className="text-xs sm:text-sm text-(--theme-text-muted) leading-relaxed">
            You’re one of our early testers. Explore Teamies and send us feedback whenever something feels confusing, broken, or missing.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1 sm:pt-0 shrink-0">
          <Link
            href="/feedback"
            className="rounded-md bg-(--theme-accent) px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:opacity-90 transition-opacity"
          >
            Share feedback
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs text-(--theme-text-muted) hover:text-(--theme-text) transition-colors px-2 py-1.5 cursor-pointer"
            aria-label="Dismiss welcome message"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
