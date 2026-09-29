"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeedbackForm } from "@/components/feedback-form";

export function FeedbackWidget() {
  const dialog = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    dialog.current?.close();
  }, [path]);

  if (["/login", "/signup", "/feedback"].includes(path) || path.startsWith("/admin")) return null;

  function handleOpen() {
    setFormKey((k) => k + 1);
    dialog.current?.showModal();
  }

  function handleClose() {
    dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className="button-secondary fixed bottom-4 right-4 z-40 shadow-sm flex items-center gap-2"
        onClick={handleOpen}
        aria-haspopup="dialog"
      >
        <span className="badge-active text-[10px] uppercase font-mono tracking-wider">Beta</span>
        <span>Share feedback</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="feedback-dialog-title"
        onClick={(e) => {
          if (e.target === dialog.current) {
            handleClose();
          }
        }}
        className="feedback-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5 text-(--theme-text) sm:p-7 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="feedback-dialog-title" className="text-xl font-semibold">Share feedback</h2>
          <button
            type="button"
            className="button-secondary text-xs"
            onClick={handleClose}
            aria-label="Close feedback dialog"
          >
            Close
          </button>
        </div>
        <FeedbackForm key={`${path}-${formKey}`} context={path} />
        <p className="mt-5 border-t border-dashed border-(--theme-border) pt-4">
          <Link href="/reviews" onClick={handleClose} className="action-link-secondary text-xs">
            Read community reviews →
          </Link>
        </p>
      </dialog>
    </>
  );
}
