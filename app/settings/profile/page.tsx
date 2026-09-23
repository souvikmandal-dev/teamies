"use client";

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeamiesLogo } from "@/components/teamies-logo";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { enforceRateLimit } from "@/app/actions/mutations";
import { LogoutButton } from "@/components/logout-button";
import {
  isValidSocialUrl,
  normalizeInstagramUrl,
  normalizeSocialUrl,
} from "@/lib/social-urls";
import { supabase } from "@/lib/supabase/client";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";

type ExperienceLevel = "beginner" | "intermediate" | "advanced";
type BuilderMode =
  | "have_something_to_build"
  | "want_something_to_build"
  | "both";

type ProfileRecord = {
  id: string;
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
  linkedin_url: string | null;
  instagram_url?: string | null;
  skills: string[] | null;
  interests: string[] | null;
  builder_mode: BuilderMode | null;
};

type TagInputProps = {
  id: string;
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
};

const primaryRoles = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "AI / ML",
  "Mobile Developer",
  "UI / UX Designer",
  "Product",
  "Marketing",
  "Video Editor",
  "Content Creator",
  "Founder / Builder",
  "Other",
];

const builderModes: Array<{
  value: BuilderMode;
  label: string;
  description: string;
}> = [
  {
    value: "have_something_to_build",
    label: "I have something to build",
    description: "Post your projects and assemble a team.",
  },
  {
    value: "want_something_to_build",
    label: "I want something to build",
    description: "Find active projects and contribute your skills.",
  },
  {
    value: "both",
    label: "Both",
    description: "Lead your own projects and collaborate with others.",
  },
];

const inputClassName =
  "h-12 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 text-base text-[var(--theme-text)] outline-none transition placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/20";

const textareaClassName =
  "w-full resize-y rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 text-base text-[var(--theme-text)] outline-none transition placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/20";

