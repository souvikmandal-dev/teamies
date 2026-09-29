import { feedbackTypes } from "@/lib/feedback/validation";
export type Review = { feedback_type: keyof typeof feedbackTypes; rating: number; title: string; message: string; created_at: string; status: string; display_name: string };
export function FeedbackCard({ review, children }: { review: Review; children?: React.ReactNode }) {
  return <article className="rounded-lg border border-(--theme-border) bg-(--theme-surface) p-5">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="chip-tag">{feedbackTypes[review.feedback_type]}</span><span aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><span className="badge-active">{review.status}</span></div>
    <h3 className="mt-3 break-words text-lg font-semibold">{review.title}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{review.message}</p>
    <p className="mt-4 text-xs text-(--theme-text-muted)">{review.display_name} · <time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time></p>{children}
  </article>;
}
