"use server";

import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/app/actions/mutations";
import { isUuid, isRecord, validProjectInput, validRoleInput, boundedText, optionalText, integerIn, validSkills } from "@/lib/validation";
import { isValidSocialUrl } from "@/lib/social-urls";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Validates that the current user is authenticated and is the owner of the given project.
 */
async function verifyProjectOwner(projectId: string) {
  if (!isUuid(projectId)) {
    return { error: "Invalid project ID.", user: null, project: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be signed in to perform this action.", user: null, project: null };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, owner_id, name, status, max_team_size")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projectError || !project) {
    return { error: "Project not found.", user, project: null };
  }

  if (project.owner_id !== user.id) {
    return { error: "You do not have permission to manage this project.", user, project };
  }

  return { error: null, user, project, supabase };
}

/**
 * Update general project details (name, descriptions, stage, category, max_team_size, etc.)
 */
export async function updateProjectDetails(
  projectId: string,
  input: {
    name: string;
    short_description: string;
    description?: string | null;
    category: string;
    stage: string;
    collaboration_type: string;
    city?: string | null;
    duration?: string | null;
    weekly_commitment?: number | null;
    max_team_size: number;
  },
): Promise<ActionResult> {
  if (!validProjectInput(input)) return { success: false, error: "Invalid project details." };
  const rateLimitResult = await enforceRateLimit("project_manage");
  if (!rateLimitResult.success) {
    return { success: false, error: rateLimitResult.error };
  }

  const { error: authError, project, supabase } = await verifyProjectOwner(projectId);
  if (authError || !project || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  const name = input.name.trim();
  if (name.length < 3 || name.length > 100) {
    return { success: false, error: "Project name must be between 3 and 100 characters." };
  }

  const shortDesc = input.short_description.trim();
  if (shortDesc.length < 10 || shortDesc.length > 240) {
    return { success: false, error: "Short description must be between 10 and 240 characters." };
  }

  const description = input.description?.trim() || null;
  if (description && description.length > 10000) {
    return { success: false, error: "Full description must be under 10,000 characters." };
  }

  const category = input.category.trim();
  if (!boundedText(category, 2, 60)) {
    return { success: false, error: "Category must be between 2 and 60 characters." };
  }

  const allowedStages = ["idea", "planning", "building", "mvp", "launched"];
  if (!allowedStages.includes(input.stage)) {
    return { success: false, error: "Invalid project stage selected." };
  }

  const allowedCollab = ["remote", "local", "hybrid"];
  if (!allowedCollab.includes(input.collaboration_type)) {
    return { success: false, error: "Invalid collaboration type selected." };
  }

  if (!optionalText(input.city, 100)) {
    return { success: false, error: "City must be 100 characters or fewer." };
  }

  if (!optionalText(input.duration, 100)) {
    return { success: false, error: "Duration must be 100 characters or fewer." };
  }

  if (input.weekly_commitment != null && !integerIn(input.weekly_commitment, 0, 168)) {
    return { success: false, error: "Weekly commitment must be between 0 and 168 hours." };
  }

  const maxTeam = input.max_team_size;

  // Validate that new max_team_size is >= current active team members count + 1 (the owner)
  const { count: activeMembersCount, error: countError } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("membership_status", "active");

  if (!countError && activeMembersCount !== null) {
    if (maxTeam < activeMembersCount + 1) {
      return {
        success: false,
        error: `Maximum team size cannot be smaller than existing team size (${activeMembersCount + 1} including owner).`,
      };
    }
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    name,
    short_description: shortDesc,
    description,
    category: input.category.trim(),
    stage: input.stage,
    collaboration_type: input.collaboration_type,
    city: input.city?.trim() || null,
    duration: input.duration?.trim() || null,
    weekly_commitment: input.weekly_commitment ?? null,
    max_team_size: maxTeam,
    last_activity_at: now,
    updated_at: now,
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId);


  if (updateError) {
    return { success: false, error: "Failed to update project." };
  }

  return { success: true };
}

/**
 * Toggle recruitment status: 'open' | 'paused' | 'closed'
 */
export async function updateRecruitingStatus(
  projectId: string,
  recruitingStatus: "open" | "paused" | "closed",
): Promise<ActionResult> {
  if (!["open", "paused", "closed"].includes(recruitingStatus)) {
    return { success: false, error: "Invalid recruiting status." };
  }

  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, supabase } = await verifyProjectOwner(projectId);
  if (authError || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    recruiting_status: recruitingStatus,
    last_activity_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("projects")
    .update(payload)
    .eq("id", projectId);


  if (error) {
    return { success: false, error: "Failed to update recruitment status." };
  }

  return { success: true };
}

/**
 * Update project lifecycle: 'active' | 'completed' | 'cancelled' | 'archived'
 */
export async function updateProjectLifecycle(
  projectId: string,
  status: "active" | "completed" | "cancelled" | "archived",
): Promise<ActionResult> {
  if (!["active", "completed", "cancelled", "archived"].includes(status)) {
    return { success: false, error: "Invalid project status." };
  }

  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, project, supabase } = await verifyProjectOwner(projectId);
  if (authError || !project || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  const now = new Date().toISOString();
  const dbStatus = status === "active" ? "open" : status;

  const payload: Record<string, unknown> = {
    status: dbStatus,
    updated_at: now,
    last_activity_at: now,
  };

  if (status === "completed") {
    payload.completed_at = now;
    payload.recruiting_status = "closed";
  } else if (status === "cancelled") {
    payload.cancelled_at = now;
    payload.recruiting_status = "closed";
  } else if (status === "archived") {
    payload.archived_at = now;
    payload.recruiting_status = "closed";
  } else if (status === "active") {
    payload.completed_at = null;
    payload.cancelled_at = null;
    payload.archived_at = null;
    payload.recruiting_status = "open";
  }

  const { error } = await supabase
    .from("projects")
    .update(payload)
    .eq("id", projectId);


  if (error) {
    return { success: false, error: "Failed to update project status." };
  }

  return { success: true };
}

/**
 * Permanently delete project with deliberate confirmation (matching exact project name).
 */
export async function deleteProjectPermanently(
  projectId: string,
  confirmedName: string,
): Promise<ActionResult> {
  const rateCheck = await enforceRateLimit("project_delete");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, project, supabase } = await verifyProjectOwner(projectId);
  if (authError || !project || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  if (typeof confirmedName !== "string" || confirmedName !== project.name) {
    return { success: false, error: "Project name confirmation does not match." };
  }

  // Attempt atomic confirmed deletion via RPC first (migration 010)
  const { data: rpcSuccess, error: rpcError } = await supabase.rpc("delete_project_confirmed", {
    p_project_id: projectId,
    p_confirmed_name: confirmedName,
  });

  if (!rpcError && rpcSuccess === true) {
    return { success: true };
  }

  return { success: false, error: "Could not delete this project. Refresh and try again." };
}

/**
 * Add a new role to an existing project.
 */
export async function addProjectRole(
  projectId: string,
  input: {
    title: string;
    description?: string | null;
    required_skills?: string[];
    experience_level?: string | null;
    positions: number;
    weekly_commitment?: number | null;
  },
): Promise<ActionResult> {
  if (!validRoleInput(input)) return { success: false, error: "Invalid role details." };
  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, supabase } = await verifyProjectOwner(projectId);
  if (authError || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  const title = input.title.trim();
  if (title.length < 2 || title.length > 80) {
    return { success: false, error: "Role title must be between 2 and 80 characters." };
  }

  const description = input.description?.trim() || null;
  if (!optionalText(description, 2000)) {
    return { success: false, error: "Role description must be 2,000 characters or fewer." };
  }

  const positions = input.positions;
  const skills = (input.required_skills ?? []).map((s) => s.trim()).filter(Boolean);
  if (!validSkills(skills)) {
    return { success: false, error: "Skills must be up to 30 unique tags under 60 characters each." };
  }

  const allowedExp = ["any", "beginner", "intermediate", "advanced"];
  const expLevel = input.experience_level || "any";
  if (!allowedExp.includes(expLevel)) {
    return { success: false, error: "Invalid experience level." };
  }

  if (input.weekly_commitment != null && !integerIn(input.weekly_commitment, 0, 168)) {
    return { success: false, error: "Weekly commitment must be between 0 and 168 hours." };
  }

  const { error: insertError } = await supabase.from("project_roles").insert({
    project_id: projectId,
    title,
    description,
    required_skills: skills,
    experience_level: expLevel,
    positions,
    weekly_commitment: input.weekly_commitment ?? null,
    status: "open",
  });

  if (insertError) {
    return { success: false, error: "Failed to add role." };
  }

  // Touch last_activity_at
  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  return { success: true };
}

/**
 * Update an existing role (title, skills, positions, description).
 * Ensures seats cannot be decreased below currently active occupant count.
 */
export async function updateProjectRole(
  projectId: string,
  roleId: string,
  input: {
    title: string;
    description?: string | null;
    required_skills?: string[];
    experience_level?: string | null;
    positions: number;
    weekly_commitment?: number | null;
  },
): Promise<ActionResult> {
  if (!validRoleInput(input)) return { success: false, error: "Invalid role details." };
  if (!isUuid(roleId)) {
    return { success: false, error: "Invalid role ID." };
  }

  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, supabase } = await verifyProjectOwner(projectId);
  if (authError || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  const title = input.title.trim();
  if (title.length < 2 || title.length > 80) {
    return { success: false, error: "Role title must be between 2 and 80 characters." };
  }

  const description = input.description?.trim() || null;
  if (!optionalText(description, 2000)) {
    return { success: false, error: "Role description must be 2,000 characters or fewer." };
  }

  const positions = input.positions;

  // Check current occupants
  const { count: activeCount, error: countError } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("project_role_id", roleId)
    .eq("membership_status", "active");

  if (!countError && activeCount !== null) {
    if (positions < activeCount) {
      return {
        success: false,
        error: `Cannot decrease positions below current active member count (${activeCount}).`,
      };
    }
  }

  const skills = (input.required_skills ?? []).map((s) => s.trim()).filter(Boolean);
  if (!validSkills(skills)) {
    return { success: false, error: "Skills must be up to 30 unique tags under 60 characters each." };
  }

  const allowedExp = ["any", "beginner", "intermediate", "advanced"];
  const expLevel = input.experience_level || "any";
  if (!allowedExp.includes(expLevel)) {
    return { success: false, error: "Invalid experience level." };
  }

  if (input.weekly_commitment != null && !integerIn(input.weekly_commitment, 0, 168)) {
    return { success: false, error: "Weekly commitment must be between 0 and 168 hours." };
  }

  const { error: updateError } = await supabase
    .from("project_roles")
    .update({
      title,
      description,
      required_skills: skills,
      experience_level: expLevel,
      positions,
      weekly_commitment: input.weekly_commitment ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roleId)
    .eq("project_id", projectId);

  if (updateError) {
    return { success: false, error: "Failed to update role." };
  }

  // Touch last_activity_at
  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  return { success: true };
}

/**
 * Close or reopen an individual role.
 */
export async function toggleProjectRoleStatus(
  projectId: string,
  roleId: string,
  newStatus: "open" | "closed",
): Promise<ActionResult> {
  if (!isUuid(roleId)) {
    return { success: false, error: "Invalid role ID." };
  }

  if (!["open", "closed"].includes(newStatus)) {
    return { success: false, error: "Invalid role status." };
  }

  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, supabase } = await verifyProjectOwner(projectId);
  if (authError || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  const { error: updateError } = await supabase
    .from("project_roles")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roleId)
    .eq("project_id", projectId);

  if (updateError) {
    return { success: false, error: "Failed to update role status." };
  }

  // Touch last_activity_at
  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  return { success: true };
}

/**
 * Owner changes an active member's assigned role.
 * Atomically checks capacity and reassigns role.
 */
export async function changeMemberRoleAction(
  projectId: string,
  memberId: string,
  newRoleId: string,
): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(memberId) || !isUuid(newRoleId)) {
    return { success: false, error: "Invalid ID parameters." };
  }

  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, supabase } = await verifyProjectOwner(projectId);
  if (authError || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  // First try the atomic database RPC if available
  const { data: rpcData, error: rpcError } = await supabase.rpc("change_project_member_role", {
    p_project_id: projectId,
    p_member_id: memberId,
    p_new_role_id: newRoleId,
  });

  if (!rpcError && rpcData) {
    const res = rpcData as { success?: boolean; error?: string };
    if (!res.success) {
      return { success: false, error: "Could not reassign role." };
    }
    return { success: true };
  }

  return { success: false, error: "Could not complete this change. Refresh and try again." };
}

