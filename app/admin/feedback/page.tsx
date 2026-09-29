import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { feedbackStatuses, feedbackTypes } from "@/lib/feedback/validation";
import { FeedbackCard, type Review } from "@/components/feedback-list";
import { FeedbackModeration } from "@/components/feedback-moderation";

export const metadata = { title: "Feedback moderation", robots: { index: false, follow: false } };
export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/admin/feedback");
  const { data: admin, error: adminError } = await db.rpc("is_feedback_admin");
  if (adminError || !admin) notFound();
  const params = await searchParams;
  const type = params.type && Object.hasOwn(feedbackTypes, params.type) ? params.type : "";
  const status = feedbackStatuses.includes(params.status as typeof feedbackStatuses[number]) ? params.status! : "";
  const page = Math.min(10000, Math.max(1, Number(params.page) || 1)) | 0;
  let query = db.from("feedback").select("id,feedback_type,rating,title,message,created_at,status,display_name,is_public,is_anonymous,page_context", { count: "exact" });
  if (type) query = query.eq("feedback_type", type);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query.order("created_at", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) console.error("[feedback] admin listing failed", { code: error.code });
  const pageLink = (p: number) => `/admin/feedback?${new URLSearchParams({ type, status, page: String(p) })}`;
  return <main className="mx-auto max-w-4xl px-5 py-10"><Link href="/feedback" className="action-link-secondary">← Community feedback</Link><h1 className="mt-6 text-3xl">Feedback moderation</h1><p className="mt-3 text-sm text-(--theme-text-muted)">Approval publishes only consented reviews. Rejecting or returning to pending removes a review from public display. Resolving a pending report does not publish it.</p>
    <form className="my-6 flex flex-wrap items-end gap-3"><label>Category<select className="ml-2 rounded-md border p-2" name="type" defaultValue={type}><option value="">All</option>{Object.entries(feedbackTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Status<select className="ml-2 rounded-md border p-2" name="status" defaultValue={status}><option value="">All</option>{feedbackStatuses.map(s => <option key={s}>{s}</option>)}</select></label><button className="button-secondary">Filter</button></form>
    {error ? <p role="alert">Unable to load feedback. Please refresh to retry.</p> : <div className="space-y-5">{data?.length ? data.map(row => <FeedbackCard key={row.id} review={row as Review}><p className="mt-3 text-xs">{row.is_public ? "Public display consented" : "Private — do not publish"} · {row.is_anonymous ? "Anonymous public display" : "Named public display"} · Page: {row.page_context || "Not provided"}</p><FeedbackModeration id={row.id} status={row.status} isPublic={row.is_public} /></FeedbackCard>) : <p>No feedback matches these filters.</p>}</div>}
    <nav aria-label="Moderation pages" className="mt-6 flex gap-4">{page > 1 && <Link href={pageLink(page - 1)}>Previous</Link>}{(count ?? 0) > page * 20 && <Link href={pageLink(page + 1)}>Next</Link>}</nav>
  </main>;
}
