"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeedbackCard, type Review } from "@/components/feedback-list";
import type { MyFeedbackRecord } from "@/app/actions/feedback";

const STORAGE_KEY = "teamies_my_feedback";

export function MyFeedbackList({
  initialItems,
  isAuthenticated,
  userEmail,
}: {
  initialItems: MyFeedbackRecord[];
  isAuthenticated: boolean;
  userEmail?: string;
}) {
  const [items, setItems] = useState<MyFeedbackRecord[]>(initialItems);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const localList: MyFeedbackRecord[] = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(localList)) {
        setItems(initialItems);
        setSynced(true);
        return;
      }

      // Merge: server items take priority for status updates,
      // but retain any locally stored items not yet reflected by server.
      const map = new Map<string, MyFeedbackRecord>();

      // First add local items
      for (const item of localList) {
        if (item && item.title) {
          const key = item.id || `${item.title}-${item.created_at}`;
          map.set(key, item);
        }
      }

      // Then overwrite or add server items (authoritative status)
      for (const item of initialItems) {
        if (item && item.title) {
          // If a local item had matching title/message or id, reconcile
          let matchedKey = item.id;
          for (const [k, v] of map.entries()) {
            if (v.id === item.id || (v.title === item.title && v.message === item.message)) {
              matchedKey = k;
              break;
            }
          }
          map.set(matchedKey, item);
        }
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setItems(merged);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(0, 50)));
    } catch {
      setItems(initialItems);
    } finally {
      setSynced(true);
    }
  }, [initialItems]);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const approvedCount = items.filter((i) => i.status === "approved" || i.status === "resolved").length;

  const filteredItems = items.filter((item) => {
    if (filter === "pending") return item.status === "pending";
    if (filter === "approved") return item.status === "approved" || item.status === "resolved";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Auth Callout if not signed in */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-(--theme-text)">
                Sign in to track your feedback
              </h3>
              <p className="mt-1 text-xs text-(--theme-text-muted) leading-relaxed">
                Connect your Teamies account to view the status of your reviews and suggestions across all your devices.
              </p>
            </div>
            <Link
              href="/login?next=/reviews?tab=my-feedback"
              className="button-primary text-xs shrink-0 self-start sm:self-center"
            >
              Sign in to Teamies →
            </Link>
          </div>
        </div>
      )}

      {/* Status Notice */}
      <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface)/60 p-4 text-xs text-(--theme-text-muted) flex items-start gap-3">
        <span className="text-base leading-none text-amber-500">ℹ</span>
        <div>
          <span className="font-medium text-(--theme-text)">How moderation works:</span>{" "}
          Submissions with public consent start as <strong className="text-amber-500">Awaiting Moderation</strong>. Once approved by a moderator, your review becomes live in the <strong>Community Reviews</strong> tab for other builders to see.
        </div>
      </div>

      {/* Filter Tabs if user has submissions */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--theme-border) pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-(--theme-accent) text-white"
                  : "bg-(--theme-surface) text-(--theme-text-muted) hover:text-(--theme-text) border border-(--theme-border)"
              }`}
            >
              All Submissions ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "pending"
                  ? "bg-amber-500 text-white"
                  : "bg-(--theme-surface) text-(--theme-text-muted) hover:text-(--theme-text) border border-(--theme-border)"
              }`}
            >
              Awaiting Moderation ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("approved")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "approved"
                  ? "bg-emerald-600 text-white"
                  : "bg-(--theme-surface) text-(--theme-text-muted) hover:text-(--theme-text) border border-(--theme-border)"
              }`}
            >
              Approved ({approvedCount})
            </button>
          </div>

          <div className="text-xs text-(--theme-text-muted)">
            {userEmail && <span className="font-mono">{userEmail}</span>}
          </div>
        </div>
      )}

      {/* Feedback Items List */}
      {filteredItems.length > 0 ? (
        <div className="space-y-4">
          {filteredItems.map((item, index) => (
            <FeedbackCard
              key={item.id || `${item.created_at}-${index}`}
              review={item as Review}
            />
          ))}
        </div>
      ) : synced && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-(--theme-border) bg-(--theme-surface) p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-(--theme-accent-soft) text-(--theme-accent)">
            ✍
          </div>
          <h3 className="mt-4 text-lg font-semibold text-(--theme-text)">
            No feedback submitted yet
          </h3>
          <p className="mt-2 text-sm text-(--theme-text-muted) max-w-md mx-auto leading-relaxed">
            Have a suggestion, found an issue, or want to share your impressions? Your feedback directly guides what we build next.
          </p>
          <div className="mt-6">
            <Link href="/feedback" className="button-primary text-xs">
              Leave a Review →
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-(--theme-border) bg-(--theme-surface) p-8 text-center text-xs text-(--theme-text-muted)">
          No submissions found for the selected filter.
        </div>
      )}
    </div>
  );
}