/**
 * Owner removes a team member from the project.
 */
export async function removeMemberAction(
  projectId: string,
  memberId: string,
): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(memberId)) {
    return { success: false, error: "Invalid ID parameters." };
  }

  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, supabase } = await verifyProjectOwner(projectId);
  if (authError || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  // Try RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc("remove_project_member", {
    p_project_id: projectId,
    p_member_id: memberId,
  });

  if (!rpcError && rpcData) {
    const res = rpcData as { success?: boolean; error?: string };
    if (!res.success) {
      return { success: false, error: "Could not remove member." };
    }
    return { success: true };
  }

  return { success: false, error: "Could not complete this change. Refresh and try again." };
}

/**
 * Active member voluntarily leaves a project team.
 */
export async function leaveProjectAction(projectId: string): Promise<ActionResult> {
  if (!isUuid(projectId)) {
    return { success: false, error: "Invalid project ID." };
  }

  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in to leave a project." };
  }

  // Try RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc("leave_project", {
    p_project_id: projectId,
  });

  if (!rpcError && rpcData) {
    const res = rpcData as { success?: boolean; error?: string };
    if (!res.success) {
      return { success: false, error: "Could not leave project." };
    }
    return { success: true };
  }

  return { success: false, error: "Could not complete this change. Refresh and try again." };
}

