"use client";

import { useState } from "react";
import { submitReportAction } from "@/app/actions/project-management";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "project" | "profile";
  targetId: string;
  targetName: string;
}

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
}: ReportModalProps) {
  const [reason, setReason] = useState<"spam" | "inappropriate" | "harassment" | "scam" | "other">("spam");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ error?: string; success?: boolean } | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    const res = await submitReportAction({
      targetType,
      targetId,
      reason,
      details,
    });

    setIsSubmitting(false);
    if (!res.success) {
      setFeedback({ error: res.error || "Failed to submit report. Please try again." });
    } else {
      setFeedback({ success: true });
      setTimeout(() => {
        onClose();
        setFeedback(null);
        setDetails("");
      }, 1500);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-3">
          <h3 className="font-sans font-bold text-base text-[var(--theme-text)]">
            Report {targetType}: {targetName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {feedback?.success ? (
          <div className="py-8 text-center text-sm font-medium text-[var(--theme-accent)]">
            Thank you. Your report has been submitted to moderators.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {feedback?.error ? (
              <p className="rounded-md border border-[var(--theme-warn)] bg-[var(--theme-warn-soft)] p-2 text-xs text-[var(--theme-warn)]" role="alert">
                {feedback.error}
              </p>
            ) : null}

            <div>
              <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                Reason for report
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                className="h-10 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
              >
                <option value="spam">Spam or commercial advertising</option>
                <option value="inappropriate">Inappropriate or offensive content</option>
                <option value="harassment">Harassment or abusive behavior</option>
                <option value="scam">Scam, fraudulent, or impersonation</option>
                <option value="other">Other issue</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                Additional Details (optional)
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Help us understand the issue..."
                className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--theme-border)]">
              <button
                type="button"
                onClick={onClose}
                className="button-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="button-primary text-xs"
              >
                {isSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

