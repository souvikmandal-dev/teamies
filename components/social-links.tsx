import React from "react";

import {
  isValidSocialUrl,
  normalizeInstagramUrl,
  normalizeSocialUrl,
} from "@/lib/social-urls";

type SocialLinksProps = {
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  className?: string;
  compact?: boolean;
};

export function SocialLinks({
  portfolioUrl,
  githubUrl,
  linkedinUrl,
  instagramUrl,
  className = "",
  compact = false,
}: SocialLinksProps) {
  const links = [
    {
      name: "LinkedIn",
      href: normalizeSocialUrl(linkedinUrl, "linkedin.com/in"),
      icon: (
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
          <rect x="2" y="9" width="4" height="12" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      ),
    },
    {
      name: "Instagram",
      href: normalizeInstagramUrl(instagramUrl),
      icon: (
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      ),
    },
    {
      name: "GitHub",
      href: normalizeSocialUrl(githubUrl, "github.com"),
      icon: (
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      ),
    },
    {
      name: "Portfolio",
      href: normalizeSocialUrl(portfolioUrl),
      icon: (
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
  ].filter((item) => Boolean(item.href) && isValidSocialUrl(item.href));

  if (links.length === 0) {
    return (
      <p className="font-mono text-xs text-[var(--theme-text-muted)] italic">No social links shared yet.</p>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((link) => (
        <a
          key={link.name}
          href={link.href!}
          target="_blank"
          rel="noopener noreferrer"
          title={link.name}
          aria-label={link.name}
          className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text)] transition hover:border-[var(--theme-text-muted)] hover:bg-[var(--theme-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] ${
            compact ? "px-2 py-0.5 text-xs font-mono" : "px-2.5 py-1 text-xs font-medium"
          }`}
        >
          {link.icon}
          <span>{link.name}</span>
          <span className="text-[10px] text-[var(--theme-text-muted)]" aria-hidden="true">
            ↗
          </span>
        </a>
      ))}
    </div>
  );
}