/**
 * Project owner updates post-acceptance team handoff instructions and link.
 */
export async function updateTeamHandoffAction(
  projectId: string,
  input: {
    team_link?: string | null;
    next_steps?: string | null;
  },
): Promise<ActionResult> {
  if (!isRecord(input) || !optionalText(input.team_link, 500) || !optionalText(input.next_steps, 2000)) return { success: false, error: "Invalid handoff details." };
  const rateCheck = await enforceRateLimit("project_manage");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const { error: authError, supabase } = await verifyProjectOwner(projectId);
  if (authError || !supabase) {
    return { success: false, error: authError || "Unauthorized" };
  }

  const teamLink = input.team_link?.trim() || null;
  const nextSteps = input.next_steps?.trim() || null;

  if (teamLink) {
    if (teamLink.length > 500) {
      return { success: false, error: "Team link must be under 500 characters." };
    }
    if (!isValidSocialUrl(teamLink)) {
      return { success: false, error: "Team link must be a valid http: or https: URL." };
    }
  }

  if (nextSteps && !optionalText(nextSteps, 2000)) {
    return { success: false, error: "Next steps instructions must be under 2,000 characters." };
  }

  const now = new Date().toISOString();

  // Primary path (migration 010): save to private project_handoffs table
  const handoffPayload = {
    project_id: projectId,
    team_link: teamLink,
    next_steps: nextSteps,
    updated_at: now,
  };

  const { error: handoffError } = await supabase
    .from("project_handoffs")
    .upsert(handoffPayload, { onConflict: "project_id" });

  if (!handoffError) {
    return { success: true };
  }

  return { success: false, error: "Could not save private team instructions. Please try again." };
}

/**
 * Report a project or builder profile for abuse / moderation safety.
 */
export async function submitReportAction(input: {
  targetType: "project" | "profile";
  targetId: string;
  reason: "spam" | "inappropriate" | "harassment" | "scam" | "other";
  details?: string;
}): Promise<ActionResult> {
  if (!isRecord(input)) return { success: false, error: "Invalid report details." };
  const allowedTypes = ["project", "profile"];
  if (!allowedTypes.includes(input.targetType)) {
    return { success: false, error: "Invalid report target type." };
  }

  const allowedReasons = ["spam", "inappropriate", "harassment", "scam", "other"];
  if (!allowedReasons.includes(input.reason)) {
    return { success: false, error: "Invalid report reason." };
  }

  if (!isUuid(input.targetId)) {
    return { success: false, error: "Invalid target ID." };
  }

  if (!optionalText(input.details, 2000)) {
    return { success: false, error: "Report details must be 2,000 characters or fewer." };
  }

  const rateCheck = await enforceRateLimit("report_create");
  if (!rateCheck.success) {
    return { success: false, error: rateCheck.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in to submit a report." };
  }

  const { error: insertError } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });

  if (insertError) {
    return { success: false, error: "Could not submit report. Please try again." };
  }

  return { success: true };
}

