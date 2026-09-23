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
  examples: string;
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
    description: "Find the right people to help bring your idea to life.",
  },
  {
    value: "want_something_to_build",
    label: "I want something to build",
    description: "Discover meaningful projects that need your skills.",
  },
  {
    value: "both",
    label: "Both",
    description: "Start your own ideas and contribute to other projects.",
  },
];

const inputClassName =
  "h-12 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 text-base text-[var(--theme-text)] outline-none transition placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/20";

const textareaClassName =
  "w-full resize-y rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 text-base text-[var(--theme-text)] outline-none transition placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/20";

function TagInput({
  id,
  label,
  placeholder,
  examples,
  values,
  onChange,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function addValue() {
    const nextValue = draft.trim().replace(/\s+/g, " ");

    if (!nextValue) {
      return;
    }

    const alreadyExists = values.some(
      (value) => value.toLocaleLowerCase() === nextValue.toLocaleLowerCase(),
    );

    if (!alreadyExists) {
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
      <p className="mt-2 text-xs leading-5 text-[var(--theme-text-muted)]">Press Enter or Add after each entry. Examples: {examples}</p>

      {values.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label={`${label} added`}>
          {values.map((value) => (
            <span
              key={value.toLocaleLowerCase()}
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

export default function OnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [college, setCollege] = useState("");
  const [city, setCity] = useState("");
  const [primaryRole, setPrimaryRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<
    ExperienceLevel | ""
  >("");
  const [weeklyAvailability, setWeeklyAvailability] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [builderMode, setBuilderMode] = useState<BuilderMode>("both");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    let shouldStopLoading = true;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        shouldStopLoading = false;
        router.replace("/login");
        router.refresh();
        return;
      }

      let profileRecord: ProfileRecord | null = null;
      const initialQuery = await supabase
        .from("profiles")
        .select(
          "full_name, username, bio, college, city, primary_role, experience_level, weekly_availability, portfolio_url, github_url, linkedin_url, instagram_url, skills, interests, builder_mode",
        )
        .eq("id", user.id)
        .maybeSingle();

      let error = initialQuery.error;

      if (error && isMissingColumnError(error, "instagram_url")) {
        const fallback = await supabase
          .from("profiles")
          .select(
            "full_name, username, bio, college, city, primary_role, experience_level, weekly_availability, portfolio_url, github_url, linkedin_url, skills, interests, builder_mode",
          )
          .eq("id", user.id)
          .maybeSingle();
        profileRecord = (fallback.data as ProfileRecord | null) ?? null;
        error = fallback.error;
      } else {
        profileRecord = (initialQuery.data as ProfileRecord | null) ?? null;
      }

      if (error) {
        setLoadError("We couldn't load your profile. Please try again.");
        return;
      }

      const profile = profileRecord;
      const metadataName =
        typeof user.user_metadata.full_name === "string"
          ? user.user_metadata.full_name
          : "";

      setFullName(profile?.full_name ?? metadataName);
      setUsername(profile?.username ?? "");
      setBio(profile?.bio ?? "");
      setCollege(profile?.college ?? "");
      setCity(profile?.city ?? "");
      setPrimaryRole(profile?.primary_role ?? "");
      setExperienceLevel(profile?.experience_level ?? "");
      setWeeklyAvailability(
        profile?.weekly_availability === null ||
          profile?.weekly_availability === undefined
          ? ""
          : String(profile.weekly_availability),
      );
      setSkills(profile?.skills ?? []);
      setInterests(profile?.interests ?? []);
      setBuilderMode(profile?.builder_mode ?? "both");
      setPortfolioUrl(profile?.portfolio_url ?? "");
      setGithubUrl(profile?.github_url ?? "");
      setLinkedinUrl(profile?.linkedin_url ?? "");
      setInstagramUrl(profile?.instagram_url ?? "");
    } catch {
      setLoadError("We couldn't load your profile. Please try again.");
    } finally {
      if (shouldStopLoading) {
        setIsLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const normalizedName = fullName.trim();
    const normalizedUsername = username.trim().toLowerCase();

    if (
      !normalizedName ||
      !normalizedUsername ||
      !primaryRole ||
      !experienceLevel ||
      !builderMode
    ) {
      setFormError("Complete all required fields before continuing.");
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setFormError(
        "Username must be 3–30 characters using only lowercase letters, numbers, and underscores.",
      );
      return;
    }

    const availability = weeklyAvailability.trim()
      ? Number(weeklyAvailability)
      : null;

    if (
      availability !== null &&
      (!Number.isInteger(availability) || availability < 0 || availability > 168)
    ) {
      setFormError("Weekly availability must be a whole number from 0 to 168.");
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
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const rateCheck = await enforceRateLimit("profile_update");
      if (!rateCheck.success) {
        setFormError(rateCheck.error ?? "You're doing that too fast — try again in a few minutes.");
        setIsSaving(false);
        return;
      }

      const profilePayload: Record<string, unknown> = {
        id: user.id,
        full_name: normalizedName,
        username: normalizedUsername,
        bio: bio.trim() || null,
        college: college.trim() || null,
        city: city.trim() || null,
        primary_role: primaryRole,
        experience_level: experienceLevel,
        weekly_availability: availability,
        portfolio_url: normalizedPortfolio || null,
        github_url: normalizedGithub || null,
        linkedin_url: normalizedLinkedin || null,
        instagram_url: normalizedInstagram || null,
        skills,
        interests,
        builder_mode: builderMode,
      };

      let { error } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (error && isMissingColumnError(error, "instagram_url")) {
        delete profilePayload.instagram_url;
        const retryResult = await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });
        error = retryResult.error;
      }

      if (error) {
        const duplicateUsername =
          error.code === "23505" ||
          error.message.toLocaleLowerCase().includes("username");

        setFormError(
          duplicateUsername
            ? "That username is already taken. Try another one."
            : "We couldn't save your profile. Please try again.",
        );
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setFormError("We couldn't save your profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
      <header className="border-b border-(--theme-border) bg-(--theme-bg)">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
            aria-label="Teamies"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <span className="chip-tag font-mono uppercase tracking-[0.14em]">
            Profile setup
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        {isLoading ? (
          <div
            className="rounded-xl border border-(--theme-border) bg-(--theme-surface) px-6 py-16 text-center"
            role="status"
          >
            <p className="text-sm font-mono text-(--theme-text-muted)">
              Loading your profile...
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-(--theme-warn) bg-(--theme-surface) px-6 py-12 text-center">
            <h1 className="text-2xl font-sans font-bold tracking-[-0.03em] text-(--theme-text)">
              We couldn&apos;t load your profile
            </h1>
            <p className="mt-3 text-sm leading-6 text-(--theme-warn)" role="alert">
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
            <div className="mb-10">
              <p className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-(--theme-text-muted)">
                Builder profile
              </p>
              <h1 className="text-balance text-4xl sm:text-5xl font-sans font-bold tracking-[-0.045em] text-(--theme-text)">
                Set up your builder profile
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-(--theme-text-muted) sm:text-lg">
                Tell other builders what you do, what you care about, and what
                you want to build.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold tracking-[-0.025em]">
                    The basics
                  </h2>
                  <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                    Help people recognize you and understand what you do.
                  </p>
                </div>

                <div className="space-y-5">
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
                      autoComplete="name"
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
                      autoComplete="username"
                      required
                      minLength={3}
                      maxLength={30}
                      pattern="[a-z0-9_]{3,30}"
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value.toLowerCase())
                      }
                      aria-describedby="username-hint"
                      className={inputClassName}
                      placeholder="your_username"
                    />
                    <p id="username-hint" className="mt-2 text-xs text-[var(--theme-text-muted)]">
                      Public profile: /profile/{username || "username"}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="bio"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Short bio
                    </label>
                    <textarea
                      id="bio"
                      name="bio"
                      rows={4}
                      maxLength={280}
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      className={textareaClassName}
                      placeholder="What do you build, and what are you curious about?"
                    />
                    <p className="mt-2 text-right text-xs text-[var(--theme-text-muted)]">
                      {bio.length}/280
                    </p>
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
                        autoComplete="address-level2"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        className={inputClassName}
                        placeholder="Where are you based?"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold tracking-[-0.025em]">
                    Your work
                  </h2>
                  <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                    Share your role, experience, and available time.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
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
                      Weekly availability
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
                      placeholder="Hours per week, for example 10"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-7 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.025em]">
                    Skills and interests
                  </h2>
                  <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                    Add what you can contribute and what you want to explore.
                  </p>
                </div>

                <TagInput
                  id="skill-input"
                  label="Skills"
                  placeholder="Add a skill"
                  examples="React, Python, Figma, Next.js, AI Agents"
                  values={skills}
                  onChange={setSkills}
                />

                <TagInput
                  id="interest-input"
                  label="Interests"
                  placeholder="Add an interest"
                  examples="AI, SaaS, Hackathons, Startups, FinTech, EdTech"
                  values={interests}
                  onChange={setInterests}
                />
              </section>

              <fieldset className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <legend className="px-1 text-xl font-semibold tracking-[-0.025em]">
                  What are you here to do? <span aria-hidden="true">*</span>
                </legend>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                  Choose the option that best describes what you need right now.
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

              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold tracking-[-0.025em]">
                    Links
                  </h2>
                  <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                    Optional links that help other builders understand your work.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
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
                      GitHub URL
                    </label>
                    <input
                      id="github-url"
                      name="githubUrl"
                      type="text"
                      value={githubUrl}
                      onChange={(event) => setGithubUrl(event.target.value)}
                      className={inputClassName}
                      placeholder="username or https://github.com/you"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="linkedin-url"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      LinkedIn URL
                    </label>
                    <input
                      id="linkedin-url"
                      name="linkedinUrl"
                      type="text"
                      value={linkedinUrl}
                      onChange={(event) => setLinkedinUrl(event.target.value)}
                      className={inputClassName}
                      placeholder="username or https://linkedin.com/in/you"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="instagram-url"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Instagram URL
                    </label>
                    <input
                      id="instagram-url"
                      name="instagramUrl"
                      type="text"
                      value={instagramUrl}
                      onChange={(event) => setInstagramUrl(event.target.value)}
                      className={inputClassName}
                      placeholder="@username or https://instagram.com/you"
                    />
                  </div>
                </div>
              </section>

              {formError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-[var(--theme-warn)]/40 bg-[var(--theme-warn-soft)] px-4 py-3 text-sm leading-6 text-[var(--theme-warn)]"
                >
                  {formError}
                </p>
              ) : null}

              <div className="flex justify-end pb-6">
                <button
                  type="submit"
                  disabled={isSaving}
                  aria-busy={isSaving}
                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--theme-text)] px-8 text-sm font-medium text-[var(--theme-bg)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {isSaving ? "Saving profile..." : "Complete profile"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
