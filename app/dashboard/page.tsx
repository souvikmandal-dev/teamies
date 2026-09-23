import { APP_NAME } from "@/lib/brand";
import { safeInternalPath } from "@/lib/safe-redirect";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TeamiesLogo } from "@/components/teamies-logo";

import { ApplicationTimeline } from "@/components/application-timeline";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import { formatRelativeActivity, isProjectStale } from "@/lib/time";

type ExperienceLevel = "beginner" | "intermediate" | "advanced";
type BuilderMode =
  | "have_something_to_build"
  | "want_something_to_build"
  | "both";

type Profile = {
  full_name: string | null;
  username: string | null;
  bio: string | null;
  college: string | null;
  city: string | null;
  primary_role: string | null;
  experience_level: ExperienceLevel | null;
  weekly_availability: number | null;
  portfolio_url: string | null;
  github_url: string | null;
  skills: string[] | null;
  interests: string[] | null;
  builder_mode: BuilderMode | null;
};

type ProjectSummary = {
  id: string;
  name: string;
  short_description: string;
  category: string;
  project_type: string;
  stage: string;
  collaboration_type: string;
  city: string | null;
  status: string;
  created_at: string;
  last_activity_at?: string | null;
  recruiting_status?: string | null;
  max_team_size?: number;
};

type JoinedMembership = {
  id: string;
  project_id: string;
  project_role_id: string | null;
  joined_at: string;
  role_title: string | null;
  project: ProjectSummary | null;
};

type PendingApplication = {
  id: string;
  project_id: string;
  project_role_id: string;
  message: string | null;
  status: string;
  created_at: string;
  status_updated_at?: string | null;
  role_title: string | null;
  project: ProjectSummary | null;
};

