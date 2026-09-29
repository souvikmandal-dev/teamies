export const feedbackTypes = {
  general: "General feedback", bug: "Bug", feature: "Feature request", ux: "UI / UX",
  performance: "Performance", idea: "Idea", other: "Other",
} as const;
export const feedbackStatuses = ["pending", "approved", "rejected", "resolved"] as const;
export type FeedbackInput = {
  requestId: string; type: keyof typeof feedbackTypes; rating: number; title: string;
  message: string; context: string; isPublic: boolean; isAnonymous: boolean;
};
export function pageContext(path: string): string {
  const clean = path.split(/[?#]/)[0];
  if (["/", "/dashboard", "/discover/projects", "/discover/builders", "/projects/new", "/settings/profile", "/onboarding", "/feedback"].includes(clean)) return clean;
  if (clean.startsWith("/projects/")) return "/projects/[id]";
  if (clean.startsWith("/profile/")) return "/profile/[username]";
  return "/other";
}
export function validFeedback(value: unknown): value is FeedbackInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as FeedbackInput;
  return typeof v.requestId === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.requestId)
    && typeof v.type === "string" && Object.hasOwn(feedbackTypes, v.type)
    && Number.isInteger(v.rating) && v.rating >= 1 && v.rating <= 5
    && typeof v.title === "string" && v.title.trim().length >= 3 && v.title.length <= 120
    && typeof v.message === "string" && v.message.trim().length >= 10 && v.message.length <= 4000
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.title + v.message)
    && typeof v.context === "string" && v.context.length <= 200
    && typeof v.isPublic === "boolean" && typeof v.isAnonymous === "boolean";
}
