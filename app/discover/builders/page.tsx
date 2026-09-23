"use client";

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TeamiesLogo } from "@/components/teamies-logo";

import { supabase } from "@/lib/supabase/client";
import { humanize } from "@/lib/humanize";

type BuilderProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  college: string | null;
  city: string | null;
  primary_role: string | null;
  experience_level: string | null;
  weekly_availability: number | null;
  skills: string[] | null;
  builder_mode?: string | null;
};

export default function BuilderDiscoveryPage() {
  const [builders, setBuilders] = useState<BuilderProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [skill, setSkill] = useState("");
  const [city, setCity] = useState("");
  const [experience, setExperience] = useState("");

  useEffect(() => {
    async function loadBuilders() {
      setIsLoading(true);
      setError("");

      try {
        const { data, error: profilesError } = await supabase
          .from("profiles")
          .select(
            "id, username, full_name, bio, college, city, primary_role, experience_level, weekly_availability, skills, builder_mode",
          )
          .not("username", "is", null)
          .order("created_at", { ascending: false });

        if (profilesError) {
          setError("We couldn't load builders. Please try again.");
          return;
        }

        setBuilders((data ?? []) as BuilderProfile[]);
      } catch {
        setError("We couldn't load builders. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadBuilders();
  }, []);

  const roles = [
    ...new Set(
      builders
        .map((builder) => builder.primary_role?.trim())
        .filter((r): r is string => Boolean(r)),
    ),
  ].sort();

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const normalizedSkill = skill.trim().toLocaleLowerCase();

  const filteredBuilders = builders.filter((builder) => {
    const safeFullName = builder.full_name?.trim() || "";
    const safeUsername = builder.username?.trim() || "";
    const safeRole = builder.primary_role?.trim() || "";
    const safeSkills = Array.isArray(builder.skills)
      ? builder.skills.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];

    const searchableText = [
      safeFullName,
      safeUsername,
      safeRole,
      builder.bio?.trim() ?? "",
      builder.college?.trim() ?? "",
      builder.city?.trim() ?? "",
      ...safeSkills,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    return (
      (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
      (!role || safeRole.toLowerCase() === role.toLowerCase()) &&
      (!city || (builder.city ?? "").toLocaleLowerCase().includes(city.toLocaleLowerCase())) &&
      (!experience || (builder.experience_level ?? "").toLowerCase() === experience.toLowerCase()) &&
      (!normalizedSkill ||
        safeSkills.some((item) =>
          item.toLocaleLowerCase().includes(normalizedSkill),
        ))
    );
  });

  const filterClassName =
    "h-11 w-full min-w-0 rounded-md border border-(--theme-border) bg-(--theme-surface) px-3 text-sm text-(--theme-text) outline-none focus:border-(--theme-accent) focus:ring-2 focus:ring-(--theme-accent)/20";

  return (
    <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
      <header className="border-b border-(--theme-border)">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
            aria-label="Teamies"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium" aria-label="Discovery navigation">
            <Link href="/discover/projects" className="text-(--theme-text-muted) hover:text-(--theme-text)">Discover Projects</Link>
            <Link href="/dashboard" className="text-(--theme-text-muted) hover:text-(--theme-text)">Dashboard</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-(--theme-text-muted)">Builder network</p>
          <h1 className="mt-3 text-4xl font-sans font-bold tracking-[-0.045em] sm:text-5xl text-(--theme-text)">Find people who want to ship.</h1>
          <p className="mt-4 text-base leading-7 text-(--theme-text-muted)">Discover builders by what they do, what they know, and how much time they can contribute.</p>
        </div>

        <section className="mt-8 rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5" aria-label="Builder filters">
          <label htmlFor="builder-search" className="sr-only">Search builders</label>
          <input
            id="builder-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 w-full rounded-md border border-(--theme-border) bg-(--theme-surface) px-4 text-sm text-(--theme-text) outline-none focus:border-(--theme-accent) focus:ring-2 focus:ring-(--theme-accent)/20"
            placeholder="Search builders, roles, colleges, or skills"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              aria-label="Primary role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className={filterClassName}
            >
              <option value="">All roles</option>
              {roles.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input
              aria-label="Skill"
              value={skill}
              onChange={(event) => setSkill(event.target.value)}
              className={filterClassName}
              placeholder="Skill"
            />
            <input
              aria-label="City"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className={filterClassName}
              placeholder="City"
            />
            <select
              aria-label="Experience level"
              value={experience}
              onChange={(event) => setExperience(event.target.value)}
              className={filterClassName}
            >
              <option value="">Any experience</option>
              {["beginner", "intermediate", "advanced"].map((item) => (
                <option key={item} value={item}>{humanize(item)}</option>
              ))}
            </select>
          </div>
        </section>

        {error ? (
          <p className="mt-6 rounded-md border border-(--theme-warn) bg-(--theme-warn-soft) px-4 py-3 text-sm text-(--theme-warn)" role="alert">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <p className="py-20 text-center text-sm font-mono text-(--theme-text-muted)" role="status">Loading builders...</p>
        ) : error ? (
          <div className="mt-6">
            <button type="button" className="button-secondary" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : filteredBuilders.length > 0 ? (
          <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Builders">
            {filteredBuilders.map((builder) => {
              const safeUsername = builder.username?.trim() || "anonymous";
              const safeFullName = builder.full_name?.trim() || safeUsername || "Anonymous Builder";
              const safeRole = builder.primary_role?.trim() || "Builder";
              const safeSkills = Array.isArray(builder.skills)
                ? builder.skills.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                : [];
              const safeExperience = humanize(builder.experience_level);

              return (
                <article key={builder.id} className="flex flex-col rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 transition hover:border-(--theme-text-muted)">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-mono uppercase tracking-[0.14em] text-(--theme-text-muted)">{safeExperience}</p>
                    {typeof builder.weekly_availability === "number" && !isNaN(builder.weekly_availability) && builder.weekly_availability >= 0 ? (
                      <span className="text-xs font-mono text-(--theme-text-muted)">{builder.weekly_availability}h/wk</span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-2xl font-sans font-semibold tracking-[-0.035em] text-(--theme-text)">
                    <Link href={`/profile/${encodeURIComponent(safeUsername)}`}>{safeFullName}</Link>
                  </h2>
                  <p className="mt-0.5 text-xs font-mono text-(--theme-text-muted)">@{safeUsername}</p>
                  <p className="mt-3 text-sm font-medium text-(--theme-text)">{safeRole}</p>
                  {builder.bio?.trim() ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-(--theme-text-muted)">{builder.bio.trim()}</p>
                  ) : (
                    <p className="mt-2 text-sm text-(--theme-text-muted) italic">No bio added yet.</p>
                  )}
                  {(builder.college?.trim() || builder.city?.trim()) ? (
                    <div className="mt-4 space-y-1 text-xs text-(--theme-text-muted)">
                      {builder.college?.trim() ? <p>{builder.college.trim()}</p> : null}
                      {builder.city?.trim() ? <p>{builder.city.trim()}</p> : null}
                    </div>
                  ) : null}
                  {safeSkills.length > 0 ? (
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {safeSkills.slice(0, 6).map((item, idx) => (
                        <li key={`${item.toLowerCase()}-${idx}`} className="chip-tag">{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-xs text-(--theme-text-muted)">No skills listed.</p>
                  )}
                  <div className="mt-auto pt-5">
                    <div className="flex items-center justify-between border-t border-dashed border-(--theme-border) pt-4">
                      <span className="text-xs font-mono text-(--theme-text-muted)">@{safeUsername}</span>
                      <Link
                        href={`/profile/${encodeURIComponent(safeUsername)}`}
                        className="action-link-secondary"
                      >
                        View profile →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <div className="mt-8 rounded-xl border border-dashed border-(--theme-border) bg-(--theme-surface) px-6 py-14 text-center">
            <h2 className="text-xl font-sans font-bold text-(--theme-text)">No builders match these filters.</h2>
            <p className="mt-2 text-sm text-(--theme-text-muted)">Try clearing filters to find more builders in the network.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setRole("");
                setSkill("");
                setCity("");
                setExperience("");
              }}
              className="mt-5 action-link-secondary"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
