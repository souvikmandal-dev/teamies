"use client";

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TeamiesLogo } from "@/components/teamies-logo";

import { LoadError } from "@/components/load-error";
import { LogoutButton } from "@/components/logout-button";
import { SocialLinks } from "@/components/social-links";
import { humanize } from "@/lib/humanize";
import { supabase } from "@/lib/supabase/client";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";

type BuilderProfile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  college: string | null;
  city: string | null;
  primary_role: string | null;
  experience_level: string | null;
  weekly_availability: number | null;
  portfolio_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  instagram_url?: string | null;
  skills: string[] | null;
  interests: string[] | null;
  builder_mode: string | null;
  created_at: string;
};

type OwnedProject = {
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
};

type JoinedProject = {
  id: string;
  project_id: string;
  membership_status: string;
  joined_at: string;
  role_title: string | null;
  project: {
    id: string;
    name: string;
    short_description: string;
    category: string;
    project_type: string;
    stage: string;
    collaboration_type: string;
    city: string | null;
    status: string;
  } | null;
};


function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const rawUsername = Array.isArray(params.username)
    ? params.username[0]
    : params.username;
  let decodedUsername = rawUsername ?? "";
  try {
    decodedUsername = decodeURIComponent(decodedUsername);
  } catch {
    // ignore
  }
  const username = decodedUsername.toLowerCase().trim();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<BuilderProfile | null>(null);
  const [ownedProjects, setOwnedProjects] = useState<OwnedProject[]>([]);
  const [joinedProjects, setJoinedProjects] = useState<JoinedProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadProfileData = useCallback(async () => {
    if (!username) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setNotFound(false);
    setErrorMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      let profileRecord: BuilderProfile | null = null;
      const initialQuery = await supabase
        .from("profiles")
        .select(
          "id, username, full_name, avatar_url, bio, college, city, primary_role, experience_level, weekly_availability, portfolio_url, github_url, linkedin_url, instagram_url, skills, interests, builder_mode, created_at",
        )
        .eq("username", username)
        .maybeSingle();

      let profileError = initialQuery.error;

      if (profileError && isMissingColumnError(profileError, "instagram_url")) {
        const fallback = await supabase
          .from("profiles")
          .select(
            "id, username, full_name, avatar_url, bio, college, city, primary_role, experience_level, weekly_availability, portfolio_url, github_url, linkedin_url, skills, interests, builder_mode, created_at",
          )
          .eq("username", username)
          .maybeSingle();
        profileRecord = (fallback.data as BuilderProfile | null) ?? null;
        profileError = fallback.error;
      } else {
        profileRecord = (initialQuery.data as BuilderProfile | null) ?? null;
      }

      if (profileError) {
        setErrorMessage("We couldn't load this profile. Please try again.");
        return;
      }

      if (!profileRecord) {
        setNotFound(true);
        return;
      }

      const loadedProfile = profileRecord;
      setProfile(loadedProfile);

      const [ownedResult, membersResult] = await Promise.all([
        supabase
          .from("projects")
          .select(
            "id, name, short_description, category, project_type, stage, collaboration_type, city, status, created_at",
          )
          .eq("owner_id", loadedProfile.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_members")
          .select(
            "id, project_id, project_role_id, membership_status, joined_at",
          )
          .eq("profile_id", loadedProfile.id)
          .eq("membership_status", "active")
          .order("joined_at", { ascending: false }),
      ]);

      if (ownedResult.error || membersResult.error) {
        setErrorMessage("We couldn't load this builder's projects. Please try again.");
        return;
      }

      if (ownedResult.data) {
        setOwnedProjects(ownedResult.data as OwnedProject[]);
      }

      if (membersResult.data && membersResult.data.length > 0) {
        const rawMembers = membersResult.data as Array<{
          id: string;
          project_id: string;
          project_role_id: string | null;
          membership_status: string;
          joined_at: string;
        }>;

        const projectIds = rawMembers.map((m) => m.project_id);
        const roleIds = rawMembers
          .map((m) => m.project_role_id)
          .filter(Boolean) as string[];

        const [projectsResult, rolesResult] = await Promise.all([
          supabase
            .from("projects")
            .select(
              "id, name, short_description, category, project_type, stage, collaboration_type, city, status",
            )
            .in("id", projectIds),
          roleIds.length > 0
            ? supabase
                .from("project_roles")
                .select("id, title")
                .in("id", roleIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (projectsResult.error || rolesResult.error) {
          setErrorMessage("We couldn't load joined projects. Please try again.");
          return;
        }

        const projectMap = Object.fromEntries(
          (projectsResult.data ?? []).map((p) => [p.id, p]),
        );
        const roleMap = Object.fromEntries(
          (rolesResult.data ?? []).map((r) => [r.id, r.title]),
        );

        const joinedList: JoinedProject[] = rawMembers.map((m) => ({
          id: m.id,
          project_id: m.project_id,
          membership_status: m.membership_status,
          joined_at: m.joined_at,
          role_title: m.project_role_id ? roleMap[m.project_role_id] ?? null : null,
          project: projectMap[m.project_id] ?? null,
        }));

        setJoinedProjects(joinedList.filter((j) => j.project !== null));
      } else {
        setJoinedProjects([]);
      }
    } catch {
      setErrorMessage("Something went wrong while loading this profile.");
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-(--theme-bg) px-5 text-(--theme-text)">
        <p className="text-sm font-mono text-(--theme-text-muted)" role="status">
          Loading builder profile...
        </p>
      </main>
    );
  }

  if (errorMessage) {
    return <LoadError message={errorMessage} onRetry={() => void loadProfileData()} href="/discover/builders" linkLabel="Explore builders" />;
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
        <header className="border-b border-(--theme-border)">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
            <Link
              href="/"
              className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
              aria-label="Teamies"
            >
              <TeamiesLogo variant="auto" priority />
            </Link>
            <Link
              href="/discover/builders"
              className="text-sm font-medium text-(--theme-text-muted) hover:text-(--theme-text)"
            >
              Discover Builders
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-md px-5 py-24 text-center">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-(--theme-text-muted)">
            Profile not found
          </p>
          <h1 className="mt-3 text-3xl font-sans font-bold tracking-[-0.035em] text-(--theme-text)">
            @{username} doesn&apos;t exist yet.
          </h1>
          <p className="mt-4 text-sm leading-6 text-(--theme-text-muted)">
            Check the username or discover other active builders in the network.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/discover/builders"
              className="button-primary"
            >
              Explore builders
            </Link>
            <Link
              href="/dashboard"
              className="button-secondary"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isOwnProfile = currentUserId === profile.id;
  const skills = profile.skills ?? [];
  const interests = profile.interests ?? [];

  return (
    <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
      <header className="border-b border-(--theme-border)">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
            aria-label="Teamies"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <nav
            aria-label="Profile navigation"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
          >
            <Link
              href="/discover/projects"
              className="text-(--theme-text-muted) hover:text-(--theme-text)"
            >
              Discover Projects
            </Link>
            <Link
              href="/discover/builders"
              className="text-(--theme-text-muted) hover:text-(--theme-text)"
            >
              Discover Builders
            </Link>
            {currentUserId ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-(--theme-text-muted) hover:text-(--theme-text)"
                >
                  Dashboard
                </Link>
                {isOwnProfile ? (
                  <Link
                    href="/settings/profile"
                    className="button-secondary !py-1.5 !min-h-0 text-xs"
                  >
                    Edit profile
                  </Link>
                ) : (
                  <LogoutButton className="text-(--theme-text-muted) hover:text-(--theme-text)" />
                )}
              </>
            ) : (
              <Link
                href={`/login?next=/profile/${profile.username}`}
                className="button-primary !py-1.5 !min-h-0 text-xs"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14 lg:px-10">
        {errorMessage ? (
          <div
            className="mb-6 rounded-md border border-(--theme-warn) bg-(--theme-warn-soft) px-4 py-3 text-sm text-(--theme-warn)"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          {/* Main profile content */}
          <div className="space-y-8">
            {/* Header info */}
            <section className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-sans font-bold tracking-[-0.04em] sm:text-4xl text-(--theme-text)">
                      {profile.full_name || `@${profile.username}`}
                    </h1>
                  </div>
                  <p className="mt-0.5 text-xs font-mono text-(--theme-text-muted)">
                    @{profile.username}
                  </p>
                  <p className="mt-3 text-base font-medium text-(--theme-text)">
                    {profile.primary_role || "Builder"}
                  </p>
                </div>

                {isOwnProfile ? (
                  <Link
                    href="/settings/profile"
                    className="button-secondary !py-1.5 !min-h-0 text-xs"
                  >
                    Edit profile
                  </Link>
                ) : null}
              </div>

              {profile.bio ? (
                <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-(--theme-text-muted)">
                  {profile.bio}
                </p>
              ) : (
                <p className="mt-4 text-sm text-(--theme-text-muted) italic">
                  No bio shared yet.
                </p>
              )}

              <dl className="mt-6 grid gap-4 border-t border-dashed border-(--theme-border) pt-5 sm:grid-cols-3">
                {profile.experience_level ? (
                  <div>
                    <dt className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                      Experience
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-(--theme-text)">
                      {humanize(profile.experience_level)}
                    </dd>
                  </div>
                ) : null}
                {profile.college ? (
                  <div>
                    <dt className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                      College
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-(--theme-text)">
                      {profile.college}
                    </dd>
                  </div>
                ) : null}
                {profile.city ? (
                  <div>
                    <dt className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                      Location
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-(--theme-text)">
                      {profile.city}
                    </dd>
                  </div>
                ) : null}
                {profile.weekly_availability !== null ? (
                  <div>
                    <dt className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                      Availability
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-(--theme-text)">
                      {profile.weekly_availability} hrs / week
                    </dd>
                  </div>
                ) : null}
                {profile.builder_mode ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                      Builder mode
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-(--theme-text)">
                      {profile.builder_mode === "have_something_to_build"
                        ? "Looking for collaborators to build an idea"
                        : profile.builder_mode === "want_something_to_build"
                          ? "Looking to join exciting projects"
                          : "Both leading and joining projects"}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {/* Skills & Interests */}
            <section className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 sm:p-8">
              <h2 className="text-xl font-sans font-bold tracking-[-0.03em] text-(--theme-text)">
                Skills & Interests
              </h2>

              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                    Skills
                  </h3>
                  {skills.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
                      {skills.map((skill) => (
                        <li
                          key={skill.toLowerCase()}
                          className="chip-tag"
                        >
                          {skill}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-(--theme-text-muted)">
                      No skills listed yet.
                    </p>
                  )}
                </div>

                {interests.length > 0 ? (
                  <div className="border-t border-dashed border-(--theme-border) pt-5">
                    <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                      Interests
                    </h3>
                    <ul
                      className="mt-3 flex flex-wrap gap-1.5"
                      aria-label="Interests"
                    >
                      {interests.map((interest) => (
                        <li
                          key={interest.toLowerCase()}
                          className="chip-tag"
                        >
                          {interest}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Projects Owned / Created */}
            <section className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                    Initiatives
                  </p>
                  <h2 className="mt-1 text-2xl font-sans font-bold tracking-[-0.03em] text-(--theme-text)">
                    Projects leading
                  </h2>
                </div>
                <span className="text-xs font-mono text-(--theme-text-muted)">
                  {ownedProjects.length}
                </span>
              </div>

              {ownedProjects.length > 0 ? (
                <div className="mt-6 space-y-4">
                  {ownedProjects.map((project) => (
                    <article
                      key={project.id}
                      className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5 transition hover:border-(--theme-text-muted)"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono uppercase tracking-[0.12em] text-(--theme-text-muted)">
                        <span>{project.category}</span>
                        <span>·</span>
                        <span>{humanize(project.project_type)}</span>
                        <span>·</span>
                        <span>{humanize(project.stage)}</span>
                      </div>
                      <h3 className="mt-2 text-xl font-sans font-semibold tracking-[-0.025em] text-(--theme-text)">
                        <Link
                          href={`/projects/${project.id}`}
                          className="hover:underline"
                        >
                          {project.name}
                        </Link>
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-(--theme-text-muted)">
                        {project.short_description}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-(--theme-border) pt-3 text-xs text-(--theme-text-muted)">
                        <span>
                          {humanize(project.collaboration_type)}
                          {project.city ? ` · ${project.city}` : ""}
                        </span>
                        <Link
                          href={`/projects/${project.id}`}
                          className="action-link-secondary"
                        >
                          View project →
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-dashed border-(--theme-border) bg-(--theme-surface) p-6 text-center text-sm text-(--theme-text-muted)">
                  Not currently leading any public projects.
                </p>
              )}
            </section>

            {/* Projects Joined */}
            <section className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                    Collaborations
                  </p>
                  <h2 className="mt-1 text-2xl font-sans font-bold tracking-[-0.03em] text-(--theme-text)">
                    Projects joined
                  </h2>
                </div>
                <span className="text-xs font-mono text-(--theme-text-muted)">
                  {joinedProjects.length}
                </span>
              </div>

              {joinedProjects.length > 0 ? (
                <div className="mt-6 space-y-4">
                  {joinedProjects.map((item) => {
                    if (!item.project) return null;
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5 transition hover:border-(--theme-text-muted)"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">
                            {item.role_title || "Team member"}
                          </span>
                          <span className="badge-active">
                            Active member
                          </span>
                        </div>
                        <h3 className="mt-2 text-xl font-sans font-semibold tracking-[-0.025em] text-(--theme-text)">
                          <Link
                            href={`/projects/${item.project.id}`}
                            className="hover:underline"
                          >
                            {item.project.name}
                          </Link>
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-(--theme-text-muted)">
                          {item.project.short_description}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-(--theme-border) pt-3 text-xs text-(--theme-text-muted)">
                          <span className="font-mono">
                            Joined {formatDate(item.joined_at)}
                          </span>
                          <Link
                            href={`/projects/${item.project.id}`}
                            className="action-link-secondary"
                          >
                            View project →
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-dashed border-(--theme-border) bg-(--theme-surface) p-6 text-center text-sm text-(--theme-text-muted)">
                  Has not joined any external project teams yet.
                </p>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-6">
            {/* Links & Socials */}
            <section className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6">
              <h2 className="text-base font-sans font-bold tracking-[-0.02em] text-(--theme-text)">
                Social profiles & links
              </h2>
              <div className="mt-4">
                <SocialLinks
                  portfolioUrl={profile.portfolio_url}
                  githubUrl={profile.github_url}
                  linkedinUrl={profile.linkedin_url}
                  instagramUrl={profile.instagram_url}
                />
              </div>
              <p className="mt-6 border-t border-dashed border-(--theme-border) pt-4 text-xs font-mono text-(--theme-text-muted)">
                Member since {formatDate(profile.created_at)}
              </p>
            </section>

          </aside>
        </div>
      </div>
    </main>
  );
}

