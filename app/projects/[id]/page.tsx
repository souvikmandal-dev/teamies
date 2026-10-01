"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { TeamiesLogo } from "@/components/teamies-logo";

import { ApplicationTimeline } from "@/components/application-timeline";
import { LoadError } from "@/components/load-error";
import { LogoutButton } from "@/components/logout-button";
import { SocialLinks } from "@/components/social-links";
import { ProjectManageModal } from "@/components/project-manage-modal";
import { ReportModal } from "@/components/report-modal";
import { isValidSocialUrl } from "@/lib/social-urls";
import { enforceRateLimit } from "@/app/actions/mutations";
import { leaveProjectAction } from "@/app/actions/project-management";
import { formatRelativeActivity, isProjectStale } from "@/lib/time";
import { getResponsivenessLabel } from "@/lib/responsiveness";
import { supabase } from "@/lib/supabase/client";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import { humanize } from "@/lib/humanize";

type Project = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string | null;
  category: string;
  project_type: string;
  stage: string;
  collaboration_type: string;
  city: string | null;
  duration: string | null;
  weekly_commitment: number | null;
  max_team_size: number;
  goal: string | null;
  status: string;
  created_at: string;
  last_activity_at?: string | null;
  recruiting_status?: string | null;
  team_link?: string | null;
  next_steps?: string | null;
  archived_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  primary_role: string | null;
  skills: string[] | null;
  portfolio_url?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
};

type ProjectRole = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  required_skills: string[] | null;
  experience_level: string | null;
  positions: number;
  weekly_commitment: number | null;
  status: string;
  created_at: string;
};

type ProjectMember = {
  id: string;
  project_id: string;
  profile_id: string;
  project_role_id: string | null;
  membership_status: string;
  joined_at: string;
};

type JoinRequest = {
  id: string;
  project_id: string;
  applicant_id: string;
  project_role_id: string;
  message: string | null;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  created_at: string;
  responded_at: string | null;
  status_updated_at?: string | null;
};

