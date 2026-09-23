import React from "react";

type ApplicationTimelineProps = {
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  createdAt: string;
  statusUpdatedAt?: string | null;
  className?: string;
};

function formatStepDate(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).format(new Date(isoString));
  } catch {
    return "";
  }
}

export function ApplicationTimeline({
  status,
  createdAt,
  statusUpdatedAt,
  className = "",
}: ApplicationTimelineProps) {
  const createdDate = new Date(createdAt);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isPendingOver14Days = status === "pending" && diffDays >= 14;

  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  const isWithdrawn = status === "withdrawn";
  const isDecided = isAccepted || isRejected || isWithdrawn;

  const steps = [
    {
      id: "applied",
      label: "Applied",
      timestamp: formatStepDate(createdAt),
      isCompleted: true,
      isActive: false,
    },
    {
      id: "under_review",
      label: "Under review",
      timestamp: status === "pending" ? "In progress" : formatStepDate(createdAt),
      isCompleted: isDecided,
      isActive: status === "pending",
    },
    {
      id: "decision",
      label: isAccepted
        ? "Accepted"
        : isRejected
          ? "Declined"
          : isWithdrawn
            ? "Withdrawn"
            : "Decision",
      timestamp:
        isDecided && statusUpdatedAt
          ? formatStepDate(statusUpdatedAt)
          : isDecided
            ? "Resolved"
            : "Pending",
      isCompleted: isDecided,
      isActive: false,
    },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connected-dot horizontal timeline */}
      <div className="relative flex items-start justify-between">
        {steps.map((step, index) => {
          const isFinished = step.isCompleted;
          const isCurrent = step.isActive;
          const nextStep = steps[index + 1];
          const connectorActive = nextStep ? nextStep.isCompleted || nextStep.isActive : false;

          return (
            <React.Fragment key={step.id}>
              <div className="relative z-10 flex flex-1 flex-col items-center text-center">
                {/* Connected Dot */}
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded-full transition-all ${
                    isFinished
                      ? isRejected && step.id === "decision"
                        ? "bg-[var(--theme-warn)] ring-4 ring-[var(--theme-warn-soft)]"
                        : "bg-[var(--theme-accent)] ring-4 ring-[var(--theme-accent-soft)]"
                      : isCurrent
                        ? "border-2 border-[var(--theme-accent)] bg-[var(--theme-surface)] ring-4 ring-[var(--theme-accent-soft)]"
                        : "border-2 border-[var(--theme-border)] bg-[var(--theme-surface)]"
                  }`}
                  aria-hidden="true"
                >
                  {isFinished ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-bg)]" />
                  ) : isCurrent ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)]" />
                  ) : null}
                </div>

                {/* Step Label */}
                <span className="mt-2.5 text-xs font-semibold text-[var(--theme-text)]">
                  {step.label}
                </span>

                {/* Timestamp / Status (IBM Plex Mono) */}
                <span className="mt-1 font-mono text-[11px] text-[var(--theme-text-muted)]">
                  {step.timestamp}
                </span>
              </div>

              {/* Connector line between steps */}
              {index < steps.length - 1 && (
                <div
                  className="relative top-2 -ml-2 -mr-2 h-0.5 flex-1 transition-colors"
                  style={{
                    backgroundColor: connectorActive
                      ? "var(--theme-accent)"
                      : "var(--theme-border)",
                  }}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {isPendingOver14Days && (
        <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 text-xs leading-5 text-[var(--theme-text-muted)]">
          <span className="font-semibold font-mono text-[var(--theme-text)]">Note:</span>{" "}
          No response yet — you may want to check other open projects while waiting.
        </div>
      )}
    </div>
  );
}
