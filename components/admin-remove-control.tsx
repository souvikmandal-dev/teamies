"use client";

import { useId, useState, useTransition } from "react";
import { removeBuilderAsAdmin, removeProjectAsAdmin } from "@/app/actions/admin";

export function AdminRemoveControl({ kind, id, identifier, ownedProjects = 0, isSelf = false }: {
  kind: "project" | "builder";
  id: string;
  identifier: string;
  ownedProjects?: number;
  isSelf?: boolean;
}) {
  const inputId = useId();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (isSelf) return <p className="text-xs text-(--theme-text-muted)">Your admin account is protected.</p>;
  if (removed) return <p role="status" className="text-sm text-(--theme-accent)">Removed successfully.</p>;

  return (
    <div className="mt-4">
      {!isConfirming ? (
        <button type="button" className="button-danger text-xs" onClick={() => setIsConfirming(true)}>
          Remove {kind}
        </button>
      ) : (
        <form className="space-y-3 rounded-lg border border-(--theme-warn) bg-(--theme-warn-soft) p-4" onSubmit={(event) => {
          event.preventDefault();
          if (pending || confirmation !== identifier) return;
          setError("");
          startTransition(async () => {
            try {
              const result = kind === "project"
                ? await removeProjectAsAdmin(id, confirmation)
                : await removeBuilderAsAdmin(id, confirmation);
              if (!result.success) setError(result.error || "Removal failed. Please try again.");
              else setRemoved(true);
            } catch {
              setError("Unable to remove this item. Please try again.");
            }
          });
        }}>
          <p className="text-sm text-(--theme-text)">
            {kind === "project"
              ? "This permanently removes the project, its roles, memberships, and applications."
              : `This permanently removes the builder's account, profile, ${ownedProjects} owned ${ownedProjects === 1 ? "project" : "projects"}, memberships, applications, and feedback.`}
            {" "}This cannot be undone.
          </p>
          <label htmlFor={inputId} className="block text-xs text-(--theme-text-muted)">
            Type <strong className="break-all text-(--theme-text)">{identifier}</strong> exactly to confirm:
          </label>
          <input id={inputId} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending} autoComplete="off" maxLength={100}
            className="h-10 w-full rounded-md border border-(--theme-border) bg-(--theme-surface) px-3 text-sm text-(--theme-text) focus:outline-2 focus:outline-(--theme-accent)" />
          {error ? <p role="alert" className="text-sm text-(--theme-warn)">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending || confirmation !== identifier} className="button-danger text-xs disabled:opacity-40">
              {pending ? "Removing…" : `Permanently remove ${kind}`}
            </button>
            <button type="button" disabled={pending} className="button-secondary text-xs" onClick={() => {
              setIsConfirming(false); setConfirmation(""); setError("");
            }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
