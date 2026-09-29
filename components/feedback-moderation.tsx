"use client";
import { useState, useTransition } from "react";
import { moderateFeedback } from "@/app/actions/feedback";
import { feedbackStatuses } from "@/lib/feedback/validation";

export function FeedbackModeration({ id, status, isPublic }: { id: string; status: string; isPublic: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={event => {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("status"));
    setMessage("");
    startTransition(async () => {
      try { const result = await moderateFeedback(id, next); setMessage(result.error || "Status updated."); }
      catch { setMessage("Connection interrupted. Refresh to check the status before retrying."); }
    });
  }}><label className="text-sm">Status <select name="status" defaultValue={status} key={status} disabled={pending} className="ml-2 rounded-md border p-2">{feedbackStatuses.map(value => <option key={value} disabled={value === "approved" && !isPublic}>{value}</option>)}</select></label><button className="button-secondary" disabled={pending}>{pending ? "Saving…" : "Update status"}</button><p role="status" className="text-sm">{message}</p></form>;
}
