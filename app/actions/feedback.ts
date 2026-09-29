"use server";

import { createClient } from "@/lib/supabase/server";
import { feedbackStatuses, pageContext, validFeedback } from "@/lib/feedback/validation";
import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/validation";

export async function submitFeedback(input: unknown) {
  if (!validFeedback(input)) return { error: "Choose a rating and category, a title of 3–120 characters, and feedback of 10–4,000 characters." };
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: "Please sign in to send feedback.", signIn: true };
    const { error } = await db.rpc("submit_feedback", {
      p_request_id: input.requestId, p_type: input.type, p_rating: input.rating,
      p_title: input.title.trim(), p_message: input.message.trim(), p_context: pageContext(input.context),
      p_public: input.isPublic, p_anonymous: input.isAnonymous,
    });
    if (error) {
      console.error("[feedback] submit failed", { code: error.code });
      return { error: error.code === "P0001" ? "You've sent five reports this hour. Please try again later." : "We couldn't save your feedback. Please try again." };
    }
    revalidatePath("/reviews");
    revalidatePath("/feedback");
    return { success: true };
  } catch {
    console.error("[feedback] submit unavailable");
    return { error: "Feedback is temporarily unavailable. Please try again." };
  }
}

export type MyFeedbackRecord = {
  id: string;
  feedback_type: string;
  rating: number;
  title: string;
  message: string;
  page_context?: string | null;
  is_public: boolean;
  is_anonymous: boolean;
  display_name: string;
  status: string;
  created_at: string;
  updated_at?: string;
};

export async function getMyFeedback(): Promise<{
  authenticated: boolean;
  userEmail?: string;
  userId?: string;
  items: MyFeedbackRecord[];
  error?: string;
}> {
  try {
    const db = await createClient();
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user) {
      return { authenticated: false, items: [] };
    }

    // Try RPC get_my_feedback first (defined in migration 012)
    const { data: rpcData, error: rpcError } = await db.rpc("get_my_feedback");
    if (!rpcError && Array.isArray(rpcData)) {
      return {
        authenticated: true,
        userEmail: user.email,
        userId: user.id,
        items: rpcData as MyFeedbackRecord[],
      };
    }

    // Fallback: direct select (works if user has select permissions)
    const { data: directData, error: directError } = await db
      .from("feedback")
      .select("id,feedback_type,rating,title,message,page_context,is_public,is_anonymous,display_name,status,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (!directError && Array.isArray(directData)) {
      return {
        authenticated: true,
        userEmail: user.email,
        userId: user.id,
        items: directData as MyFeedbackRecord[],
      };
    }

    return {
      authenticated: true,
      userEmail: user.email,
      userId: user.id,
      items: [],
    };
  } catch (err) {
    console.error("[feedback] getMyFeedback error", err);
    return { authenticated: false, items: [], error: "Unable to load your feedback" };
  }
}

export async function moderateFeedback(id: string, status: string) {
  if (!isUuid(id) || !feedbackStatuses.includes(status as typeof feedbackStatuses[number])) return { error: "Invalid moderation request." };
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { error: "Sign in required." };
    const { data: admin, error: adminError } = await db.rpc("is_feedback_admin");
    if (adminError || !admin) return { error: "You don't have permission to moderate feedback." };
    const { error } = await db.rpc("moderate_feedback", { p_id: id, p_status: status });
    if (error) {
      console.error("[feedback] moderation failed", { code: error.code });
      return { error: "Unable to update this feedback. Only consented feedback can be approved." };
    }
    revalidatePath("/feedback");
    revalidatePath("/reviews");
    revalidatePath("/admin/feedback");
    return { success: true };
  } catch {
    console.error("[feedback] moderation unavailable");
    return { error: "Moderation is temporarily unavailable. Please try again." };
  }
}
