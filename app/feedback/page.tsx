import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FeedbackForm } from "@/components/feedback-form";
import { FeedbackCard, type Review } from "@/components/feedback-list";
import { TeamiesLogo } from "@/components/teamies-logo";
import { feedbackTypes } from "@/lib/feedback/validation";

export const metadata = { title: "Beta feedback" };
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const type = typeof params.type === "string" && Object.hasOwn(feedbackTypes, params.type) ? params.type : "";
  const highest = params.sort === "rating";
  const page = Math.min(10000, Math.max(1, Number(params.page) || 1)) | 0;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const admin = user ? (await db.rpc("is_feedback_admin")).data === true : false;
  let query = db.from("feedback_reviews").select("feedback_type,rating,title,message,created_at,status,display_name", { count: "exact" });
  if (type) query = query.eq("feedback_type", type);
  if (highest) query = query.order("rating", { ascending: false });
  const { data, error, count } = await query.order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) console.error("[feedback] reviews failed", { code: error.code });
  const pageLink = (number: number) => `/feedback?${new URLSearchParams({ type, sort: highest ? "rating" : "latest", page: String(number) })}`;

  // Query live database statistics from all approved reviews
  const { data: allApproved } = await db.from("feedback_reviews").select("rating, feedback_type");
  const totalApproved = allApproved?.length ?? 0;
  const avgRating = totalApproved > 0
    ? (allApproved!.reduce((acc, curr) => acc + (curr.rating || 0), 0) / totalApproved).toFixed(1)
    : null;
  const featureCount = allApproved?.filter(r => r.feedback_type === "feature").length ?? 0;
  const bugCount = allApproved?.filter(r => r.feedback_type === "bug").length ?? 0;

  return <main className="min-h-screen">
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 border-b border-(--theme-border)">
      <Link href="/" aria-label="Teamies home"><TeamiesLogo /></Link>
      <nav className="flex items-center gap-4 text-sm font-medium">
        <Link href="/reviews" className="text-(--theme-text-muted) hover:text-(--theme-text) transition-colors">Community Reviews</Link>
        <Link href="/dashboard" className="text-(--theme-text-muted) hover:text-(--theme-text) transition-colors">Dashboard</Link>
        <Link href="/discover/projects" className="text-(--theme-text-muted) hover:text-(--theme-text) transition-colors">Explore Projects</Link>
        {admin && <Link href="/admin/feedback" className="badge-active">Moderate feedback</Link>}
      </nav>
    </header>
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Help shape Teamies</h1>
      <p className="mt-3 text-(--theme-text-muted)">A small community of builders, building something better together.</p>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section aria-labelledby="share-heading" className="rounded-lg border border-(--theme-border) bg-(--theme-surface) p-5 sm:p-6">
          <h2 id="share-heading" className="mb-4 text-xl font-semibold">Share feedback</h2>
          {user ? <FeedbackForm /> : <div className="space-y-3 py-2"><p className="text-sm text-(--theme-text-muted)">Sign in to share your experience with the Teamies team. Community reviews are available alongside.</p><Link className="button-primary text-xs inline-block" href="/login?next=/feedback">Sign in to send feedback</Link></div>}
        </section>

        <section aria-labelledby="reviews-heading">
          <div className="flex items-center justify-between">
            <h2 id="reviews-heading" className="text-xl font-semibold">Community reviews</h2>
            <Link href="/reviews" className="action-link-secondary text-xs">View full page →</Link>
          </div>
          <p className="mt-2 text-sm text-(--theme-text-muted)">Only reviews shared with permission and approved by a moderator appear here.</p>

          {totalApproved > 0 && (
            <div className="my-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-(--theme-border) bg-(--theme-surface) p-3 text-center">
                <div className="text-lg font-semibold text-(--theme-text)">{avgRating} <span className="text-xs text-amber-500">★</span></div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-(--theme-text-muted)">Avg Rating</div>
              </div>
              <div className="rounded-lg border border-(--theme-border) bg-(--theme-surface) p-3 text-center">
                <div className="text-lg font-semibold text-(--theme-text)">{totalApproved}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-(--theme-text-muted)">Approved</div>
              </div>
              <div className="rounded-lg border border-(--theme-border) bg-(--theme-surface) p-3 text-center">
                <div className="text-lg font-semibold text-(--theme-text)">{featureCount}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-(--theme-text-muted)">Features</div>
              </div>
              <div className="rounded-lg border border-(--theme-border) bg-(--theme-surface) p-3 text-center">
                <div className="text-lg font-semibold text-(--theme-text)">{bugCount}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-(--theme-text-muted)">Bugs</div>
              </div>
            </div>
          )}

          <form className="my-5 flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">Category
              <select name="type" defaultValue={type} className="mt-1 block rounded-md border border-(--theme-border) bg-(--theme-surface) p-2 text-xs">
                <option value="">All categories</option>
                {Object.entries(feedbackTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Sort
              <select name="sort" defaultValue={highest ? "rating" : "latest"} className="mt-1 block rounded-md border border-(--theme-border) bg-(--theme-surface) p-2 text-xs">
                <option value="latest">Latest first</option>
                <option value="rating">Highest rated</option>
              </select>
            </label>
            <button className="button-secondary text-xs">Apply filter</button>
          </form>

          {error ? (
            <p role="alert" className="text-sm text-(--theme-warn)">Reviews are temporarily unavailable. <Link href="/feedback" className="action-link-secondary">Try again</Link></p>
          ) : (
            <>
              <p className="mb-3 text-xs text-(--theme-text-muted)">
                {count ?? 0} public {count === 1 ? "review" : "reviews"}{type ? ` in ${feedbackTypes[type as keyof typeof feedbackTypes]}` : ""}
              </p>
              <div className="space-y-4">
                {data?.length ? (
                  (data as Review[]).map((review, index) => (
                    <FeedbackCard key={`${review.created_at}-${index}`} review={review} />
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-(--theme-border) p-6 text-sm text-(--theme-text-muted)">
                    No approved community reviews match this category yet. Submit your feedback to help us build a better Teamies.
                  </p>
                )}
              </div>
              <nav aria-label="Review pages" className="mt-5 flex gap-4">
                {page > 1 && <Link className="action-link-secondary" href={pageLink(page - 1)}>Previous</Link>}
                {(count ?? 0) > page * 20 && <Link className="action-link-secondary" href={pageLink(page + 1)}>Next</Link>}
              </nav>
            </>
          )}
        </section>
      </div>
    </div>
  </main>;
}
