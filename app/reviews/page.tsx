import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FeedbackCard, type Review } from "@/components/feedback-list";
import { TeamiesLogo } from "@/components/teamies-logo";
import { feedbackTypes } from "@/lib/feedback/validation";

export const metadata = {
  title: "Community Reviews",
  description: "Approved reviews and feedback from the Teamies beta community.",
};

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const type =
    typeof params.type === "string" && Object.hasOwn(feedbackTypes, params.type)
      ? params.type
      : "";
  const highest = params.sort === "rating";
  const page = Math.min(10000, Math.max(1, Number(params.page) || 1)) | 0;

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const admin = user ? (await db.rpc("is_feedback_admin")).data === true : false;

  // Query live database reviews
  let query = db
    .from("feedback_reviews")
    .select("feedback_type,rating,title,message,created_at,status,display_name", {
      count: "exact",
    });

  if (type) query = query.eq("feedback_type", type);
  if (highest) query = query.order("rating", { ascending: false });

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);

  if (error) {
    console.error("[reviews] query failed", { code: error.code });
  }

  // Live database statistics
  const { data: allApproved } = await db
    .from("feedback_reviews")
    .select("rating, feedback_type");

  const totalApproved = allApproved?.length ?? 0;
  const avgRating =
    totalApproved > 0
      ? (
          allApproved!.reduce((acc, curr) => acc + (curr.rating || 0), 0) /
          totalApproved
        ).toFixed(1)
      : null;
  const featureCount =
    allApproved?.filter((r) => r.feedback_type === "feature").length ?? 0;
  const bugCount =
    allApproved?.filter((r) => r.feedback_type === "bug").length ?? 0;

  const pageLink = (p: number) =>
    `/reviews?${new URLSearchParams({
      type,
      sort: highest ? "rating" : "latest",
      page: String(p),
    })}`;

  return (
    <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
      {/* Header */}
      <header className="border-b border-(--theme-border) bg-(--theme-surface)/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Teamies home">
            <TeamiesLogo variant="auto" priority />
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link
              href="/dashboard"
              className="text-(--theme-text-muted) hover:text-(--theme-text) transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/discover/projects"
              className="text-(--theme-text-muted) hover:text-(--theme-text) transition-colors"
            >
              Explore Projects
            </Link>
            <Link
              href="/feedback"
              className="button-primary text-xs"
            >
              Leave a Review
            </Link>
            {admin && (
              <Link href="/admin/feedback" className="badge-active">
                Moderate
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Page Hero */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-(--theme-border) pb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge-active text-[10px] uppercase font-mono tracking-wider">
                Community
              </span>
              <span className="text-xs font-mono uppercase tracking-[0.16em] text-(--theme-text-muted)">
                Beta Reviews
              </span>
            </div>
            <h1 className="mt-2 text-3xl sm:text-4xl font-sans font-bold tracking-tight">
              Community Reviews
            </h1>
            <p className="mt-2 text-base text-(--theme-text-muted) max-w-2xl leading-relaxed">
              Real feedback, suggestions, and experiences from builders participating in the Teamies private beta.
            </p>
          </div>
          <div className="shrink-0 pt-2 sm:pt-0">
            <Link
              href="/feedback"
              className="button-primary inline-flex items-center gap-2 text-sm !px-5 !py-2.5"
            >
              <span>Share your feedback</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        {/* Live Statistics */}
        <div className="my-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-4 text-center">
            <div className="text-2xl font-bold font-sans text-(--theme-text)">
              {avgRating ? `${avgRating}` : "—"}
              {avgRating && <span className="text-amber-500 text-lg ml-1">★</span>}
            </div>
            <div className="mt-1 text-[11px] font-mono uppercase tracking-wider text-(--theme-text-muted)">
              Average Rating
            </div>
          </div>

          <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-4 text-center">
            <div className="text-2xl font-bold font-sans text-(--theme-text)">
              {totalApproved}
            </div>
            <div className="mt-1 text-[11px] font-mono uppercase tracking-wider text-(--theme-text-muted)">
              Approved Reviews
            </div>
          </div>

          <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-4 text-center">
            <div className="text-2xl font-bold font-sans text-(--theme-text)">
              {featureCount}
            </div>
            <div className="mt-1 text-[11px] font-mono uppercase tracking-wider text-(--theme-text-muted)">
              Feature Ideas
            </div>
          </div>

          <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-4 text-center">
            <div className="text-2xl font-bold font-sans text-(--theme-text)">
              {bugCount}
            </div>
            <div className="mt-1 text-[11px] font-mono uppercase tracking-wider text-(--theme-text-muted)">
              Bugs Handled
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <section
          aria-label="Filter community reviews"
          className="mb-8 rounded-xl border border-(--theme-border) bg-(--theme-surface) p-4 sm:p-5"
        >
          <form className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-mono uppercase tracking-wider text-(--theme-text-muted)">
                Filter:
              </label>
              <select
                name="type"
                defaultValue={type}
                className="rounded-md border border-(--theme-border) bg-(--theme-bg) px-3 py-1.5 text-xs text-(--theme-text) outline-none focus:border-(--theme-accent)"
              >
                <option value="">All Categories</option>
                {Object.entries(feedbackTypes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>

              <label className="text-xs font-mono uppercase tracking-wider text-(--theme-text-muted) ml-2">
                Sort:
              </label>
              <select
                name="sort"
                defaultValue={highest ? "rating" : "latest"}
                className="rounded-md border border-(--theme-border) bg-(--theme-bg) px-3 py-1.5 text-xs text-(--theme-text) outline-none focus:border-(--theme-accent)"
              >
                <option value="latest">Latest First</option>
                <option value="rating">Highest Rated</option>
              </select>

              <button type="submit" className="button-secondary text-xs">
                Apply
              </button>
            </div>

            <div className="text-xs text-(--theme-text-muted)">
              Showing {count ?? 0} {count === 1 ? "review" : "reviews"}
            </div>
          </form>
        </section>

        {/* Reviews List */}
        {error ? (
          <div role="alert" className="rounded-xl border border-(--theme-warn)/30 bg-(--theme-warn-soft)/30 p-6 text-center text-sm">
            <p className="text-(--theme-warn)">Unable to load community reviews right now.</p>
            <Link href="/reviews" className="action-link-secondary mt-2 inline-block text-xs">
              Refresh page
            </Link>
          </div>
        ) : data && data.length > 0 ? (
          <div className="space-y-4">
            {(data as Review[]).map((review, index) => (
              <FeedbackCard key={`${review.created_at}-${index}`} review={review} />
            ))}

            {/* Pagination */}
            <nav
              aria-label="Review pagination"
              className="flex items-center justify-between border-t border-(--theme-border) pt-6 mt-8"
            >
              {page > 1 ? (
                <Link className="action-link-secondary text-xs font-medium" href={pageLink(page - 1)}>
                  ← Previous page
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-(--theme-text-muted) font-mono">Page {page}</span>
              {(count ?? 0) > page * 20 ? (
                <Link className="action-link-secondary text-xs font-medium" href={pageLink(page + 1)}>
                  Next page →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-(--theme-border) bg-(--theme-surface) p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-(--theme-accent-soft) text-(--theme-accent)">
              ★
            </div>
            <h2 className="mt-4 text-lg font-semibold text-(--theme-text)">
              No approved reviews in this view yet
            </h2>
            <p className="mt-2 text-sm text-(--theme-text-muted) max-w-md mx-auto leading-relaxed">
              We review every submission before publishing. As an early beta tester, your feedback will directly shape Teamies!
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/feedback" className="button-primary text-xs">
                Write a Review
              </Link>
              {type && (
                <Link href="/reviews" className="button-secondary text-xs">
                  Clear Filter
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
