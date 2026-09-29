import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { feedbackStatuses, feedbackTypes } from "@/lib/feedback/validation";
import { FeedbackCard, type Review } from "@/components/feedback-list";
import { FeedbackModeration } from "@/components/feedback-moderation";

export const metadata = {
  title: "Feedback Moderation",
  robots: { index: false, follow: false },
};

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) redirect("/login?next=/admin/feedback");

  const { data: admin } = await db.rpc("is_feedback_admin");
  const isDbAdmin = admin === true;
  const isOwner = user.email === "souvikmandal.work1@gmail.com";

  // Deny access to unauthorized users
  if (!isDbAdmin && !isOwner) notFound();

  // If user is project owner but database membership hasn't been provisioned yet
  if (!isDbAdmin && isOwner) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-14">
        <Link href="/reviews" className="action-link-secondary text-xs">
          ← Back to Community Reviews
        </Link>
        <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-amber-500">
            <span className="text-xl">⚠️</span>
            <h1 className="text-xl font-bold font-sans">
              Feedback Admin Activation Required
            </h1>
          </div>
          <p className="mt-3 text-sm text-(--theme-text-muted) leading-relaxed">
            You are signed in as the Teamies owner (<code className="text-(--theme-text) font-mono">{user.email}</code>). To allow your account to approve and moderate user feedback in PostgreSQL, run the following command in your{" "}
            <strong>Supabase Dashboard → SQL Editor</strong>:
          </p>
          <div className="mt-4 rounded-lg bg-black/60 p-4 font-mono text-xs text-emerald-400 overflow-x-auto select-all">
            {`INSERT INTO public.feedback_admins (user_id)
SELECT id FROM auth.users WHERE email = 'souvikmandal.work1@gmail.com'
ON CONFLICT (user_id) DO NOTHING;`}
          </div>
          <p className="mt-3 text-xs text-(--theme-text-muted)">
            Once executed, reload this page to access the live moderation console.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link href="/admin/feedback" className="button-primary text-xs">
              Refresh Page
            </Link>
            <Link href="/reviews" className="button-secondary text-xs">
              Go to Reviews
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const type =
    params.type && Object.hasOwn(feedbackTypes, params.type) ? params.type : "";
  const status = feedbackStatuses.includes(
    params.status as typeof feedbackStatuses[number]
  )
    ? params.status!
    : "";
  const page = Math.min(10000, Math.max(1, Number(params.page) || 1)) | 0;

  let query = db
    .from("feedback")
    .select(
      "id,feedback_type,rating,title,message,created_at,status,display_name,is_public,is_anonymous,page_context",
      { count: "exact" }
    );

  if (type) query = query.eq("feedback_type", type);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);

  if (error) {
    console.error("[feedback] admin listing failed", { code: error.code });
  }

  const pageLink = (p: number) =>
    `/admin/feedback?${new URLSearchParams({
      type,
      status,
      page: String(p),
    })}`;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <div className="flex items-center justify-between border-b border-(--theme-border) pb-6">
        <div>
          <Link href="/reviews" className="action-link-secondary text-xs">
            ← Community Reviews
          </Link>
          <h1 className="mt-3 text-3xl font-bold font-sans tracking-tight">
            Feedback Moderation
          </h1>
          <p className="mt-2 text-sm text-(--theme-text-muted)">
            Approval publishes only consented public reviews. Rejecting removes a review from public display. Resolving marks reports as addressed without publishing.
          </p>
        </div>
      </div>

      <form className="my-6 flex flex-wrap items-end gap-3 rounded-xl border border-(--theme-border) bg-(--theme-surface) p-4">
        <label className="text-xs font-mono uppercase tracking-wider text-(--theme-text-muted)">
          Category:
          <select
            className="mt-1 block rounded-md border border-(--theme-border) bg-(--theme-bg) p-2 text-xs text-(--theme-text)"
            name="type"
            defaultValue={type}
          >
            <option value="">All</option>
            {Object.entries(feedbackTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-mono uppercase tracking-wider text-(--theme-text-muted)">
          Status:
          <select
            className="mt-1 block rounded-md border border-(--theme-border) bg-(--theme-bg) p-2 text-xs text-(--theme-text)"
            name="status"
            defaultValue={status}
          >
            <option value="">All</option>
            {feedbackStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="button-secondary text-xs">Filter</button>
        <div className="ml-auto text-xs text-(--theme-text-muted)">
          {count ?? 0} {count === 1 ? "submission" : "submissions"}
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-(--theme-warn)">
          Unable to load feedback. Please refresh to retry.
        </p>
      ) : (
        <div className="space-y-5">
          {data?.length ? (
            data.map((row) => (
              <FeedbackCard key={row.id} review={row as Review}>
                <div className="mt-3 border-t border-(--theme-border) pt-3 text-xs text-(--theme-text-muted)">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      {row.is_public
                        ? "✓ Public display consented"
                        : "✗ Private — do not publish"}
                    </span>
                    <span>·</span>
                    <span>
                      {row.is_anonymous
                        ? "Anonymous display"
                        : "Named display"}
                    </span>
                    <span>·</span>
                    <span>Page: {row.page_context || "Not provided"}</span>
                  </div>
                  <FeedbackModeration
                    id={row.id}
                    status={row.status}
                    isPublic={row.is_public}
                  />
                </div>
              </FeedbackCard>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-(--theme-border) bg-(--theme-surface) p-8 text-center text-sm text-(--theme-text-muted)">
              No feedback matches the selected filters.
            </div>
          )}
        </div>
      )}

      <nav
        aria-label="Moderation pages"
        className="mt-6 flex items-center justify-between border-t border-(--theme-border) pt-4"
      >
        {page > 1 ? (
          <Link href={pageLink(page - 1)} className="action-link-secondary text-xs">
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="text-xs font-mono text-(--theme-text-muted)">
          Page {page}
        </span>
        {(count ?? 0) > page * 20 ? (
          <Link href={pageLink(page + 1)} className="action-link-secondary text-xs">
            Next →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
