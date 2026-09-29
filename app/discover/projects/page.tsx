"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TeamiesLogo } from "@/components/teamies-logo";

import { formatRelativeActivity, isProjectStale, matchesActivityFilter } from "@/lib/time";
import { getResponsivenessLabel } from "@/lib/responsiveness";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import { supabase } from "@/lib/supabase/client";

type Project = {
  id: string;
  owner_id: string;
  name: string;
  short_description: string;
  category: string;
  project_type: string;
  stage: string;
  collaboration_type: string;
  city: string | null;
  weekly_commitment: number | null;
  created_at: string;
  status?: string;
  recruiting_status?: string | null;
  last_activity_at?: string | null;
};

type Role = {
  id: string;
  project_id: string;
  title: string;
  required_skills: string[] | null;
  status: string;
  positions: number;
};

type Owner = {
  id: string;
  username: string | null;
  full_name: string | null;
};

import { humanize } from "@/lib/humanize";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function ProjectDiscoveryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [owners, setOwners] = useState<Record<string, Owner>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [projectType, setProjectType] = useState("");
  const [stage, setStage] = useState("");
  const [collaborationType, setCollaborationType] = useState("");
  const [city, setCity] = useState("");
  const [skill, setSkill] = useState("");

  const [activityFilter, setActivityFilter] = useState("");
  const [ownerResponsiveness, setOwnerResponsiveness] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadProjects() {
      setIsLoading(true);
      setError("");

      try {
        let { data, error: projectsError } = await supabase
          .from("projects")
          .select(
            "id, owner_id, name, short_description, category, project_type, stage, collaboration_type, city, weekly_commitment, created_at, status, recruiting_status, last_activity_at",
          )
          .in("status", ["open", "active"])
          .order("created_at", { ascending: false });

        if (projectsError && (isMissingColumnError(projectsError, "recruiting_status") || isMissingColumnError(projectsError, "last_activity_at"))) {
          const fallback = await supabase
            .from("projects")
            .select(
              "id, owner_id, name, short_description, category, project_type, stage, collaboration_type, city, weekly_commitment, created_at, status",
            )
            .in("status", ["open", "active"])
            .order("created_at", { ascending: false });
          data = fallback.data as typeof data;
          projectsError = fallback.error;
        }

        if (projectsError) {
          const fallbackLegacy = await supabase
            .from("projects")
            .select(
              "id, owner_id, name, short_description, category, project_type, stage, collaboration_type, city, weekly_commitment, created_at",
            )
            .eq("status", "open")
            .order("created_at", { ascending: false });
          data = fallbackLegacy.data as typeof data;
          projectsError = fallbackLegacy.error;
        }

        if (projectsError) {
          setError("We couldn't load projects. Please try again.");
          return;
        }

        const loadedProjects = (data ?? []) as Project[];
        setProjects(loadedProjects);

        if (loadedProjects.length === 0) {
          setRoles([]);
          setOwners({});
          return;
        }

        const projectIds = loadedProjects.map((project) => project.id);
        const ownerIds = [...new Set(loadedProjects.map((project) => project.owner_id))];
        const [rolesResult, ownersResult, membersResult] = await Promise.all([
          supabase
            .from("project_roles")
            .select("id, project_id, title, required_skills, status, positions")
            .in("project_id", projectIds)
            .eq("status", "open"),
          supabase
            .from("profiles")
            .select("id, username, full_name")
            .in("id", ownerIds),
          supabase.from("project_members").select("project_role_id").in("project_id", projectIds).eq("membership_status", "active"),
        ]);

        if (rolesResult.error || ownersResult.error || membersResult.error) {
          setError("We couldn't load all project details. Please try again.");
          return;
        }

        const occupancy = new Map<string, number>();
        for (const member of membersResult.data ?? []) {
          if (member.project_role_id) occupancy.set(member.project_role_id, (occupancy.get(member.project_role_id) ?? 0) + 1);
        }
        setRoles(((rolesResult.data ?? []) as Role[]).filter((role) => (occupancy.get(role.id) ?? 0) < role.positions));
        const ownerRows = (ownersResult.data ?? []) as Owner[];
        setOwners(Object.fromEntries(ownerRows.map((owner) => [owner.id, owner])));

        try {
          const { data: respData } = await supabase
            .from("owner_responsiveness")
            .select("owner_id, decided_count, avg_response_seconds")
            .in("owner_id", ownerIds);
          if (respData) {
            const respMap: Record<string, string> = {};
            for (const r of respData) {
              respMap[r.owner_id] = getResponsivenessLabel(
                r.avg_response_seconds,
                r.decided_count,
              );
            }
            setOwnerResponsiveness(respMap);
          }
        } catch {
          // view may not be populated yet
        }
      } catch {
        setError("We couldn't load projects. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadProjects();
  }, []);

  const rolesByProject = useMemo(() => {
    const grouped: Record<string, Role[]> = {};

    roles.forEach((role) => {
      grouped[role.project_id] = [...(grouped[role.project_id] ?? []), role];
    });

    return grouped;
  }, [roles]);

  const categories = [...new Set(projects.map((project) => project.category))].sort();
  const filteredProjects = projects.filter((project) => {
    const projectRoles = rolesByProject[project.id] ?? [];
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const normalizedSkill = skill.trim().toLocaleLowerCase();
    const searchableText = [
      project.name,
      project.short_description,
      project.category,
      ...projectRoles.map((role) => role.title),
      ...projectRoles.flatMap((role) => role.required_skills ?? []),
    ]
      .join(" ")
      .toLocaleLowerCase();

    return (
      (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
      (!category || project.category === category) &&
      (!projectType || project.project_type === projectType) &&
      (!stage || project.stage === stage) &&
      (!collaborationType || project.collaboration_type === collaborationType) &&
      (!city || project.city?.toLocaleLowerCase().includes(city.toLocaleLowerCase())) &&
      (!activityFilter ||
        matchesActivityFilter(
          project.last_activity_at ?? project.created_at,
          activityFilter,
        )) &&
      (!normalizedSkill ||
        projectRoles.some((role) =>
          role.required_skills?.some((item) =>
            item.toLocaleLowerCase().includes(normalizedSkill),
          ),
        ))
    );
  });

  const selectClassName =
    "h-10 w-full min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]";

  return (
    <main className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <header className="border-b border-[var(--theme-border)] bg-[var(--theme-bg)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] rounded-lg"
            aria-label="Teamies"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium" aria-label="Discovery navigation">
            <Link href="/discover/builders" className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
              Discover Builders
            </Link>
            <Link href="/dashboard" className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
              Dashboard
            </Link>
            <Link href="/feedback" className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]">
              Feedback
            </Link>
            <Link href="/projects/new" className="button-primary">
              Create Project
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
            Project marketplace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Find something worth building.
          </h1>
          <p className="mt-3 text-base leading-7 text-[var(--theme-text-muted)]">
            Explore active build logs looking for collaborators, then apply for the role where you can contribute.
          </p>
        </div>

        <section className="mt-8 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5" aria-label="Project filters">
          <label htmlFor="project-search" className="sr-only">Search projects</label>
          <input
            id="project-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]"
            placeholder="Search projects, roles, or skills..."
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)} className={selectClassName}>
              <option value="">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select aria-label="Project type" value={projectType} onChange={(event) => setProjectType(event.target.value)} className={selectClassName}>
              <option value="">All types</option>
              {["startup", "hackathon", "portfolio", "college", "experimental", "creative", "other"].map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
            <select aria-label="Stage" value={stage} onChange={(event) => setStage(event.target.value)} className={selectClassName}>
              <option value="">All stages</option>
              {["idea", "planning", "building", "mvp", "launched"].map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
            <select aria-label="Collaboration type" value={collaborationType} onChange={(event) => setCollaborationType(event.target.value)} className={selectClassName}>
              <option value="">Any collaboration</option>
              {["remote", "local", "hybrid"].map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
            <select aria-label="Project activity" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} className={selectClassName}>
              <option value="">All activity</option>
              <option value="7d">Active in last 7 days</option>
              <option value="30d">Active in last 30 days</option>
            </select>
            <input aria-label="City" value={city} onChange={(event) => setCity(event.target.value)} className={selectClassName} placeholder="City" />
            <input aria-label="Required skill" value={skill} onChange={(event) => setSkill(event.target.value)} className={selectClassName} placeholder="Required skill" />
          </div>
        </section>

        {error ? <p className="mt-6 rounded-md border border-[var(--theme-warn)] bg-[var(--theme-warn-soft)] px-4 py-3 text-sm text-[var(--theme-warn)]" role="alert">{error}</p> : null}

        {isLoading ? (
          <p className="py-20 text-center font-mono text-xs text-[var(--theme-text-muted)]" role="status">
            Loading projects...
          </p>
        ) : error ? (
          <div className="mt-6">
            <button type="button" className="button-secondary" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : filteredProjects.length > 0 ? (
          <section className="mt-6 flex flex-col gap-3.5" aria-label="Open projects">
            {filteredProjects.map((project) => {
              const projectRoles = rolesByProject[project.id] ?? [];
              const skills = [...new Set(projectRoles.flatMap((role) => role.required_skills ?? []))];
              const owner = owners[project.owner_id];
              const isRecruitingPaused = project.recruiting_status === "paused";
              const isTeamFull = !isRecruitingPaused && projectRoles.length === 0;
              const isStale = isProjectStale(
                project.last_activity_at ?? project.created_at,
                projectRoles.length > 0,
                project.status ?? "open",
                project.recruiting_status ?? "open",
              );

              return (
                <article
                  key={project.id}
                  className={`flex flex-col rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 transition hover:border-[var(--theme-text-muted)] ${
                    isStale ? "status-rail-stale" : "status-rail-active"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--theme-text-muted)]">
                      <span>{project.category}</span>
                      <span>·</span>
                      <span>{humanize(project.project_type)}</span>
                      <span>·</span>
                      <span>{humanize(project.stage)}</span>
                      <span>·</span>
                      <span>{humanize(project.collaboration_type)}{project.city ? ` (${project.city})` : ""}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      {isRecruitingPaused ? (
                        <span className="chip-badge bg-[var(--theme-warn-soft)] text-[var(--theme-warn)]">
                          Recruiting paused
                        </span>
                      ) : isTeamFull ? (
                        <span className="chip-badge bg-[var(--theme-surface-subtle)] text-[var(--theme-text-muted)]">
                          Team full
                        </span>
                      ) : (
                        <span className="chip-badge bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
                          Recruiting
                        </span>
                      )}
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
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
                    <h2 className="text-xl font-semibold tracking-[-0.025em] text-[var(--theme-text)]">
                      <Link
                        href={`/projects/${project.id}`}
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                      >
                        {project.name}
                      </Link>
                    </h2>
                    {projectRoles.length > 0 ? (
                      <span className="font-mono text-xs text-[var(--theme-text-muted)] shrink-0">
                        {projectRoles.length} open {projectRoles.length === 1 ? "role" : "roles"}
                        {project.weekly_commitment !== null ? ` · ${project.weekly_commitment} hrs/wk` : ""}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-[var(--theme-text-muted)] shrink-0">
                        No open roles
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-[var(--theme-text-muted)] line-clamp-2">
                    {project.short_description}
                  </p>

                  {/* Skills/Tags: small pill, --tag text on --tag-soft background, no border */}
                  {skills.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {skills.slice(0, 6).map((item) => (
                        <span key={item.toLowerCase()} className="chip-tag">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Divider inside card: dashed --border line */}
                  <div className="mt-4 pt-3.5 border-t border-dashed border-[var(--theme-border)]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-[var(--theme-text-muted)]">
                        <span className="font-medium text-[var(--theme-text)]">
                          By {owner?.full_name || owner?.username || "Teamies builder"}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span className="font-mono text-[11px]">
                          {ownerResponsiveness[project.owner_id] || "New owner"}
                        </span>
                      </div>
                      <Link
                        href={`/projects/${project.id}`}
                        className="action-link-secondary shrink-0"
                      >
                        View project
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <div className="mt-8 rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-surface)] px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-[var(--theme-text)]">No projects match these filters.</h2>
            <p className="mt-1 text-sm text-[var(--theme-text-muted)]">Try clearing a filter, or create the project you want to see.</p>
            <button
              type="button"
              onClick={() => {
                setSearch(""); setCategory(""); setProjectType(""); setStage(""); setCollaborationType(""); setCity(""); setSkill(""); setActivityFilter("");
              }}
              className="mt-4 action-link-secondary"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
