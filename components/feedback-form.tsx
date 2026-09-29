"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { submitFeedback } from "@/app/actions/feedback";
import { feedbackTypes, pageContext } from "@/lib/feedback/validation";

const STORAGE_KEY = "teamies_my_feedback";

export function FeedbackForm({
  context = "/feedback",
  onClose,
}: {
  context?: string;
  onClose?: () => void;
}) {
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
    if (!navigator.onLine) {
      setError("You're offline. Reconnect and send your feedback again.");
      return;
    }
    const data = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    locked.current = true;
    setError("");

    const reqId = requestId.current;
    const type = String(data.get("type"));
    const rating = Number(data.get("rating"));
    const title = String(data.get("title") || "").trim();
    const message = String(data.get("message") || "").trim();
    const isPublic = data.get("public") === "on";
    const isAnonymous = data.get("name") !== "on";

    startTransition(async () => {
      try {
        const result = await submitFeedback({
          requestId: reqId,
          type,
          rating,
          title,
          message,
          context: pageContext(context),
          isPublic,
          isAnonymous,
        });

        if (result.error) {
          setError(result.error);
          setSignIn(Boolean(result.signIn));
        } else {
          // Persist locally for immediate availability under "My Feedback"
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const existing = raw ? JSON.parse(raw) : [];
            const newItem = {
              id: reqId,
              feedback_type: type,
              rating,
              title,
              message,
              page_context: pageContext(context),
              is_public: isPublic,
              is_anonymous: isAnonymous,
              display_name: isAnonymous ? "Anonymous Beta User" : "You",
              status: "pending",
              created_at: new Date().toISOString(),
            };
            const filtered = Array.isArray(existing)
              ? existing.filter(
                  (x: { id?: string; title?: string; message?: string }) =>
                    x.id !== reqId &&
                    !(x.title === title && x.message === message)
                )
              : [];
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify([newItem, ...filtered].slice(0, 50))
            );
          } catch {
            // LocalStorage errors are non-fatal
          }

          setSuccess(true);
        }
      } catch {
        setError(
          "Connection interrupted. Please try again; retrying won't send a duplicate."
        );
      } finally {
        locked.current = false;
      }
    });
  }

  if (success) {
    return (
      <div role="status" className="space-y-4 py-4">
        <div className="flex items-center gap-2 text-emerald-500">
          <span className="text-xl font-bold">✓</span>
          <h2 className="text-xl font-semibold text-(--theme-text)">
            Thanks — your feedback has been submitted.
          </h2>
        </div>
        <p className="text-sm text-(--theme-text-muted) leading-relaxed">
          Your feedback is saved in our database. Reviews consented for public view will appear in <strong>Community Reviews</strong> after moderator approval. You can track your submission status anytime under <strong>My Feedback</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Link
            href="/reviews?tab=my-feedback"
            onClick={() => onClose?.()}
            className="button-primary text-xs"
          >
            View My Feedback →
          </Link>
          <Link
            href="/reviews"
            onClick={() => onClose?.()}
            className="button-secondary text-xs"
          >
            Community Reviews
          </Link>
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              requestId.current = null;
            }}
            className="action-link-secondary text-xs"
          >
            Send more feedback
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-(--theme-text-muted) hover:text-(--theme-text) ml-auto"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-5">
      <p className="text-sm text-(--theme-text-muted)">
        Tell us what works and what could be better. Please leave out passwords, email addresses, and other private information.
      </p>
      <fieldset disabled={pending} className="space-y-5">
        <label className="block text-sm font-medium">
          Feedback type
          <select name="type" className={control} defaultValue="general">
            {Object.entries(feedbackTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Overall Teamies rating</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <label
                key={rating}
                className="flex min-h-11 items-center gap-2 rounded-md border border-(--theme-border) px-3 has-checked:border-(--theme-accent) has-checked:bg-(--theme-accent-soft)"
              >
                <input
                  type="radio"
                  name="rating"
                  value={rating}
                  required
                  aria-label={`${rating} out of 5 stars`}
                />
                {rating}
                <span aria-hidden="true" className="text-amber-500">
                  ★
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">
          Title
          <input
            name="title"
            required
            minLength={3}
            maxLength={120}
            className={control}
            placeholder="A short summary"
          />
        </label>
        <label className="block text-sm font-medium">
          Feedback
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={4000}
            rows={5}
            className={control}
            placeholder="What happened? What would help?"
          />
          <span className="text-xs text-(--theme-text-muted)">
            10–4,000 characters
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            className="mt-1"
            name="public"
            type="checkbox"
            checked={publicReview}
            onChange={(event) => setPublicReview(event.target.checked)}
          />
          Allow this feedback to appear in the Teamies beta reviews after moderation.
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            className="mt-1"
            name="name"
            type="checkbox"
            disabled={!publicReview}
          />
          Show my profile name publicly. Otherwise, display “Anonymous Beta User”.
        </label>
        <p className="text-xs text-(--theme-text-muted)">
          We attach the page category ({pageContext(context)}) to help investigate. We do not collect URL parameters, device identifiers, or email addresses with your feedback. Moderators can read all submissions.
        </p>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-(--theme-warn)">
          {error}
        </p>
      )}
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
      <button
        className="button-primary"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
