"use client";

import { useState } from "react";
import { feedbackTypes } from "@/lib/feedback/validation";

export type Review = {
  id?: string;
  feedback_type: keyof typeof feedbackTypes | string;
  rating: number;
  title: string;
  message: string;
  created_at: string;
  status: string;
  display_name: string;
  page_context?: string | null;
  is_public?: boolean;
  is_anonymous?: boolean;
};

export function FeedbackCard({
  review,
  children,
}: {
  review: Review;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.message.length > 220;
  const displayMessage =
    isLong && !expanded ? `${review.message.slice(0, 220)}…` : review.message;

  const categoryLabel =
    feedbackTypes[review.feedback_type as keyof typeof feedbackTypes] ||
    review.feedback_type ||
    "Feedback";

  const statusConfig = getStatusConfig(review.status);

  return (
    <article className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5 sm:p-6 transition-all hover:border-(--theme-border-hover,var(--theme-border))">
      {/* Card Header: Category, Rating & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip-tag font-medium">{categoryLabel}</span>
          <div
            className="flex items-center text-amber-500 text-sm tracking-widest"
            aria-label={`${review.rating} out of 5 stars`}
          >
            {"★".repeat(Math.max(1, Math.min(5, review.rating)))}
            <span className="text-(--theme-border) opacity-40">
              {"★".repeat(Math.max(0, 5 - review.rating))}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${statusConfig.className}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {statusConfig.label}
        </span>
      </div>

      {/* Title */}
      <h3 className="mt-3 text-base sm:text-lg font-semibold tracking-tight text-(--theme-text) break-words">
        {review.title}
      </h3>

      {/* Message with interactive Read more / Show less */}
      <div className="mt-2 text-sm leading-relaxed text-(--theme-text-muted) break-words whitespace-pre-wrap">
        <p>{displayMessage}</p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1 inline-block text-xs font-medium text-(--theme-accent) hover:underline focus:outline-none"
          >
            {expanded ? "Show less ↑" : "Read more ↓"}
          </button>
        )}
      </div>

      {/* Footer metadata */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-(--theme-border) pt-3 text-xs text-(--theme-text-muted)">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-(--theme-text)">
            {review.display_name || "Anonymous Beta User"}
          </span>
          <span>·</span>
          <time dateTime={review.created_at}>
            {formatDate(review.created_at)}
          </time>
        </div>

        {review.is_public !== undefined && (
          <span className="text-[11px] font-mono text-(--theme-text-muted)">
            {review.is_public ? "Public review" : "Private report"}
          </span>
        )}
      </div>

      {children}
    </article>
  );
}

function getStatusConfig(status: string) {
  switch (status.toLowerCase()) {
    case "approved":
      return {
        label: "Approved & Live",
        className:
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
      };
    case "pending":
      return {
        label: "Awaiting Moderation",
        className:
          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
      };
    case "resolved":
      return {
        label: "Resolved",
        className:
          "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
      };
    case "rejected":
      return {
        label: "Private / Declined",
        className:
          "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
      };
    default:
      return {
        label: status,
        className: "badge-active",
      };
  }
}

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateString;
  }
}
