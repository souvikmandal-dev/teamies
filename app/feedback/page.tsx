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
  return <main className="min-h-screen">
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link href="/" aria-label="Teamies home"><TeamiesLogo /></Link><span className="badge-active">Beta</span><nav className="flex gap-4 text-sm"><Link href="/dashboard">Dashboard</Link>{admin && <Link href="/admin/feedback">Moderate feedback</Link>}</nav></header>
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><h1 className="text-3xl font-semibold tracking-tight">Help shape Teamies</h1><p className="mt-3 text-(--theme-text-muted)">A small community, building something better together.</p>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="share-heading" className="rounded-lg border border-(--theme-border) bg-(--theme-surface) p-5 sm:p-6"><h2 id="share-heading" className="mb-4 text-xl">Share feedback</h2>{user ? <FeedbackForm /> : <p className="text-sm"><Link className="action-link-secondary" href="/login?next=/feedback">Sign in</Link> to share your experience. Community reviews are available below.</p>}</section>
        <section aria-labelledby="reviews-heading"><h2 id="reviews-heading" className="text-xl">Community reviews</h2><p className="mt-2 text-sm text-(--theme-text-muted)">Only reviews shared with permission and approved by a moderator appear here.</p>
          <form className="my-5 flex flex-wrap items-end gap-3"><label className="text-sm">Category<select name="type" defaultValue={type} className="mt-1 block rounded-md border p-2"><option value="">All</option>{Object.entries(feedbackTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">Sort<select name="sort" defaultValue={highest ? "rating" : "latest"} className="mt-1 block rounded-md border p-2"><option value="latest">Latest</option><option value="rating">Highest rated</option></select></label><button className="button-secondary">Apply</button></form>
          {error ? <p role="alert">Reviews are temporarily unavailable. <Link href="/feedback" className="action-link-secondary">Try again</Link></p> : <><p className="mb-3 text-xs text-(--theme-text-muted)">{count ?? 0} public reviews{type ? " in this category" : ""}</p><div className="space-y-4">{data?.length ? (data as Review[]).map((review, index) => <FeedbackCard key={`${review.created_at}-${index}`} review={review} />) : <p className="rounded-lg border border-dashed border-(--theme-border) p-6 text-sm text-(--theme-text-muted)">No reviews here yet. Your feedback helps us improve.</p>}</div><nav aria-label="Review pages" className="mt-5 flex gap-4">{page > 1 && <Link className="action-link-secondary" href={pageLink(page - 1)}>Previous</Link>}{(count ?? 0) > page * 20 && <Link className="action-link-secondary" href={pageLink(page + 1)}>Next</Link>}</nav></>}
        </section>
      </div>
    </div>
  </main>;
}