function TagInput({ id, label, placeholder, values, onChange }: TagInputProps) {
  const [draft, setDraft] = useState("");

  function addValue() {
    const nextValue = draft.trim().replace(/\s+/g, " ");
    if (!nextValue) return;

    const exists = values.some(
      (v) => v.toLowerCase() === nextValue.toLowerCase(),
    );
    if (!exists) {
      onChange([...values, nextValue]);
    }
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addValue();
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--theme-text)]">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          className={inputClassName}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={addValue}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-tag-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        >
          Add
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--theme-text-muted)]">Press Enter or Add after each entry.</p>

      {values.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value.toLowerCase()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-border)] bg-[var(--theme-tag-soft)] px-3 py-1.5 text-sm text-[var(--theme-text)]"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((item) => item !== value))}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--theme-text-muted)] transition-colors hover:bg-[var(--theme-border)] hover:text-[var(--theme-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] text-xs font-bold leading-none"
                aria-label={`Remove ${value}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ProfileSettingsPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [college, setCollege] = useState("");
  const [city, setCity] = useState("");
  const [primaryRole, setPrimaryRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | "">("");
  const [weeklyAvailability, setWeeklyAvailability] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [builderMode, setBuilderMode] = useState<BuilderMode>("both");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [hasInstagramColumn, setHasInstagramColumn] = useState<boolean | null>(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login?next=/settings/profile");
        return;
      }

      setUserId(user.id);

      let profileRecord: ProfileRecord | null = null;
      let supportsInstagram = true;

      const initialQuery = await supabase
        .from("profiles")
        .select(
          "id, full_name, username, bio, college, city, primary_role, experience_level, weekly_availability, portfolio_url, github_url, linkedin_url, instagram_url, skills, interests, builder_mode",
        )
        .eq("id", user.id)
        .maybeSingle();

      let error = initialQuery.error;

      if (error && isMissingColumnError(error, "instagram_url")) {
        supportsInstagram = false;
        const fallback = await supabase
          .from("profiles")
          .select(
            "id, full_name, username, bio, college, city, primary_role, experience_level, weekly_availability, portfolio_url, github_url, linkedin_url, skills, interests, builder_mode",
          )
          .eq("id", user.id)
          .maybeSingle();
        profileRecord = (fallback.data as ProfileRecord | null) ?? null;
        error = fallback.error;
      } else {
        profileRecord = (initialQuery.data as ProfileRecord | null) ?? null;
      }

      setHasInstagramColumn(supportsInstagram);

      if (error) {
        console.error("Profile load failed.");
        setLoadError("We couldn't load your profile. Please try again.");
        return;
      }

      const profile = profileRecord;
      if (profile) {
        setFullName(profile.full_name ?? "");
        setUsername(profile.username ?? "");
        setBio(profile.bio ?? "");
        setCollege(profile.college ?? "");
        setCity(profile.city ?? "");
        setPrimaryRole(profile.primary_role ?? "");
        setExperienceLevel(profile.experience_level ?? "");
        setWeeklyAvailability(
          profile.weekly_availability !== null &&
            profile.weekly_availability !== undefined
            ? String(profile.weekly_availability)
            : "",
        );
        setSkills(profile.skills ?? []);
        setInterests(profile.interests ?? []);
        setBuilderMode(profile.builder_mode ?? "both");
        setPortfolioUrl(profile.portfolio_url ?? "");
        setGithubUrl(profile.github_url ?? "");
        setLinkedinUrl(profile.linkedin_url ?? "");
        setInstagramUrl(profile.instagram_url ?? "");
      }
    } catch {
      console.error("Unexpected profile load failure.");
      setLoadError("We couldn't load your account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessNotice("");

    if (!userId) {
      router.replace("/login");
      return;
    }

    const normalizedName = fullName.trim();
    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedName) {
      setFormError("Full name is required.");
      return;
    }

    if (!normalizedUsername) {
      setFormError("Username is required.");
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setFormError(
        "Username must be 3–30 characters using only lowercase letters, numbers, and underscores.",
      );
      return;
    }

    if (!primaryRole) {
      setFormError("Please select a primary role.");
      return;
    }

    if (!experienceLevel) {
      setFormError("Please select an experience level.");
      return;
    }

    const availability = weeklyAvailability.trim()
      ? Number(weeklyAvailability)
      : null;

    if (
      availability !== null &&
      (!Number.isInteger(availability) ||
        availability < 0 ||
        availability > 168)
    ) {
      setFormError("Weekly availability must be a whole number between 0 and 168.");
      return;
    }

    const normalizedPortfolio = normalizeSocialUrl(portfolioUrl);
    const normalizedGithub = normalizeSocialUrl(githubUrl, "github.com");
    const normalizedLinkedin = normalizeSocialUrl(linkedinUrl, "linkedin.com/in");
    const normalizedInstagram = normalizeInstagramUrl(instagramUrl);

    if (portfolioUrl.trim() && !isValidSocialUrl(normalizedPortfolio)) {
      setFormError("Please enter a valid portfolio URL (e.g. https://yourportfolio.com).");
      return;
    }
    if (githubUrl.trim() && !isValidSocialUrl(normalizedGithub)) {
      setFormError("Please enter a valid GitHub username or URL.");
      return;
    }
    if (linkedinUrl.trim() && !isValidSocialUrl(normalizedLinkedin)) {
      setFormError("Please enter a valid LinkedIn profile or URL.");
      return;
    }
    if (instagramUrl.trim() && (!normalizedInstagram || !isValidSocialUrl(normalizedInstagram))) {
      setFormError(
        "Please enter a valid Instagram handle or URL (e.g. @username or https://instagram.com/username).",
      );
      return;
    }

    setIsSaving(true);

    try {
      const rateCheck = await enforceRateLimit("profile_update");
      if (!rateCheck.success) {
        setFormError(rateCheck.error ?? "You're doing that too fast — try again in a few minutes.");
        setIsSaving(false);
        return;
      }

      const basePayload: Record<string, unknown> = {
        id: userId,
        full_name: normalizedName,
        username: normalizedUsername,
        bio: bio.trim() || null,
        college: college.trim() || null,
        city: city.trim() || null,
        primary_role: primaryRole,
        experience_level: experienceLevel,
        weekly_availability: availability,
        skills,
        interests,
        builder_mode: builderMode,
        portfolio_url: normalizedPortfolio || null,
        github_url: normalizedGithub || null,
        linkedin_url: normalizedLinkedin || null,
      };

      const payloadWithInstagram = {
        ...basePayload,
        instagram_url: normalizedInstagram || null,
      };

      let saveResult = await supabase
        .from("profiles")
        .upsert(payloadWithInstagram, { onConflict: "id" })
        .select()
        .maybeSingle();

      // If saving failed due to missing instagram_url column in DB or PostgREST schema cache, retry without it
      if (
        saveResult.error &&
        isMissingColumnError(saveResult.error, "instagram_url")
      ) {

        setHasInstagramColumn(false);
        saveResult = await supabase
          .from("profiles")
          .upsert(basePayload, { onConflict: "id" })
          .select()
          .maybeSingle();
      }

      if (saveResult.error) {
        console.error("Profile save failed.");
        if (
          saveResult.error.code === "23505" ||
          saveResult.error.message.toLowerCase().includes("username")
        ) {
          setFormError("That username is already taken. Please choose another.");
        } else {
          setFormError(
              "We couldn't save your profile changes. Please try again.",
          );
        }
        return;
      }

      if (saveResult.data) {
        const saved = saveResult.data as ProfileRecord;
        setFullName(saved.full_name ?? "");
        setUsername(saved.username ?? "");
        setBio(saved.bio ?? "");
        setCollege(saved.college ?? "");
        setCity(saved.city ?? "");
        setPrimaryRole(saved.primary_role ?? "");
        setExperienceLevel(saved.experience_level ?? "");
        setWeeklyAvailability(
          saved.weekly_availability !== null &&
            saved.weekly_availability !== undefined
            ? String(saved.weekly_availability)
            : "",
        );
        setSkills(saved.skills ?? []);
        setInterests(saved.interests ?? []);
        setBuilderMode(saved.builder_mode ?? "both");
        setPortfolioUrl(saved.portfolio_url ?? "");
        setGithubUrl(saved.github_url ?? "");
        setLinkedinUrl(saved.linkedin_url ?? "");
        if (typeof saved.instagram_url === "string") {
          setInstagramUrl(saved.instagram_url);
        }
      }

      // Keep Supabase auth user_metadata full_name in sync
      void supabase.auth.updateUser({
        data: {
          full_name: normalizedName,
        },
      });

      setSuccessNotice("Profile updated successfully.");
      router.refresh();

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      console.error("Unexpected profile save failure.");
      setFormError("Something went wrong while saving your changes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
      <header className="border-b border-(--theme-border) bg-(--theme-bg)">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/dashboard"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
            aria-label="Teamies Dashboard"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link
              href="/dashboard"
              className="text-(--theme-text-muted) hover:text-(--theme-text)"
            >
              Dashboard
            </Link>
            {username ? (
              <Link
                href={`/profile/${encodeURIComponent(username)}`}
                className="text-(--theme-text-muted) hover:text-(--theme-text)"
              >
                View profile
              </Link>
            ) : null}
            <LogoutButton className="text-(--theme-text-muted) hover:text-(--theme-text)" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        {isLoading ? (
          <div
            className="rounded-xl border border-(--theme-border) bg-(--theme-surface) px-6 py-16 text-center"
            role="status"
          >
            <p className="text-sm font-mono text-(--theme-text-muted)">
              Loading your profile settings...
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-(--theme-warn) bg-(--theme-surface) px-6 py-12 text-center">
            <h1 className="text-2xl font-sans font-bold tracking-[-0.03em] text-(--theme-text)">
              We couldn&apos;t load your profile
            </h1>
            <p className="mt-3 text-sm text-(--theme-warn)" role="alert">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadProfile()}
              className="mt-6 button-primary"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="mb-4">
                <Link
                  href={username ? `/profile/${encodeURIComponent(username)}` : "/dashboard"}
                  className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.16em] text-[var(--theme-text-muted)] transition hover:text-[var(--theme-text)]"
                >
                  <span aria-hidden="true">←</span> Back to profile
                </Link>
              </div>
              <p className="text-xs font-mono uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                Account Settings
              </p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-sans font-bold tracking-[-0.04em] text-[var(--theme-text)]">
                Edit builder profile
              </h1>
              <p className="mt-3 text-base text-[var(--theme-text-muted)]">
                Keep your skills, availability, and builder profile up to date.
              </p>
            </div>

            {successNotice ? (
              <div
                className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[var(--theme-accent)]/30 bg-[var(--theme-accent-soft)] p-4 text-sm text-[var(--theme-text)]"
                role="status"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[var(--theme-accent)] font-bold text-base" aria-hidden="true">✓</span>
                  <span className="font-medium">{successNotice}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {username ? (
                    <Link
                      href={`/profile/${encodeURIComponent(username)}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--theme-accent)] underline underline-offset-4 hover:opacity-80"
                    >
                      View profile <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-2.5 py-1 text-xs font-medium text-[var(--theme-text)] transition hover:bg-[var(--theme-tag-soft)]"
                  >
                    Dashboard
                  </Link>
                </div>
              </div>
            ) : null}

            {formError ? (
              <div
                className="mb-6 rounded-xl border border-[var(--theme-warn)]/40 bg-[var(--theme-warn-soft)] p-4 text-sm text-[var(--theme-warn)]"
                role="alert"
              >
                {formError}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Identity & Basics */}
              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">
                  Personal details
                </h2>

                <div className="mt-6 space-y-5">
                  <div>
                    <label
                      htmlFor="full-name"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Full name <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="full-name"
                      name="fullName"
                      type="text"
                      required
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className={inputClassName}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="username"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Username <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      minLength={3}
                      maxLength={30}
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value.toLowerCase())
                      }
                      className={inputClassName}
                    />
                    <p className="mt-2 text-xs text-[var(--theme-text-muted)]">
                      Public profile URL: /profile/{username || "username"}
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label
                        htmlFor="bio"
                        className="text-sm font-medium text-[var(--theme-text)]"
                      >
                        Bio
                      </label>
                      <span className="text-xs text-[var(--theme-text-muted)]">
                        {bio.length}/280
                      </span>
                    </div>
                    <textarea
                      id="bio"
                      name="bio"
                      rows={4}
                      maxLength={280}
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      className={textareaClassName}
                      placeholder="What do you build, and what are you passionate about?"
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="college"
                        className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                      >
                        College / University
                      </label>
                      <input
                        id="college"
                        name="college"
                        type="text"
                        value={college}
                        onChange={(event) => setCollege(event.target.value)}
                        className={inputClassName}
                        placeholder="Your institution"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="city"
                        className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                      >
                        City
                      </label>
                      <input
                        id="city"
                        name="city"
                        type="text"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        className={inputClassName}
                        placeholder="Where are you based?"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Role & Availability */}
              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">
                  Role & Availability
                </h2>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="primary-role"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Primary role <span aria-hidden="true">*</span>
                    </label>
                    <select
                      id="primary-role"
                      name="primaryRole"
                      required
                      value={primaryRole}
                      onChange={(event) => setPrimaryRole(event.target.value)}
                      className={inputClassName}
                    >
                      <option value="">Select your role</option>
                      {primaryRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="experience-level"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Experience level <span aria-hidden="true">*</span>
                    </label>
                    <select
                      id="experience-level"
                      name="experienceLevel"
                      required
                      value={experienceLevel}
                      onChange={(event) =>
                        setExperienceLevel(event.target.value as ExperienceLevel)
                      }
                      className={inputClassName}
                    >
                      <option value="">Select your level</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="weekly-availability"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Weekly availability (hours/week)
                    </label>
                    <input
                      id="weekly-availability"
                      name="weeklyAvailability"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={168}
                      step={1}
                      value={weeklyAvailability}
                      onChange={(event) =>
                        setWeeklyAvailability(event.target.value)
                      }
                      className={inputClassName}
                      placeholder="e.g. 15"
                    />
                  </div>
                </div>
              </section>

              {/* Skills and Interests */}
              <section className="space-y-6 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">
                  Skills & Interests
                </h2>

                <TagInput
                  id="skills-field"
                  label="Skills"
                  placeholder="e.g. Next.js, TypeScript, PostgreSQL"
                  values={skills}
                  onChange={setSkills}
                />

                <TagInput
                  id="interests-field"
                  label="Interests"
                  placeholder="e.g. AI Agents, SaaS, FinTech"
                  values={interests}
                  onChange={setInterests}
                />
              </section>

              {/* Builder Mode */}
              <fieldset className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <legend className="px-1 text-xl font-semibold tracking-[-0.025em]">
                  Builder mode
                </legend>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                  Let builders know how you prefer to collaborate.
                </p>

                <div className="mt-6 grid gap-3">
                  {builderModes.map((mode) => {
                    const isSelected = builderMode === mode.value;

                    return (
                      <label
                        key={mode.value}
                        className={`flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-colors ${
                          isSelected
                            ? "border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] ring-1 ring-[var(--theme-accent)]"
                            : "border-[var(--theme-border)] bg-[var(--theme-surface)] hover:border-[var(--theme-text-muted)] hover:bg-[var(--theme-tag-soft)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="builderMode"
                          value={mode.value}
                          checked={isSelected}
                          onChange={() => setBuilderMode(mode.value)}
                          className="mt-1 h-4 w-4 shrink-0 accent-[var(--theme-accent)]"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[var(--theme-text)]">
                            {mode.label}
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-[var(--theme-text-muted)]">
                            {mode.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* External Links */}
              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <h2 className="text-xl font-semibold tracking-[-0.025em]">
                  Links
                </h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                  Add links to showcase your work and profiles.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="portfolio-url"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Portfolio or website
                    </label>
                    <input
                      id="portfolio-url"
                      name="portfolioUrl"
                      type="text"
                      value={portfolioUrl}
                      onChange={(event) => setPortfolioUrl(event.target.value)}
                      className={inputClassName}
                      placeholder="https://yourportfolio.com"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="github-url"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      GitHub profile
                    </label>
                    <input
                      id="github-url"
                      name="githubUrl"
                      type="text"
                      value={githubUrl}
                      onChange={(event) => setGithubUrl(event.target.value)}
                      className={inputClassName}
                      placeholder="username or https://github.com/username"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="linkedin-url"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      LinkedIn profile
                    </label>
                    <input
                      id="linkedin-url"
                      name="linkedinUrl"
                      type="text"
                      value={linkedinUrl}
                      onChange={(event) => setLinkedinUrl(event.target.value)}
                      className={inputClassName}
                      placeholder="username or https://linkedin.com/in/username"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="instagram-url"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Instagram profile
                    </label>
                    <input
                      id="instagram-url"
                      name="instagramUrl"
                      type="text"
                      value={instagramUrl}
                      onChange={(event) => setInstagramUrl(event.target.value)}
                      className={inputClassName}
                      placeholder="@username or https://instagram.com/username"
                    />
                  </div>
                </div>
              </section>

              {/* Action buttons */}
              <div className="flex items-center justify-between border-t border-[var(--theme-border)] pt-6">
                <Link
                  href={username ? `/profile/${encodeURIComponent(username)}` : "/dashboard"}
                  className="text-sm font-medium text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--theme-text)] px-8 text-sm font-medium text-[var(--theme-bg)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving changes..." : "Save changes"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