const inputClassName =
  "h-10 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm text-[var(--theme-text)] outline-none transition focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function friendlyRequestError(message: string) {
  const normalized = message.toLocaleLowerCase();

  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "You already have an application for this project.";
  }
  if (normalized.includes("maximum team size") || normalized.includes("project has reached")) {
    return "This project has reached its maximum team size.";
  }
  if (normalized.includes("no available positions") || normalized.includes("role is no longer open")) {
    return "This role is already full or no longer open.";
  }
  if (normalized.includes("not accepting") || normalized.includes("no longer accepting")) {
    return "This project is not accepting applications right now.";
  }
  if (normalized.includes("active project member") || normalized.includes("membership relationship")) {
    return "You already belong to this project.";
  }
  if (normalized.includes("owner")) {
    return "Project owners cannot apply to their own project.";
  }

  return "We couldn't complete that action. Please refresh and try again.";
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [ownerResponsiveness, setOwnerResponsiveness] = useState<string>("");
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRequest, setCurrentRequest] = useState<JoinRequest | null>(null);
  const [ownerRequests, setOwnerRequests] = useState<JoinRequest[]>([]);
  const [requestProfiles, setRequestProfiles] = useState<Record<string, Profile>>({});
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMissing, setIsMissing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [activeAction, setActiveAction] = useState("");

  // Modals & UI Controls
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const loadProject = useCallback(
    async (showLoading = true) => {
      if (!projectId) {
        setIsMissing(true);
        setIsLoading(false);
        return;
      }

      if (showLoading) {
        setIsLoading(true);
      }

      setPageError("");
      setIsMissing(false);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const userId = user?.id ?? null;
        setCurrentUserId(userId);

        const isUuid =
          typeof projectId === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            projectId,
          );
        const queryField = isUuid ? "id" : "slug";

        // Try primary query with all extended columns
        let { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select(
            "id, owner_id, name, slug, short_description, description, category, project_type, stage, collaboration_type, city, duration, weekly_commitment, max_team_size, goal, status, created_at, last_activity_at, recruiting_status, archived_at, completed_at, cancelled_at",
          )
          .eq(queryField, projectId)
          .maybeSingle();

        // If any extended column is missing (e.g. archived_at, completed_at), fallback to intermediate schema
        if (projectError) {
          const fallback = await supabase
            .from("projects")
            .select(
              "id, owner_id, name, slug, short_description, description, category, project_type, stage, collaboration_type, city, duration, weekly_commitment, max_team_size, goal, status, created_at, last_activity_at, recruiting_status",
            )
            .eq(queryField, projectId)
            .maybeSingle();

          if (!fallback.error) {
            projectData = fallback.data as typeof projectData;
            projectError = null;
          }
        }

        // Guaranteed baseline fallback with core columns that always exist in PostgreSQL
        if (projectError) {
          const baseFallback = await supabase
            .from("projects")
            .select(
              "id, owner_id, name, slug, short_description, description, category, project_type, stage, collaboration_type, city, duration, weekly_commitment, max_team_size, goal, status, created_at",
            )
            .eq(queryField, projectId)
            .maybeSingle();

          projectData = baseFallback.data as typeof projectData;
          projectError = baseFallback.error;
        }

        if (projectError) {
          setPageError("We couldn't load this project. Please try again.");
          return;
        }

        if (!projectData) {
          setIsMissing(true);
          setProject(null);
          return;
        }

        const loadedProject = projectData as Project;
        if (userId) {
          const { data: handoff } = await supabase.from("project_handoffs")
            .select("team_link, next_steps").eq("project_id", loadedProject.id).maybeSingle();
          if (handoff) Object.assign(loadedProject, handoff);
        }
        const ownerPromise = (async () => {
          let res = await supabase
            .from("profiles")
            .select(
              "id, username, full_name, bio, primary_role, skills, portfolio_url, github_url, linkedin_url, instagram_url",
            )
            .eq("id", loadedProject.owner_id)
            .maybeSingle();

          if (res.error && isMissingColumnError(res.error, "instagram_url")) {
            res = await supabase
              .from("profiles")
              .select(
                "id, username, full_name, bio, primary_role, skills, portfolio_url, github_url, linkedin_url",
              )
              .eq("id", loadedProject.owner_id)
              .maybeSingle();
          }

          if (res.error) {
            res = await supabase
              .from("profiles")
              .select("id, username, full_name, bio, primary_role, skills")
              .eq("id", loadedProject.owner_id)
              .maybeSingle();
          }
          return res;
        })();

        const [ownerResult, rolesResult, membersResult] = await Promise.all([
          ownerPromise,
          supabase
            .from("project_roles")
            .select(
              "id, project_id, title, description, required_skills, experience_level, positions, weekly_commitment, status, created_at",
            )
            .eq("project_id", loadedProject.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("project_members")
            .select(
              "id, project_id, profile_id, project_role_id, membership_status, joined_at",
            )
            .eq("project_id", loadedProject.id)
            .eq("membership_status", "active")
            .order("joined_at", { ascending: true }),
        ]);

        if (ownerResult.error || rolesResult.error || membersResult.error) {
          setPageError("We couldn't load all project details. Please try again.");
          return;
        }

        const loadedRoles = (rolesResult.data ?? []) as ProjectRole[];
        const loadedMembers = (membersResult.data ?? []) as ProjectMember[];
        setProject(loadedProject);
        setOwner((ownerResult.data as Profile | null) ?? null);
        setRoles(loadedRoles);
        setMembers(loadedMembers);

        try {
          const { data: respData } = await supabase
            .from("owner_responsiveness")
            .select("decided_count, avg_response_seconds")
            .eq("owner_id", loadedProject.owner_id)
            .maybeSingle();
          if (respData) {
            setOwnerResponsiveness(
              getResponsivenessLabel(respData.avg_response_seconds, respData.decided_count),
            );
          } else {
            setOwnerResponsiveness("New owner — no response history yet");
          }
        } catch {
          setOwnerResponsiveness("New owner — no response history yet");
        }

        const memberIds = [...new Set(loadedMembers.map((member) => member.profile_id))];
        let memberProfiles: Profile[] = [];

        if (memberIds.length > 0) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, username, full_name, bio, primary_role, skills")
            .in("id", memberIds);

          if (error) {
            setPageError("We couldn't load the project team. Please try again.");
            return;
          }

          memberProfiles = (data ?? []) as Profile[];
        }

        setProfiles(
          Object.fromEntries(memberProfiles.map((profile) => [profile.id, profile])),
        );

        const availableRole = loadedRoles.find((role) => {
          const occupancy = loadedMembers.filter(
            (member) => member.project_role_id === role.id,
          ).length;
          return role.status === "open" && occupancy < role.positions;
        });
        setSelectedRoleId((current) =>
          loadedRoles.some((role) => role.id === current)
            ? current
            : availableRole?.id ?? "",
        );

        setCurrentRequest(null);
        setOwnerRequests([]);
        setRequestProfiles({});

        if (userId === loadedProject.owner_id) {
          let { data: requestData, error: requestError } = await supabase
            .from("join_requests")
            .select(
              "id, project_id, applicant_id, project_role_id, message, status, created_at, responded_at, status_updated_at",
            )
            .eq("project_id", loadedProject.id)
            .order("created_at", { ascending: false });

          if (requestError && isMissingColumnError(requestError, "status_updated_at")) {
            const fallback = await supabase
              .from("join_requests")
              .select(
                "id, project_id, applicant_id, project_role_id, message, status, created_at, responded_at",
              )
              .eq("project_id", loadedProject.id)
              .order("created_at", { ascending: false });
            requestData = fallback.data as typeof requestData;
            requestError = fallback.error;
          }

          if (requestError) {
            setPageError("We couldn't load project applications. Please try again.");
            return;
          }

          const requests = (requestData ?? []) as JoinRequest[];
          setOwnerRequests(requests);
          const applicantIds = [...new Set(requests.map((request) => request.applicant_id))];

          if (applicantIds.length > 0) {
            const { data, error } = await supabase
              .from("profiles")
              .select("id, username, full_name, bio, primary_role, skills")
              .in("id", applicantIds);

            if (error) {
              setPageError("We couldn't load applicant profiles. Please try again.");
              return;
            }

            const applicantProfiles = (data ?? []) as Profile[];
            setRequestProfiles(
              Object.fromEntries(
                applicantProfiles.map((profile) => [profile.id, profile]),
              ),
            );
          }
        } else if (userId) {
          let { data, error } = await supabase
            .from("join_requests")
            .select(
              "id, project_id, applicant_id, project_role_id, message, status, created_at, responded_at, status_updated_at",
            )
            .eq("project_id", loadedProject.id)
            .eq("applicant_id", userId)
            .maybeSingle();

          if (error && isMissingColumnError(error, "status_updated_at")) {
            const fallback = await supabase
              .from("join_requests")
              .select(
                "id, project_id, applicant_id, project_role_id, message, status, created_at, responded_at",
              )
              .eq("project_id", loadedProject.id)
              .eq("applicant_id", userId)
              .maybeSingle();
            data = fallback.data as typeof data;
            error = fallback.error;
          }

          if (error) {
            setPageError("We couldn't check your application status. Please try again.");
            return;
          }

          setCurrentRequest((data as JoinRequest | null) ?? null);
        }
      } catch {
        setPageError("We couldn't load this project. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const roleById = useMemo(
    () => Object.fromEntries(roles.map((role) => [role.id, role])),
    [roles],
  );

  const occupancyByRole = useMemo(() => {
    const occupancy: Record<string, number> = {};

    members.forEach((member) => {
      if (member.project_role_id) {
        occupancy[member.project_role_id] =
          (occupancy[member.project_role_id] ?? 0) + 1;
      }
    });

    return occupancy;
  }, [members]);

  const availableRoles = roles.filter(
    (role) =>
      role.status === "open" &&
      (occupancyByRole[role.id] ?? 0) < role.positions,
  );

  const isOwner = Boolean(project && currentUserId === project.owner_id);
  const isActiveMember = members.some(
    (member) => member.profile_id === currentUserId,
  );
  const projectIsFull = Boolean(
    project && members.length + 1 >= project.max_team_size,
  );

  // Lifecycle & Recruiting Status derivation
  const isProjectActive = project?.status === "open" || project?.status === "active";
  const recruitingState = projectIsFull
    ? "full"
    : project?.recruiting_status === "paused"
      ? "paused"
      : !isProjectActive || project?.recruiting_status === "closed"
        ? "closed"
        : "open";

  const isStale = isProjectStale(
    project?.last_activity_at ?? project?.created_at,
    availableRoles.length > 0,
    project?.status ?? "open",
    project?.recruiting_status ?? "open",
  );

  async function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeAction) return;
    setActionError("");
    setActionNotice("");

    if (!project || !selectedRoleId) {
      setActionError("Choose an available role before applying.");
      return;
    }

    const rateLimitResult = await enforceRateLimit("application_create");
    if (!rateLimitResult.success) {
      setActionError(rateLimitResult.error || "You're doing that too fast — try again in a few minutes.");
      return;
    }

    setActiveAction("apply");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push(`/login?next=/projects/${project.id}`);
        return;
      }

      const { error } = await supabase.from("join_requests").insert({
        project_id: project.id,
        applicant_id: user.id,
        project_role_id: selectedRoleId,
        message: message.trim() || null,
      });

      if (error) {
        setActionError(friendlyRequestError(error.message));
        return;
      }

      setMessage("");
      setActionNotice("Your application was sent to the project owner.");
      await loadProject(false);
    } catch {
      setActionError("We couldn't submit your application. Please try again.");
    } finally {
      setActiveAction("");
    }
  }

  async function handleWithdraw() {
    if (!currentRequest || currentRequest.status !== "pending") {
      return;
    }

    setActionError("");
    setActionNotice("");
    setActiveAction(`withdraw-${currentRequest.id}`);

    try {
      const { error } = await supabase.from("join_requests")
        .update({ status: "withdrawn" }).eq("id", currentRequest.id);
      if (error) {
        setActionError(friendlyRequestError(error.message));
      } else {
        setActionNotice("Your application was withdrawn.");
        await loadProject(false);
      }
    } catch {
      setActionError("We couldn't withdraw your application. Please try again.");
    } finally {
      setActiveAction("");
    }
  }

  async function handleOwnerDecision(request: JoinRequest, decision: "accepted" | "rejected") {
    if (activeAction) return;
    setActionError("");
    setActionNotice("");
    setActiveAction(`${decision}-${request.id}`);
    try {
      const { error } = await supabase.from("join_requests")
        .update({ status: decision }).eq("id", request.id);
      if (error) {
        setActionError(friendlyRequestError(error.message));
      } else {
        setActionNotice(decision === "accepted"
          ? "Application accepted. The builder is now on the team."
          : "Application rejected.");
        await loadProject(false);
      }
    } catch {
      setActionError("We couldn't update this application. Please try again.");
    } finally {
      setActiveAction("");
    }
  }

  async function handleLeaveProject() {
    if (!project) return;
    setActiveAction("leave-project");
    setActionError("");
    setActionNotice("");

    const res = await leaveProjectAction(project.id);
    setActiveAction("");
    setIsLeaveConfirmOpen(false);

    if (!res.success) {
      setActionError(res.error || "Failed to leave project.");
    } else {
      setActionNotice("You have left the project team.");
      await loadProject(false);
    }
  }

  async function handleShareProject() {
    if (!project) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: project.name,
          text: project.short_description,
          url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      setActionError("Unable to copy project link.");
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--theme-bg)] px-5 text-[var(--theme-text)]">
        <p className="font-mono text-xs text-[var(--theme-text-muted)]" role="status">
          Loading project...
        </p>
      </main>
    );
  }

  if (pageError) {
    return <LoadError message={pageError} onRetry={() => void loadProject()} href="/discover/projects" linkLabel="Explore projects" />;
  }

  if (isMissing || !project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--theme-bg)] px-5 text-[var(--theme-text)]">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">
            Project not found
          </p>
          <h1 className="mt-3 font-sans text-3xl font-bold tracking-[-0.04em]">
            This project is unavailable.
          </h1>
          <Link
            href="/discover/projects"
            className="mt-7 button-primary"
          >
            Explore projects
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <header className="border-b border-[var(--theme-border)] bg-[var(--theme-bg)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] rounded-lg"
            aria-label="Teamies"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <nav className="ml-auto flex flex-wrap items-center gap-4 text-sm font-medium" aria-label="Project navigation">
            <Link href="/discover/projects" className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
              Discover
            </Link>
            {currentUserId ? (
              <>
                <Link href="/dashboard" className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
                  Dashboard
                </Link>
                <LogoutButton className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] disabled:opacity-50" />
              </>
            ) : (
              <Link href="/login" className="button-primary">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12 lg:px-10">
        {pageError ? (
          <div className="mb-6 rounded-md border border-[var(--theme-warn)] bg-[var(--theme-warn-soft)] px-4 py-3 text-sm text-[var(--theme-warn)]" role="alert">
            {pageError}
          </div>
        ) : null}

        {/* Project Header Banner */}
        <section className={`rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8 ${
          isStale ? "status-rail-stale" : "status-rail-active"
        }`}>
          {/* Status Row: Category / Lifecycle / Recruiting / Relative Activity */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--theme-text-muted)]">
              <span className="chip-tag text-[11px]">{project.category}</span>
              <span aria-hidden="true">·</span>
              <span>{humanize(project.project_type)}</span>
              <span aria-hidden="true">·</span>

              {/* Explicit Lifecycle Status */}
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                isProjectActive
                  ? "bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]"
                  : project.status === "completed"
                    ? "bg-[var(--theme-tag-soft)] text-[var(--theme-tag)]"
                    : "bg-[var(--theme-warn-soft)] text-[var(--theme-warn)]"
              }`}>
                {humanize(project.status)}
              </span>

              {/* Explicit Recruiting Status */}
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                recruitingState === "open"
                  ? "bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]"
                  : recruitingState === "paused"
                    ? "bg-[var(--theme-warn-soft)] text-[var(--theme-warn)]"
                    : "bg-[var(--theme-bg)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]"
              }`}>
                {recruitingState === "open"
                  ? "● Recruiting"
                  : recruitingState === "paused"
                    ? "Recruiting paused"
                    : recruitingState === "full"
                      ? "Team full"
                      : "Applications closed"}
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              {isStale ? (
                <>
                  <span className="badge-stale">Stale</span>
                  <span className="text-[var(--theme-text-muted)]">
                    {formatRelativeActivity(project.last_activity_at ?? project.created_at)}
                  </span>
                </>
              ) : (
                <span className="badge-active">
                  {formatRelativeActivity(project.last_activity_at ?? project.created_at)}
                </span>
              )}

              {/* Share Button */}
              <button
                type="button"
                onClick={handleShareProject}
                className="action-link-secondary !py-1 !px-2.5 text-xs font-sans shrink-0 ml-1"
                title="Share project link"
              >
                {copiedShare ? "✓ Copied" : "Share"}
              </button>
            </div>
          </div>

          <h1 className="mt-4 max-w-4xl text-balance font-sans text-3xl font-bold tracking-[-0.035em] sm:text-5xl text-[var(--theme-text)]">
            {project.name}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--theme-text-muted)]">
            {project.short_description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="chip-tag font-mono">
              {humanize(project.stage)} stage
            </span>
            <span className="chip-tag font-mono">
              {humanize(project.collaboration_type)}
              {project.city ? ` · ${project.city}` : ""}
            </span>
            {project.weekly_commitment !== null ? (
              <span className="chip-tag font-mono">
                {project.weekly_commitment} hrs/wk
              </span>
            ) : null}
            <span className="chip-tag font-mono">
              Team: {members.length + 1} / {project.max_team_size}
            </span>
          </div>

          {/* Action Row */}
          <div className="mt-6 pt-5 border-t border-dashed border-[var(--theme-border)] flex flex-wrap items-center gap-3">
            {isOwner ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsManageOpen(true)}
                  className="button-primary"
                >
                  Manage project
                </button>
                <a href="#applications" className="button-secondary">
                  Applications ({ownerRequests.filter((r) => r.status === "pending").length})
                </a>
              </>
            ) : isActiveMember ? (
              <>
                <a href="#team-workspace" className="button-primary">
                  Team workspace
                </a>
                <button
                  type="button"
                  onClick={() => setIsLeaveConfirmOpen(true)}
                  className="button-secondary text-[var(--theme-warn)]"
                >
                  Leave team
                </button>
              </>
            ) : currentRequest ? (
              <a href="#join-project" className="button-secondary">
                View my application
              </a>
            ) : (
              <a href="#join-project" className="button-primary">
                {recruitingState === "open" ? "Apply to join" : "View recruitment status"}
              </a>
            )}
          </div>
        </section>

        {/* POST-ACCEPTANCE HANDOFF CARD: Visible ONLY to Owner & Active Members */}
        {(isOwner || isActiveMember) && (
          <section id="team-workspace" className="mt-6 rounded-lg border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] p-5 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-accent)]">
                  {isOwner ? "Owner & Team Workspace" : "You're on the team"}
                </p>
                <h2 className="mt-1 font-sans text-xl font-bold tracking-tight text-[var(--theme-text)]">
                  Team Workspace & Next Steps
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--theme-text-muted)] max-w-2xl">
                  {project.next_steps || "Join the team communication channel below and coordinate with your teammates."}
                </p>
              </div>

              <div className="shrink-0 flex flex-wrap gap-2">
                {project.team_link && isValidSocialUrl(project.team_link) ? (
                  <a
                    href={project.team_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-primary !bg-[var(--theme-accent)] !text-white text-xs"
                  >
                    Open team link ↗
                  </a>
                ) : isOwner ? (
                  <button
                    type="button"
                    onClick={() => setIsManageOpen(true)}
                    className="action-link-secondary text-xs"
                  >
                    + Add team link
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
          <div className="space-y-6">
            <section className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7">
              <h2 className="font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]">About the project</h2>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--theme-text-muted)]">
                {project.description || "The owner hasn't added a full description yet."}
              </p>
              {project.goal ? (
                <div className="mt-6 border-t border-dashed border-[var(--theme-border)] pt-5">
                  <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Goal</h3>
                  <p className="mt-2 leading-7 text-[var(--theme-text)]">{project.goal}</p>
                </div>
              ) : null}
              <dl className="mt-6 grid gap-4 border-t border-dashed border-[var(--theme-border)] pt-5 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Duration</dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--theme-text)]">{project.duration || "Flexible"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Team capacity</dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--theme-text)] font-mono">{members.length + 1} of {project.max_team_size}</dd>
                </div>
              </dl>
            </section>

            {/* Roles Section */}
            <section className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Open opportunities</p>
                  <h2 className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]">Roles this project needs</h2>
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setIsManageOpen(true)}
                    className="action-link-secondary text-xs"
                  >
                    Manage roles
                  </button>
                ) : null}
              </div>
              {roles.length > 0 ? (
                <div className="mt-5 space-y-3.5">
                  {roles.map((role) => {
                    const occupancy = occupancyByRole[role.id] ?? 0;
                    const remaining = Math.max(role.positions - occupancy, 0);
                    const isAvailable = role.status === "open" && remaining > 0;

                    return (
                      <article key={role.id} className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 sm:p-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-lg font-bold tracking-[-0.02em] text-[var(--theme-text)]">{role.title}</h3>
                            <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{humanize(role.experience_level)} experience</p>
                          </div>
                          <span className={isAvailable ? "badge-active font-mono" : "badge-stale font-mono"}>
                            {isAvailable ? `${remaining} ${remaining === 1 ? "spot" : "spots"} open` : humanize(role.status === "open" ? "filled" : role.status)}
                          </span>
                        </div>
                        {role.description ? <p className="mt-3 text-sm leading-6 text-[var(--theme-text-muted)]">{role.description}</p> : null}
                        {role.required_skills?.length ? (
                          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Skills needed for ${role.title}`}>
                            {role.required_skills.map((skill) => (
                              <span key={skill.toLowerCase()} className="chip-tag">{skill}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-[var(--theme-text-muted)]">No specific skills listed.</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-3 font-mono text-xs text-[var(--theme-text-muted)] border-t border-dashed border-[var(--theme-border)] pt-3">
                          <span>{occupancy} of {role.positions} positions filled</span>
                          {role.weekly_commitment !== null ? <span>{role.weekly_commitment} hrs/wk</span> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-5 rounded-md border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] p-5 text-sm text-[var(--theme-text-muted)]">
                  This project has no roles listed yet.
                </p>
              )}
            </section>

            {/* People Building This */}
            <section className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Current team</p>
                  <h2 className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]">People building this</h2>
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setIsManageOpen(true)}
                    className="action-link-secondary text-xs"
                  >
                    Manage team
                  </button>
                ) : null}
              </div>
              <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
                <article className="flex flex-col justify-between rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Project owner</p>
                    <h3 className="mt-2 text-base font-bold text-[var(--theme-text)]">{owner?.full_name || "Teamies builder"}</h3>
                    <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{owner?.primary_role || "Builder"}</p>
                    {owner?.username ? (
                      <Link href={`/profile/${encodeURIComponent(owner.username)}`} className="mt-3 inline-block action-link-secondary text-xs">@{owner.username}</Link>
                    ) : null}
                  </div>
                  <div className="mt-4 border-t border-dashed border-[var(--theme-border)] pt-3">
                    <SocialLinks
                      portfolioUrl={owner?.portfolio_url}
                      githubUrl={owner?.github_url}
                      linkedinUrl={owner?.linkedin_url}
                      instagramUrl={owner?.instagram_url}
                      compact
                    />
                  </div>
                </article>
                {members.map((member) => {
                  const profile = profiles[member.profile_id];
                  const assignedRole = member.project_role_id ? roleById[member.project_role_id] : null;

                  return (
                    <article key={member.id} className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
                      <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">{assignedRole?.title || "Project member"}</p>
                      <h3 className="mt-2 text-base font-bold text-[var(--theme-text)]">{profile?.full_name || "Teamies builder"}</h3>
                      <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{profile?.primary_role || "Builder"}</p>
                      {profile?.skills?.length ? <p className="mt-2 line-clamp-2 text-xs text-[var(--theme-text-muted)]">{profile.skills.slice(0, 4).join(" · ")}</p> : null}
                      {profile?.username ? (
                        <Link href={`/profile/${encodeURIComponent(profile.username)}`} className="mt-3 inline-block action-link-secondary text-xs">@{profile.username}</Link>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {members.length === 0 ? <p className="mt-4 text-xs text-[var(--theme-text-muted)]">The owner is assembling the first version of the team.</p> : null}
            </section>

            {/* Owner Applications Management */}
            {isOwner ? (
              <section id="applications" className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Owner workspace</p>
                <h2 className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]">Join requests</h2>
                {ownerRequests.length > 0 ? (
                  <div className="mt-5 space-y-3.5">
                    {ownerRequests.map((request) => {
                      const applicant = requestProfiles[request.applicant_id];
                      const requestedRole = roleById[request.project_role_id];

                      return (
                        <article key={request.id} className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="text-base font-bold text-[var(--theme-text)]">{applicant?.full_name || "Teamies builder"}</h3>
                              <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{applicant?.username ? `@${applicant.username} · ` : ""}{applicant?.primary_role || "Builder"}</p>
                              <p className="mt-1 text-xs font-medium text-[var(--theme-text)]">Applying for {requestedRole?.title || "Project role"}</p>
                            </div>
                            <span className="chip-tag font-mono">{humanize(request.status)}</span>
                          </div>
                          {applicant?.username ? <Link href={`/profile/${encodeURIComponent(applicant.username)}`} className="mt-2.5 inline-block action-link-secondary text-xs">View builder profile</Link> : null}
                          {applicant?.skills?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {applicant.skills.map((s) => (
                                <span key={s.toLowerCase()} className="chip-tag">{s}</span>
                              ))}
                            </div>
                          ) : null}
                          <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--theme-text)]">{request.message || "No application message provided."}</p>
                          <p className="mt-3 font-mono text-[11px] text-[var(--theme-text-muted)]">Applied {formatDate(request.created_at)}</p>
                          {request.status === "pending" ? (
                            <div className="mt-4 flex flex-wrap gap-2.5 pt-3 border-t border-dashed border-[var(--theme-border)]">
                              <button type="button" onClick={() => void handleOwnerDecision(request, "accepted")} disabled={Boolean(activeAction)} className="button-primary">{activeAction === `accepted-${request.id}` ? "Accepting..." : "Accept"}</button>
                              <button type="button" onClick={() => void handleOwnerDecision(request, "rejected")} disabled={Boolean(activeAction)} className="button-danger">{activeAction === `rejected-${request.id}` ? "Rejecting..." : "Reject"}</button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-5 rounded-md border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] p-5 text-sm text-[var(--theme-text-muted)]">No one has applied yet. Share the project with builders who might be a strong fit.</p>
                )}
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-6">
            <section className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-6">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Created by</p>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--theme-text)]">{owner?.full_name || "Teamies builder"}</h2>
                  <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{owner?.primary_role || "Builder"}</p>
                  {ownerResponsiveness ? (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded bg-[var(--theme-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--theme-text-muted)]">
                      <span>⚡</span>
                      <span>{ownerResponsiveness}</span>
                    </p>
                  ) : null}
                </div>
                {owner?.username ? (
                  <Link
                    href={`/profile/${encodeURIComponent(owner.username)}`}
                    className="action-link-secondary text-xs shrink-0"
                  >
                    View profile ↗
                  </Link>
                ) : null}
              </div>

              {/* Owner socials */}
              <div className="mt-4 border-t border-dashed border-[var(--theme-border)] pt-3">
                <SocialLinks
                  portfolioUrl={owner?.portfolio_url}
                  githubUrl={owner?.github_url}
                  linkedinUrl={owner?.linkedin_url}
                  instagramUrl={owner?.instagram_url}
                  compact
                />
              </div>

              <p className="mt-4 border-t border-dashed border-[var(--theme-border)] pt-3 font-mono text-[11px] text-[var(--theme-text-muted)]">Project created {formatDate(project.created_at)}</p>
            </section>

            {/* Application / Action Box */}
            <section id="join-project" className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-6">
              <h2 className="font-sans text-xl font-bold tracking-[-0.025em] text-[var(--theme-text)]">Join this project</h2>
              {isOwner ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-6 text-[var(--theme-text-muted)]">You own this project. Manage details, roles, and review applications.</p>
                  <button
                    type="button"
                    onClick={() => setIsManageOpen(true)}
                    className="button-primary w-full"
                  >
                    Manage project
                  </button>
                </div>
              ) : !currentUserId ? (
                <div className="mt-4">
                  <p className="text-sm leading-6 text-[var(--theme-text-muted)]">Sign in to choose a role and send the owner an application.</p>
                  <Link href={`/login?next=/projects/${project.id}`} className="button-primary mt-4 w-full">Sign in to apply</Link>
                </div>
              ) : isActiveMember ? (
                <div className="mt-3 space-y-3">
                  <p className="rounded-md bg-[var(--theme-accent-soft)] px-3.5 py-2.5 text-xs font-mono text-[var(--theme-accent)]">
                    You are an active member of this project team.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsLeaveConfirmOpen(true)}
                    className="button-secondary text-xs text-[var(--theme-warn)] w-full"
                  >
                    Leave team
                  </button>
                </div>
              ) : currentRequest ? (
                <div className="mt-4 space-y-4">
                  <ApplicationTimeline
                    status={currentRequest.status}
                    createdAt={currentRequest.created_at}
                    statusUpdatedAt={currentRequest.status_updated_at ?? currentRequest.responded_at}
                  />
                  <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 text-xs text-[var(--theme-text-muted)]">
                    <p className="font-medium text-[var(--theme-text)]">Applied Role: {roleById[currentRequest.project_role_id]?.title || "Project role"}</p>
                    {currentRequest.message ? (
                      <p className="mt-1 italic line-clamp-2">&ldquo;{currentRequest.message}&rdquo;</p>
                    ) : null}
                  </div>
                  {currentRequest.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => void handleWithdraw()}
                      disabled={Boolean(activeAction)}
                      className="button-secondary w-full"
                    >
                      {activeAction === `withdraw-${currentRequest.id}` ? "Withdrawing..." : "Withdraw application"}
                    </button>
                  ) : null}
                </div>
              ) : !isProjectActive ? (
                <p className="mt-3 text-sm leading-6 text-[var(--theme-text-muted)]">
                  This project is currently marked as <span className="font-semibold uppercase">{project.status}</span> and is not accepting applications.
                </p>
              ) : recruitingState === "paused" ? (
                <div className="mt-3 p-3 rounded bg-[var(--theme-warn-soft)] text-xs text-[var(--theme-warn)]">
                  Recruiting is temporarily paused by the owner. Check back soon.
                </div>
              ) : projectIsFull ? (
                <p className="mt-3 text-sm leading-6 text-[var(--theme-text-muted)]">This project has reached its maximum team size.</p>
              ) : availableRoles.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-[var(--theme-text-muted)]">There are no open role positions right now.</p>
              ) : (
                <form onSubmit={handleApply} className="mt-4 space-y-3.5">
                  <div>
                    <label htmlFor="application-role" className="mb-1.5 block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)]">Role</label>
                    <select id="application-role" required value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)} className={inputClassName}>
                      {availableRoles.map((role) => <option key={role.id} value={role.id}>{role.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="application-message" className="mb-1.5 block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)]">Message <span className="font-normal">(optional)</span></label>
                    <textarea id="application-message" rows={4} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full resize-y rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]" placeholder="Share why you're a good fit and how much time you can commit." />
                    <p className="mt-1 text-right font-mono text-[11px] text-[var(--theme-text-muted)]">{message.length}/1,000</p>
                  </div>
                  <button type="submit" disabled={Boolean(activeAction)} className="button-primary w-full">{activeAction === "apply" ? "Sending application..." : "Apply for this role"} </button>
                </form>
              )}
            </section>

            {actionError ? <p className="rounded-md border border-[var(--theme-warn)] bg-[var(--theme-warn-soft)] px-3.5 py-2.5 text-xs text-[var(--theme-warn)]" role="alert">{actionError}</p> : null}
            {actionNotice ? <p className="rounded-md border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] px-3.5 py-2.5 text-xs text-[var(--theme-accent)]" role="status">{actionNotice}</p> : null}

            {/* Safety & Report Link */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setIsReportOpen(true)}
                className="text-[11px] font-mono text-[var(--theme-text-muted)] hover:text-[var(--theme-warn)] transition"
              >
                ⚑ Report this project
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* Owner Management Modal */}
      {project && (
        <ProjectManageModal
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          project={project}
          roles={roles}
          members={members}
          profiles={profiles}
          occupancyByRole={occupancyByRole}
          onProjectUpdated={async () => {
            await loadProject(false);
          }}
        />
      )}

      {/* Member Leave Confirmation Modal */}
      {isLeaveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 shadow-xl">
            <h3 className="font-sans font-bold text-lg text-[var(--theme-text)]">
              Leave {project.name}?
            </h3>
            <p className="mt-2 text-sm text-[var(--theme-text-muted)]">
              You will no longer be an active member of this project team, and your seat will reopen for other builders.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLeaveConfirmOpen(false)}
                className="button-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleLeaveProject()}
                disabled={Boolean(activeAction)}
                className="button-danger text-xs"
              >
                {activeAction === "leave-project" ? "Leaving..." : "Yes, leave team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {project && (
        <ReportModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          targetType="project"
          targetId={project.id}
          targetName={project.name}
        />
      )}
    </main>
  );
}
