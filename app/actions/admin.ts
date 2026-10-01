"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

export type AdminRemovalResult = { success: boolean; error?: string };

async function removeRecord(
  kind: "project" | "builder",
  id: string,
  confirmation: string,
): Promise<AdminRemovalResult> {
  if (!isUuid(id) || typeof confirmation !== "string" || !confirmation || confirmation.length > 100) {
    return { success: false, error: "Invalid removal request." };
  }

  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { success: false, error: "Please sign in to continue." };
    const { data: admin, error: adminError } = await db.rpc("is_platform_admin");
    if (adminError || admin !== true) {
      return { success: false, error: "Only admins can remove projects and builders." };
    }
    if (kind === "builder" && id === user.id) {
      return { success: false, error: "You cannot remove your own admin account." };
    }

    const { data, error } = kind === "project"
      ? await db.rpc("delete_project_confirmed", { p_project_id: id, p_confirmed_name: confirmation })
      : await db.rpc("delete_builder_confirmed", { p_builder_id: id, p_confirmed_identifier: confirmation });
    if (error) {
      console.error("[admin] removal failed", { kind, code: error.code });
      return {
        success: false,
        error: error.code === "42501"
          ? "Removal is not permitted. Admin accounts are protected."
          : "Unable to remove this item. Please try again later.",
      };
    }
    if (data !== true) {
      return { success: false, error: "The item changed or was already removed. Refresh and check your confirmation." };
    }
  } catch {
    return { success: false, error: "Removal is temporarily unavailable. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeProjectAsAdmin(id: string, confirmedName: string) {
  return removeRecord("project", id, confirmedName);
}

export async function removeBuilderAsAdmin(id: string, confirmedIdentifier: string) {
  return removeRecord("builder", id, confirmedIdentifier);
}
