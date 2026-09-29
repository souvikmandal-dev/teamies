"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { submitFeedback } from "@/app/actions/feedback";
import { feedbackTypes, pageContext } from "@/lib/feedback/validation";

export function FeedbackForm({ context = "/feedback" }: { context?: string }) {
  const requestId = useRef<string | null>(null);
  const locked = useRef(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [publicReview, setPublicReview] = useState(false);
  const control = "mt-2 w-full rounded-md border border-(--theme-border) p-3";

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    if (!navigator.onLine) { setError("You're offline. Reconnect and send your feedback again."); return; }
    const data = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    locked.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await submitFeedback({
          requestId: requestId.current, type: data.get("type"), rating: Number(data.get("rating")),
          title: data.get("title"), message: data.get("message"), context: pageContext(context),
          isPublic: data.get("public") === "on", isAnonymous: data.get("name") !== "on",
        });
        if (result.error) { setError(result.error); setSignIn(Boolean(result.signIn)); }
        else { setSuccess(true); }
      } catch {
        setError("Connection interrupted. Please try again; retrying won't send a duplicate.");
      } finally { locked.current = false; }
    });
  }
  if (success) {
    return (
      <div role="status" className="space-y-4 py-6">
        <h2 className="text-xl font-semibold">Thanks — your feedback has been received.</h2>
        <p className="text-sm text-(--theme-text-muted)">
          We review every submission. Consented reviews appear only after moderator approval.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              requestId.current = null;
            }}
            className="button-secondary text-xs"
          >
            Send more feedback
          </button>
          <Link href="/feedback" className="action-link-secondary text-xs">
            View community reviews
          </Link>
        </div>
      </div>
    );
  }
  return <form onSubmit={send} className="space-y-5">
    <p className="text-sm text-(--theme-text-muted)">Tell us what works and what could be better. Please leave out passwords, email addresses, and other private information.</p>
    <fieldset disabled={pending} className="space-y-5">
      <label className="block text-sm font-medium">Feedback type<select name="type" className={control} defaultValue="general">{Object.entries(feedbackTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <fieldset><legend className="text-sm font-medium">Overall Teamies rating</legend><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map(rating => <label key={rating} className="flex min-h-11 items-center gap-2 rounded-md border border-(--theme-border) px-3 has-checked:border-(--theme-accent) has-checked:bg-(--theme-accent-soft)"><input type="radio" name="rating" value={rating} required aria-label={`${rating} out of 5 stars`} />{rating}<span aria-hidden="true" className="text-amber-500">★</span></label>)}</div></fieldset>
      <label className="block text-sm font-medium">Title<input name="title" required minLength={3} maxLength={120} className={control} placeholder="A short summary" /></label>
      <label className="block text-sm font-medium">Feedback<textarea name="message" required minLength={10} maxLength={4000} rows={5} className={control} placeholder="What happened? What would help?" /><span className="text-xs text-(--theme-text-muted)">10–4,000 characters</span></label>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" name="public" type="checkbox" checked={publicReview} onChange={event => setPublicReview(event.target.checked)} />Allow this feedback to appear in the Teamies beta reviews after moderation.</label>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" name="name" type="checkbox" disabled={!publicReview} />Show my profile name publicly. Otherwise, display “Anonymous Beta User”.</label>
      <p className="text-xs text-(--theme-text-muted)">We attach the page category ({pageContext(context)}) to help investigate. We do not collect URL parameters, device identifiers, or email addresses with your feedback. Moderators can read all submissions.</p>
    </fieldset>
    {error && <p role="alert" className="text-sm text-(--theme-warn)">{error}</p>}
    {signIn && (
      <div>
        <Link
          href={`/login?next=${encodeURIComponent(context || "/feedback")}`}
          className="action-link-secondary font-medium"
        >
          Sign in to send feedback →
        </Link>
      </div>
    )}
    <button className="button-primary" disabled={pending} aria-busy={pending}>{pending ? "Sending…" : "Send feedback"}</button>
  </form>;
}