type Notification = {
  id: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const experienceLabels: Record<ExperienceLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const builderModeLabels: Record<BuilderMode, string> = {
  have_something_to_build: "I have something to build",
  want_something_to_build: "I want something to build",
  both: "I want to build and find collaborators",
};

function humanize(value: string | null) {
  if (value === "mvp") return "MVP";
  if (!value) return "";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

function getCompleteness(profile: Profile) {
  const fields = [
    hasText(profile.full_name),
    hasText(profile.username),
    hasText(profile.bio),
    hasText(profile.college),
    hasText(profile.city),
    hasText(profile.primary_role),
    hasText(profile.experience_level),
    profile.weekly_availability !== null,
    Boolean(profile.skills?.length),
    Boolean(profile.interests?.length),
    hasText(profile.portfolio_url) || hasText(profile.github_url),
  ];

  const completedFields = fields.filter(Boolean).length;
  const percentage = Math.round((completedFields / fields.length) * 100);

  let suggestion = "Your profile is looking strong.";

  if (!profile.skills?.length) {
    suggestion = "Add your skills so builders can find you more easily.";
  } else if (!hasText(profile.bio)) {
    suggestion =
      "Write a short bio so potential teammates understand what you like building.";
  } else if (
    !hasText(profile.portfolio_url) &&
    !hasText(profile.github_url)
  ) {
    suggestion = "Add a portfolio or GitHub link to show your work.";
  } else if (!profile.interests?.length) {
    suggestion = "Add your interests to surface projects that fit you.";
  } else if (!hasText(profile.college)) {
    suggestion = "Add your college or university to help builders know you.";
  } else if (!hasText(profile.city)) {
    suggestion = "Add your city to make local collaboration easier.";
  } else if (profile.weekly_availability === null) {
    suggestion = "Add your weekly availability to set clear expectations.";
  }

  return { percentage, suggestion };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select(
      "full_name, username, bio, college, city, primary_role, experience_level, weekly_availability, portfolio_url, github_url, skills, interests, builder_mode",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Unable to load your Teamies profile.");
  }

  if (!data) {
    redirect("/onboarding");
  }

  const profile = data as Profile;
  const onboardingIsIncomplete =
    !hasText(profile.username) ||
    !hasText(profile.full_name) ||
    !hasText(profile.primary_role) ||
    !hasText(profile.experience_level) ||
    !hasText(profile.builder_mode);

  if (onboardingIsIncomplete) {
    redirect("/onboarding");
  }

  // Load real projects owned, projects joined, pending applications, and notifications
  const ownedPromise = (async () => {
    let res = await supabase
      .from("projects")
      .select(
        "id, name, short_description, category, project_type, stage, collaboration_type, city, status, created_at, last_activity_at, recruiting_status, max_team_size",
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (res.error && (isMissingColumnError(res.error, "recruiting_status") || isMissingColumnError(res.error, "last_activity_at"))) {
      const fallback = await supabase
        .from("projects")
        .select(
          "id, name, short_description, category, project_type, stage, collaboration_type, city, status, created_at, max_team_size",
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      res = fallback as typeof res;
    }
    return res;
  })();

  const memberPromise = supabase
    .from("project_members")
    .select("id, project_id, project_role_id, membership_status, joined_at")
    .eq("profile_id", user.id)
    .eq("membership_status", "active")
    .order("joined_at", { ascending: false });

  const applicationPromise = (async () => {
    let res = await supabase
      .from("join_requests")
      .select("id, project_id, project_role_id, message, status, created_at, status_updated_at")
      .eq("applicant_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (res.error && isMissingColumnError(res.error, "status_updated_at")) {
      const fallback = await supabase
        .from("join_requests")
        .select("id, project_id, project_role_id, message, status, created_at")
        .eq("applicant_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      res = fallback as typeof res;
    }
    return res;
  })();

  const notificationsPromise = (async () => {
    try {
      const res = await supabase
        .from("notifications")
        .select("id, title, message, link, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return (res.data ?? []) as Notification[];
    } catch {
      return [] as Notification[];
    }
  })();

  const [ownedResult, memberResult, applicationResult, notifications] = await Promise.all([
    ownedPromise,
    memberPromise,
    applicationPromise,
    notificationsPromise,
  ]);

  const ownedProjects = (ownedResult.data ?? []) as ProjectSummary[];

  // Fetch stats for owned projects (active member count, open roles count, pending requests)
  const ownedProjectIds = ownedProjects.map((p) => p.id);
  const ownedProjectStats: Record<string, { members: number; openRoles: number; pendingRequests: number }> = {};

  if (ownedProjectIds.length > 0) {
    const [rolesRes, membersRes, requestsRes] = await Promise.all([
      supabase
        .from("project_roles")
        .select("id, project_id, status, positions")
        .in("project_id", ownedProjectIds),
      supabase
        .from("project_members")
        .select("id, project_id, project_role_id, membership_status")
        .in("project_id", ownedProjectIds)
        .eq("membership_status", "active"),
      supabase
        .from("join_requests")
        .select("id, project_id, status")
        .in("project_id", ownedProjectIds)
        .eq("status", "pending"),
    ]);

    const activeMembersByProject: Record<string, number> = {};
    (membersRes.data ?? []).forEach((m) => {
      activeMembersByProject[m.project_id] = (activeMembersByProject[m.project_id] ?? 0) + 1;
    });

    const pendingRequestsByProject: Record<string, number> = {};
    (requestsRes.data ?? []).forEach((r) => {
      pendingRequestsByProject[r.project_id] = (pendingRequestsByProject[r.project_id] ?? 0) + 1;
    });

    const rolesByProject: Record<string, Array<{ id: string; status: string; positions: number }>> = {};
    (rolesRes.data ?? []).forEach((r) => {
      if (!rolesByProject[r.project_id]) rolesByProject[r.project_id] = [];
      rolesByProject[r.project_id].push(r);
    });

    const membersByRole: Record<string, number> = {};
    (membersRes.data ?? []).forEach((m) => {
      if (m.project_role_id) {
        membersByRole[m.project_role_id] = (membersByRole[m.project_role_id] ?? 0) + 1;
      }
    });

    ownedProjectIds.forEach((pid) => {
      const projectRoles = rolesByProject[pid] ?? [];
      const openRolesCount = projectRoles.filter((r) => {
        const occ = membersByRole[r.id] ?? 0;
        return r.status === "open" && occ < r.positions;
      }).length;

      ownedProjectStats[pid] = {
        members: activeMembersByProject[pid] ?? 0,
        openRoles: openRolesCount,
        pendingRequests: pendingRequestsByProject[pid] ?? 0,
      };
    });
  }

  // Populate joined projects
  const rawMemberships = (memberResult.data ?? []) as Array<{
    id: string;
    project_id: string;
    project_role_id: string | null;
    membership_status: string;
    joined_at: string;
  }>;

  let joinedProjects: JoinedMembership[] = [];
  if (rawMemberships.length > 0) {
    const memberProjectIds = rawMemberships.map((m) => m.project_id);
    const memberRoleIds = rawMemberships
      .map((m) => m.project_role_id)
      .filter(Boolean) as string[];

    const [memberProjectsRes, memberRolesRes] = await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, short_description, category, project_type, stage, collaboration_type, city, status, created_at",
        )
        .in("id", memberProjectIds),
      memberRoleIds.length > 0
        ? supabase
            .from("project_roles")
            .select("id, title")
            .in("id", memberRoleIds)
        : Promise.resolve({ data: [] }),
    ]);

    const projectMap = Object.fromEntries(
      (memberProjectsRes.data ?? []).map((p) => [p.id, p as ProjectSummary]),
    );
    const roleMap = Object.fromEntries(
      (memberRolesRes.data ?? []).map((r) => [r.id, r.title as string]),
    );

    joinedProjects = rawMemberships
      .map((m) => ({
        id: m.id,
        project_id: m.project_id,
        project_role_id: m.project_role_id,
        joined_at: m.joined_at,
        role_title: m.project_role_id ? roleMap[m.project_role_id] ?? null : null,
        project: projectMap[m.project_id] ?? null,
      }))
      .filter((m) => m.project !== null);
  }

  // Populate pending applications
  const rawApplications = (applicationResult.data ?? []) as Array<{
    id: string;
    project_id: string;
    project_role_id: string;
    message: string | null;
    status: string;
    created_at: string;
    status_updated_at?: string | null;
  }>;

  let pendingApplications: PendingApplication[] = [];
  if (rawApplications.length > 0) {
    const appProjectIds = rawApplications.map((a) => a.project_id);
    const appRoleIds = rawApplications.map((a) => a.project_role_id);

    const [appProjectsRes, appRolesRes] = await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, short_description, category, project_type, stage, collaboration_type, city, status, created_at",
        )
        .in("id", appProjectIds),
      supabase
        .from("project_roles")
        .select("id, title")
        .in("id", appRoleIds),
    ]);

    const appProjectMap = Object.fromEntries(
      (appProjectsRes.data ?? []).map((p) => [p.id, p as ProjectSummary]),
    );
    const appRoleMap = Object.fromEntries(
      (appRolesRes.data ?? []).map((r) => [r.id, r.title as string]),
    );

    pendingApplications = rawApplications
      .map((a) => ({
        id: a.id,
        project_id: a.project_id,
        project_role_id: a.project_role_id,
        message: a.message,
        status: a.status,
        created_at: a.created_at,
        status_updated_at: a.status_updated_at ?? null,
        role_title: appRoleMap[a.project_role_id] ?? null,
        project: appProjectMap[a.project_id] ?? null,
      }))
      .filter((a) => a.project !== null);
  }

  const fullName = profile.full_name!.trim();
  const username = profile.username!.trim();
  const primaryRole = profile.primary_role!.trim();
  const experienceLevel = profile.experience_level as ExperienceLevel;
  const builderMode = profile.builder_mode as BuilderMode;
  const firstName = fullName.split(/\s+/)[0];
  const profileHref = `/profile/${encodeURIComponent(username)}`;
  const skills = profile.skills ?? [];
  const interests = profile.interests ?? [];
  const { percentage, suggestion } = getCompleteness(profile);
  const emphasizeCreate = builderMode === "have_something_to_build";
  const emphasizeExplore = builderMode === "want_something_to_build";

  return (
    <main className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <header className="border-b border-[var(--theme-border)] bg-[var(--theme-bg)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-7 gap-y-3 px-5 py-4 sm:px-8 lg:flex-nowrap lg:px-10">
          <Link
            href="/dashboard"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] rounded-lg"
            aria-label="Teamies Dashboard"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>

          <nav
            aria-label="Dashboard navigation"
            className="order-3 mt-4 flex w-full flex-wrap items-center gap-2 border-t border-[var(--theme-border)] pt-4 text-sm font-medium lg:order-none lg:mt-0 lg:w-auto lg:border-0 lg:pt-0"
          >
            <Link
              href="/dashboard"
              aria-current="page"
              className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text)]"
            >
              Dashboard
            </Link>
            <Link
              href="/discover/projects"
              className="rounded-md px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            >
              Discover Projects
            </Link>
            <Link
              href="/discover/builders"
              className="rounded-md px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            >
              Discover Builders
            </Link>
            <Link
              href="/projects/new"
              className="button-primary text-xs"
            >
              Create Project
            </Link>
          </nav>

          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3 text-sm font-medium">
            <Link
              href={profileHref}
              className="max-w-28 truncate text-[var(--theme-text)] transition-colors hover:text-[var(--theme-accent)]"
            >
              {firstName || `@${username}`}
            </Link>
            <Link
              href="/settings/profile"
              className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            >
              Settings
            </Link>
            <LogoutButton className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8 sm:pb-24 sm:pt-12 lg:px-10">
        <section aria-labelledby="welcome-heading">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Your dashboard
          </p>
          <h1
            id="welcome-heading"
            className="mt-2 text-balance font-sans text-3xl font-bold tracking-[-0.035em] sm:text-4xl text-[var(--theme-text)]"
          >
            {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
          </h1>
          <p className="mt-2 text-base text-[var(--theme-text-muted)]">
            Ready to build something real?
          </p>
        </section>

        {notifications.length > 0 ? (
          <section aria-label="Notifications" className="mt-6 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                Recent Updates ({notifications.length})
              </h2>
            </div>
            <div className="mt-3 space-y-2.5">
              {notifications.map((n) => (
                <div key={n.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3.5">
                  <div>
                    <p className="text-sm font-semibold text-[var(--theme-text)]">{n.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{n.message}</p>
                    <p className="mt-1 font-mono text-[11px] text-[var(--theme-text-muted)]">{formatDate(n.created_at)}</p>
                  </div>
                  {n.link ? (
                    <Link
                      href={safeInternalPath(n.link)}
                      className="action-link-secondary text-xs shrink-0"
                    >
                      View project
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Quick action cards */}
        <section
          aria-labelledby="next-step-heading"
          className="mt-8 sm:mt-10"
        >
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                Choose your next step
              </p>
              <h2
                id="next-step-heading"
                className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]"
              >
                Start with what you need today
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article
              className={`flex min-h-64 flex-col rounded-lg border p-6 bg-[var(--theme-surface)] transition ${
                emphasizeCreate
                  ? "border-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]"
                  : "border-[var(--theme-border)] hover:border-[var(--theme-text-muted)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                  Lead a project
                </p>
                {emphasizeCreate ? (
                  <span className="chip-tag font-mono">
                    Matches your goal
                  </span>
                ) : null}
              </div>
              <h3 className="mt-4 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]">
                I have something to build
              </h3>
              <p className="mt-2.5 max-w-xl text-sm leading-6 text-[var(--theme-text-muted)]">
                Post your idea, define the roles you need, and find builders who
                can help bring it to life.
              </p>
              <div className="mt-auto pt-5">
                <Link
                  href="/projects/new"
                  className="button-primary"
                >
                  Create a project
                </Link>
              </div>
            </article>

            <article
              className={`flex min-h-64 flex-col rounded-lg border p-6 bg-[var(--theme-surface)] transition ${
                emphasizeExplore
                  ? "border-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]"
                  : "border-[var(--theme-border)] hover:border-[var(--theme-text-muted)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                  Join a team
                </p>
                {emphasizeExplore ? (
                  <span className="chip-tag font-mono">
                    Matches your goal
                  </span>
                ) : null}
              </div>
              <h3 className="mt-4 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]">
                I want something to build
              </h3>
              <p className="mt-2.5 max-w-xl text-sm leading-6 text-[var(--theme-text-muted)]">
                Discover projects looking for your skills and find something
                worth contributing to.
              </p>
              <div className="mt-auto pt-5">
                <Link
                  href="/discover/projects"
                  className="button-primary"
                >
                  Explore projects
                </Link>
              </div>
            </article>
          </div>
        </section>

        {/* Profile Card & Completeness */}
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
          <section
            aria-labelledby="profile-heading"
            className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7"
          >
            <div className="flex flex-col gap-4 border-b border-dashed border-[var(--theme-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                  Your builder profile
                </p>
                <h2
                  id="profile-heading"
                  className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]"
                >
                  {fullName}
                </h2>
                <Link
                  href={profileHref}
                  className="mt-1 inline-block text-xs text-[var(--theme-text-muted)] action-link-secondary"
                >
                  @{username}
                </Link>
              </div>
              <Link
                href="/settings/profile"
                className="button-secondary text-xs"
              >
                Edit profile
              </Link>
            </div>

            <dl className="grid gap-x-6 gap-y-4 py-5 sm:grid-cols-2">
              <div>
                <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                  Primary role
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--theme-text)]">
                  {primaryRole}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                  Experience
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--theme-text)]">
                  {experienceLabels[experienceLevel]}
                </dd>
              </div>
              {hasText(profile.college) ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                    College / University
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--theme-text)]">
                    {profile.college}
                  </dd>
                </div>
              ) : null}
              {hasText(profile.city) ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                    City
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--theme-text)]">
                    {profile.city}
                  </dd>
                </div>
              ) : null}
              {profile.weekly_availability !== null ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                    Weekly availability
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-medium text-[var(--theme-text)]">
                    {profile.weekly_availability}{" "}
                    {profile.weekly_availability === 1 ? "hour" : "hours"} / wk
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                  Builder mode
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--theme-text)]">
                  {builderModeLabels[builderMode]}
                </dd>
              </div>
            </dl>

            <div className="space-y-5 border-t border-dashed border-[var(--theme-border)] pt-5">
              <div>
                <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Skills</h3>
                {skills.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Skills">
                    {skills.map((skill) => (
                      <span key={skill} className="chip-tag">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-[var(--theme-text-muted)]">
                    No skills added yet. Add a few to help builders find you.
                  </p>
                )}
              </div>

              <div>
                <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">Interests</h3>
                {interests.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Interests">
                    {interests.map((interest) => (
                      <span key={interest} className="chip-tag">
                        {interest}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-[var(--theme-text-muted)]">
                    No interests added yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section
              aria-labelledby="completeness-heading"
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2
                  id="completeness-heading"
                  className="font-sans text-lg font-bold text-[var(--theme-text)]"
                >
                  Profile completeness
                </h2>
                <p className="font-mono text-xl font-semibold text-[var(--theme-text)]">
                  {percentage}%
                </p>
              </div>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--theme-border)]"
                role="progressbar"
                aria-label="Profile completeness"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
              >
                <div
                  className="h-full rounded-full bg-[var(--theme-accent)] transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--theme-text-muted)]">
                {suggestion}
              </p>
              <Link href="/settings/profile" className="mt-3 inline-block action-link-secondary text-xs">
                Update your profile
              </Link>
            </section>
          </aside>
        </div>

        {/* Real Projects Section 1: Projects You Own / Lead */}
        <section
          aria-labelledby="owned-projects-heading"
          className="mt-8 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                Leadership
              </p>
              <h2
                id="owned-projects-heading"
                className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]"
              >
                Projects you lead ({ownedProjects.length})
              </h2>
            </div>
            <Link
              href="/projects/new"
              className="button-primary text-xs"
            >
              + Create a project
            </Link>
          </div>

          {ownedProjects.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {ownedProjects.map((project) => {
                const stats = ownedProjectStats[project.id] || { members: 0, openRoles: 0, pendingRequests: 0 };
                const isProjectActive = project.status === "open" || project.status === "active";
                const maxTeam = project.max_team_size || 5;
                const projectIsFull = stats.members + 1 >= maxTeam;
                const recruitingState = projectIsFull
                  ? "full"
                  : project.recruiting_status === "paused"
                    ? "paused"
                    : !isProjectActive || project.recruiting_status === "closed"
                      ? "closed"
                      : "open";

                const isStale = isProjectStale(
                  project.last_activity_at ?? project.created_at,
                  stats.openRoles > 0,
                  project.status,
                  project.recruiting_status ?? "open",
                );

                return (
                  <article
                    key={project.id}
                    className={`flex flex-col rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 transition hover:border-[var(--theme-text-muted)] ${
                      isStale ? "status-rail-stale" : "status-rail-active"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-[var(--theme-text-muted)]">
                        <span className="chip-tag text-[11px]">{project.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          isProjectActive
                            ? "bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]"
                            : "bg-[var(--theme-warn-soft)] text-[var(--theme-warn)]"
                        }`}>
                          {humanize(project.status)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          recruitingState === "open"
                            ? "bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]"
                            : recruitingState === "paused"
                              ? "bg-[var(--theme-warn-soft)] text-[var(--theme-warn)]"
                              : "bg-[var(--theme-surface)] text-[var(--theme-text-muted)]"
                        }`}>
                          {recruitingState === "open"
                            ? "Recruiting"
                            : recruitingState === "paused"
                              ? "Paused"
                              : recruitingState === "full"
                                ? "Team full"
                                : "Closed"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs">
                        {isStale ? (
                          <span className="badge-stale">Stale</span>
                        ) : (
                          <span className="badge-active">
                            {formatRelativeActivity(project.last_activity_at ?? project.created_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="mt-2.5 text-base font-bold tracking-[-0.02em] text-[var(--theme-text)]">
                      <Link
                        href={`/projects/${project.id}`}
                        className="hover:underline"
                      >
                        {project.name}
                      </Link>
                    </h3>

                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--theme-text-muted)]">
                      {project.short_description}
                    </p>

                    {/* Team & application stats */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--theme-text-muted)]">
                      <span>{stats.members + 1} / {maxTeam} members</span>
                      <span>·</span>
                      <span>{stats.openRoles} open {stats.openRoles === 1 ? "role" : "roles"}</span>
                      {stats.pendingRequests > 0 ? (
                        <>
                          <span>·</span>
                          <span className="text-[var(--theme-accent)] font-semibold">{stats.pendingRequests} pending</span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[var(--theme-border)] pt-3 text-xs text-[var(--theme-text-muted)]">
                      <span className="font-mono text-[11px]">Created {formatDate(project.created_at)}</span>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/projects/${project.id}`}
                          className="action-link-secondary text-xs"
                        >
                          Manage
                        </Link>
                        {stats.pendingRequests > 0 ? (
                          <Link
                            href={`/projects/${project.id}#applications`}
                            className="button-primary text-xs !py-1 !min-h-0"
                          >
                            Applications ({stats.pendingRequests})
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] p-6 text-center">
              <h3 className="text-sm font-semibold text-[var(--theme-text)]">
                You haven&apos;t created any projects yet
              </h3>
              <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                Have an idea you want to build? Post it to find collaborators.
              </p>
              <Link
                href="/projects/new"
                className="button-primary mt-3 text-xs"
              >
                Create your first project
              </Link>
            </div>
          )}
        </section>

        {/* Real Projects Section 2: Projects You Joined */}
        <section
          aria-labelledby="joined-projects-heading"
          className="mt-6 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7"
        >
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
              Collaboration
            </p>
            <h2
              id="joined-projects-heading"
              className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]"
            >
              Projects you joined ({joinedProjects.length})
            </h2>
          </div>

          {joinedProjects.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {joinedProjects.map((item) => {
                if (!item.project) return null;
                return (
                  <article
                    key={item.id}
                    className="flex flex-col rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 transition hover:border-[var(--theme-text-muted)] status-rail-active"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-medium uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                        {item.role_title || "Team member"}
                      </span>
                      <span className="chip-tag font-mono">
                        Active member
                      </span>
                    </div>
                    <h3 className="mt-2.5 text-base font-bold tracking-[-0.02em] text-[var(--theme-text)]">
                      <Link
                        href={`/projects/${item.project.id}`}
                        className="hover:underline"
                      >
                        {item.project.name}
                      </Link>
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--theme-text-muted)]">
                      {item.project.short_description}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-[var(--theme-border)] pt-3 text-xs text-[var(--theme-text-muted)]">
                      <span className="font-mono text-[11px]">Joined {formatDate(item.joined_at)}</span>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/projects/${item.project.id}#team-workspace`}
                          className="button-primary text-xs !py-1 !min-h-0"
                        >
                          Workspace ↗
                        </Link>
                        <Link
                          href={`/projects/${item.project.id}`}
                          className="action-link-secondary text-xs"
                        >
                          View project
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] p-6 text-center">
              <h3 className="text-sm font-semibold text-[var(--theme-text)]">
                You haven&apos;t joined any projects yet
              </h3>
              <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                Explore open projects and find a team looking for your skills.
              </p>
              <Link
                href="/discover/projects"
                className="button-secondary mt-3 text-xs"
              >
                Discover open projects
              </Link>
            </div>
          )}
        </section>

        {/* Real Projects Section 3: Pending Applications */}
        <section
          aria-labelledby="applications-heading"
          className="mt-6 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 sm:p-7"
        >
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
              Applications
            </p>
            <h2
              id="applications-heading"
              className="mt-1 font-sans text-2xl font-bold tracking-[-0.03em] text-[var(--theme-text)]"
            >
              Pending applications ({pendingApplications.length})
            </h2>
          </div>

          {pendingApplications.length > 0 ? (
            <div className="mt-5 space-y-4">
              {pendingApplications.map((app) => {
                if (!app.project) return null;
                return (
                  <article
                    key={app.id}
                    className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 sm:p-5 status-rail-active"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--theme-text)]">
                            <Link
                              href={`/projects/${app.project.id}`}
                              className="hover:underline"
                            >
                              {app.project.name}
                            </Link>
                          </h3>
                          <span className="badge-active font-mono">
                            Pending review
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-xs text-[var(--theme-text-muted)]">
                          Applied for: <span className="font-medium text-[var(--theme-text)]">{app.role_title || "Project role"}</span> · Submitted {formatDate(app.created_at)}
                        </p>
                        {app.message ? (
                          <p className="mt-2 line-clamp-2 text-xs italic text-[var(--theme-text-muted)]">
                            &ldquo;{app.message}&rdquo;
                          </p>
                        ) : null}
                      </div>

                      <Link
                        href={`/projects/${app.project.id}`}
                        className="action-link-secondary shrink-0"
                      >
                        View project
                      </Link>
                    </div>

                    <div className="mt-4 border-t border-dashed border-[var(--theme-border)] pt-4">
                      <ApplicationTimeline
                        status={app.status as "pending" | "accepted" | "rejected" | "withdrawn"}
                        createdAt={app.created_at}
                        statusUpdatedAt={app.status_updated_at}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-md border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] p-6 text-center text-xs text-[var(--theme-text-muted)]">
              You have no pending applications. Check out{" "}
              <Link
                href="/discover/projects"
                className="action-link-secondary"
              >
                Discover Projects
              </Link>{" "}
              to find open positions.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
