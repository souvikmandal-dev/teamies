"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { FeedbackForm } from "@/components/feedback-form";

export function FeedbackWidget() {
  const dialog = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  useEffect(() => { dialog.current?.close(); }, [path]);
  if (["/login", "/signup", "/feedback"].includes(path) || path.startsWith("/admin")) return null;
  return <>
    <button type="button" className="button-secondary fixed bottom-4 right-4 z-40 shadow-sm" onClick={() => dialog.current?.showModal()}><span className="badge-active">Beta</span> Share feedback</button>
    <dialog ref={dialog} aria-labelledby="feedback-dialog-title" className="feedback-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5 text-(--theme-text) sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id="feedback-dialog-title" className="text-xl font-semibold">Share feedback</h2><button type="button" className="button-secondary" onClick={() => dialog.current?.close()} aria-label="Close feedback">Close</button></div>
      <FeedbackForm key={path} context={path} />
      <p className="mt-5"><Link href="/feedback" className="action-link-secondary">Read community reviews</Link></p>
    </dialog>
  </>;
}
