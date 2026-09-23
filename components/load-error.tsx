"use client";

import { TeamiesLogo } from "@/components/teamies-logo";

export function LoadError({
  message,
  onRetry,
  href,
  linkLabel,
}: {
  message?: string | null;
  onRetry?: () => void;
  href?: string | null;
  linkLabel?: string | null;
}) {
  const safeMessage = message || "Something went wrong. Try again, or return home.";
  const safeHref = href || "/";
  const safeLinkLabel = linkLabel || "Back to home";

  return (
    <main className="flex min-h-screen items-center justify-center bg-(--theme-bg) px-5 py-12 text-(--theme-text)">
      <section className="w-full max-w-md rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 text-center sm:p-8">
        <div className="mb-5 flex justify-center">
          <TeamiesLogo variant="icon" size="md" />
        </div>
        <h1 className="text-2xl font-sans font-bold tracking-tight text-(--theme-text)">Unable to load this page</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-(--theme-text-muted)">{safeMessage}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="button-primary">Try again</button>
          ) : (
            <button type="button" onClick={() => window.location.reload()} className="button-primary">Reload</button>
          )}
          <a href={safeHref} className="button-secondary">{safeLinkLabel}</a>
        </div>
      </section>
    </main>
  );
}
