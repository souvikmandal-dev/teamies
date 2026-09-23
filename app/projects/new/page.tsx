"use client";

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeamiesLogo } from "@/components/teamies-logo";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { enforceRateLimit } from "@/app/actions/mutations";
import { supabase } from "@/lib/supabase/client";

type ProjectType =
  | "startup"
  | "hackathon"
  | "portfolio"
  | "college"
  | "experimental"
  | "creative"
  | "other";

type ProjectStage = "idea" | "planning" | "building" | "mvp" | "launched";
type CollaborationType = "remote" | "local" | "hybrid";
type RoleExperience = "beginner" | "intermediate" | "advanced" | "any";

type ProfileRecord = {
  username: string | null;
  full_name: string | null;
  primary_role: string | null;
  experience_level: string | null;
  builder_mode: string | null;
};

type RoleDraft = {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  skillDraft: string;
  experienceLevel: RoleExperience;
  positions: string;
  weeklyCommitment: string;
};

type ProjectInsertResult = {
  id: string;
  slug: string;
};

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
};

const categories = [
  "AI",
  "SaaS",
  "Web",
  "Mobile",
  "FinTech",
  "EdTech",
  "Creator",
  "Film",
  "Hardware",
  "Other",
];

const projectTypes: Array<{ value: ProjectType; label: string }> = [
  { value: "startup", label: "Startup" },
  { value: "hackathon", label: "Hackathon" },
  { value: "portfolio", label: "Portfolio" },
  { value: "college", label: "College" },
  { value: "experimental", label: "Experimental" },
  { value: "creative", label: "Creative" },
  { value: "other", label: "Other" },
];

const projectStages: Array<{ value: ProjectStage; label: string }> = [
  { value: "idea", label: "Idea" },
  { value: "planning", label: "Planning" },
  { value: "building", label: "Building" },
  { value: "mvp", label: "MVP" },
  { value: "launched", label: "Launched" },
];

const collaborationTypes: Array<{
  value: CollaborationType;
  label: string;
}> = [
  { value: "remote", label: "Remote" },
  { value: "local", label: "Local" },
  { value: "hybrid", label: "Hybrid" },
];

const roleExperienceLevels: Array<{
  value: RoleExperience;
  label: string;
}> = [
  { value: "any", label: "Any experience level" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const inputClassName =
  "h-12 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 text-base text-[var(--theme-text)] outline-none transition placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/20";

const textareaClassName =
  "w-full resize-y rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 text-base text-[var(--theme-text)] outline-none transition placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/20";

function createEmptyRole(id: string): RoleDraft {
  return {
    id,
    title: "",
    description: "",
    requiredSkills: [],
    skillDraft: "",
    experienceLevel: "any",
    positions: "1",
    weeklyCommitment: "",
  };
}

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

function profileIsComplete(profile: ProfileRecord | null) {
  return Boolean(
    profile &&
      hasText(profile.username) &&
      hasText(profile.full_name) &&
      hasText(profile.primary_role) &&
      hasText(profile.experience_level) &&
      hasText(profile.builder_mode),
  );
}

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");

  return slug || "project";
}

function slugForAttempt(baseSlug: string, attempt: number) {
  if (attempt === 0) {
    return baseSlug;
  }

  const suffix = `-${attempt + 1}`;
  const availableLength = 120 - suffix.length;
  const prefix = baseSlug.slice(0, availableLength).replace(/-+$/g, "");

  return `${prefix}${suffix}`;
}

function isUniqueConflict(error: DatabaseError) {
  return error.code === "23505";
}

function parseOptionalInteger(value: string) {
  if (!value.trim()) {
    return null;
  }

  return Number(value);
}

export default function CreateProjectPage() {
  const router = useRouter();
  const nextRoleNumber = useRef(2);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("startup");
  const [stage, setStage] = useState<ProjectStage>("idea");
  const [collaborationType, setCollaborationType] =
    useState<CollaborationType>("remote");
  const [city, setCity] = useState("");
  const [duration, setDuration] = useState("");
  const [weeklyCommitment, setWeeklyCommitment] = useState("");
  const [maxTeamSize, setMaxTeamSize] = useState("5");
  const [goal, setGoal] = useState("");
  const [roles, setRoles] = useState<RoleDraft[]>(() => [
    createEmptyRole("role-1"),
  ]);

  const loadAccess = useCallback(async () => {
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

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "username, full_name, primary_role, experience_level, builder_mode",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setLoadError("We couldn't verify your builder profile. Please try again.");
        return;
      }

      if (!profileIsComplete(data as ProfileRecord | null)) {
        shouldStopLoading = false;
        router.replace("/onboarding");
        router.refresh();
      }
    } catch {
      setLoadError("We couldn't verify your account. Please try again.");
    } finally {
      if (shouldStopLoading) {
        setIsLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  function updateRole<Key extends keyof RoleDraft>(
    roleId: string,
    field: Key,
    value: RoleDraft[Key],
  ) {
    setRoles((currentRoles) =>
      currentRoles.map((role) =>
        role.id === roleId ? { ...role, [field]: value } : role,
      ),
    );
  }

  function addRole() {
    const roleId = `role-${nextRoleNumber.current}`;
    nextRoleNumber.current += 1;
    setRoles((currentRoles) => [...currentRoles, createEmptyRole(roleId)]);
  }

  function removeRole(roleId: string) {
    setRoles((currentRoles) => {
      if (currentRoles.length === 1) {
        return currentRoles;
      }

      return currentRoles.filter((role) => role.id !== roleId);
    });
  }

  function addSkill(roleId: string) {
    setRoles((currentRoles) =>
      currentRoles.map((role) => {
        if (role.id !== roleId) {
          return role;
        }

        const skill = role.skillDraft.trim().replace(/\s+/g, " ");

        if (!skill) {
          return role;
        }

        const alreadyAdded = role.requiredSkills.some(
          (existingSkill) =>
            existingSkill.toLocaleLowerCase() === skill.toLocaleLowerCase(),
        );

        return {
          ...role,
          requiredSkills: alreadyAdded
            ? role.requiredSkills
            : [...role.requiredSkills, skill],
          skillDraft: "",
        };
      }),
    );
  }

  function handleSkillKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    roleId: string,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      addSkill(roleId);
    }
  }

  function removeSkill(roleId: string, skillToRemove: string) {
    setRoles((currentRoles) =>
      currentRoles.map((role) =>
        role.id === roleId
          ? {
              ...role,
              requiredSkills: role.requiredSkills.filter(
                (skill) => skill !== skillToRemove,
              ),
            }
          : role,
      ),
    );
  }

  function validateForm() {
    const normalizedName = name.trim();
    const normalizedShortDescription = shortDescription.trim();
    const normalizedDescription = description.trim();
    const normalizedCity = city.trim();
    const normalizedDuration = duration.trim();
    const normalizedGoal = goal.trim();

    if (normalizedName.length < 3 || normalizedName.length > 100) {
      return "Project name must be between 3 and 100 characters.";
    }

    if (
      normalizedShortDescription.length < 10 ||
      normalizedShortDescription.length > 240
    ) {
      return "Short description must be between 10 and 240 characters.";
    }

    if (normalizedDescription.length > 10000) {
      return "Full description must be 10,000 characters or fewer.";
    }

    if (!category) {
      return "Choose a project category.";
    }

    if (collaborationType !== "remote" && normalizedCity.length > 100) {
      return "City must be 100 characters or fewer.";
    }

    if (normalizedDuration.length > 100) {
      return "Duration must be 100 characters or fewer.";
    }

    if (normalizedGoal.length > 500) {
      return "Goal must be 500 characters or fewer.";
    }

    const projectHours = parseOptionalInteger(weeklyCommitment);

    if (
      projectHours !== null &&
      (!Number.isInteger(projectHours) || projectHours < 0 || projectHours > 168)
    ) {
      return "Project weekly commitment must be a whole number from 0 to 168.";
    }

    const teamSize = Number(maxTeamSize);

    if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 50) {
      return "Maximum team size must be a whole number from 1 to 50.";
    }

    if (roles.length === 0) {
      return "Please add at least one role.";
    }

    for (let index = 0; index < roles.length; index += 1) {
      const role = roles[index];
      const roleNumber = index + 1;
      const normalizedTitle = role.title.trim();
      const normalizedRoleDescription = role.description.trim();
      const positions = Number(role.positions);
      const roleHours = parseOptionalInteger(role.weeklyCommitment);

      if (normalizedTitle.length < 2 || normalizedTitle.length > 80) {
        return `Role ${roleNumber} title must be between 2 and 80 characters.`;
      }

      if (normalizedRoleDescription.length > 2000) {
        return `Role ${roleNumber} description must be 2,000 characters or fewer.`;
      }

      if (!Number.isInteger(positions) || positions < 1 || positions > 20) {
        return `Role ${roleNumber} positions must be a whole number from 1 to 20.`;
      }

      if (
        roleHours !== null &&
        (!Number.isInteger(roleHours) || roleHours < 0 || roleHours > 168)
      ) {
        return `Role ${roleNumber} weekly commitment must be a whole number from 0 to 168.`;
      }
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError("");
    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);

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

      const rateCheck = await enforceRateLimit("project_create");
      if (!rateCheck.success) {
        setFormError(rateCheck.error ?? "You're doing that too fast — try again in a few minutes.");
        setIsSubmitting(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "username, full_name, primary_role, experience_level, builder_mode",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setFormError("We couldn't verify your builder profile. Please try again.");
        return;
      }

      if (!profileIsComplete(profileData as ProfileRecord | null)) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }

      const baseSlug = slugify(name);
      let createdProject: ProjectInsertResult | null = null;
      let projectInsertError: DatabaseError | null = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = slugForAttempt(baseSlug, attempt);
        const { data, error } = await supabase
          .from("projects")
          .insert({
            owner_id: user.id,
            name: name.trim(),
            slug,
            short_description: shortDescription.trim(),
            description: description.trim() || null,
            category,
            project_type: projectType,
            stage,
            collaboration_type: collaborationType,
            city:
              collaborationType === "remote" ? null : city.trim() || null,
            duration: duration.trim() || null,
            weekly_commitment: parseOptionalInteger(weeklyCommitment),
            max_team_size: Number(maxTeamSize),
            goal: goal.trim() || null,
          })
          .select("id, slug")
          .single();

        if (!error && data) {
          createdProject = data as ProjectInsertResult;
          projectInsertError = null;
          break;
        }

        projectInsertError = error
          ? (error as DatabaseError)
          : { message: "Project creation returned no result." };

        if (!isUniqueConflict(projectInsertError)) {
          break;
        }
      }

      if (!createdProject) {
        setFormError(
          projectInsertError && isUniqueConflict(projectInsertError)
            ? "That project name is already in use. Try a slightly different name."
            : "Something went wrong while creating the project. Please try again.",
        );
        return;
      }

      const roleRows = roles.map((role) => ({
        project_id: createdProject.id,
        title: role.title.trim(),
        description: role.description.trim() || null,
        required_skills: role.requiredSkills,
        experience_level: role.experienceLevel,
        positions: Number(role.positions),
        weekly_commitment: parseOptionalInteger(role.weeklyCommitment),
      }));

      const { error: rolesError } = await supabase
        .from("project_roles")
        .insert(roleRows);

      if (rolesError) {
        let rolledBack = false;
        const { data: rpcRolledBack, error: rollbackError } = await supabase.rpc("delete_project_confirmed", {
          p_project_id: createdProject.id,
          p_confirmed_name: name.trim(),
        });

        if (!rollbackError && rpcRolledBack === true) {
          rolledBack = true;
        } else {
          const { error: directDeleteErr } = await supabase
            .from("projects")
            .delete()
            .eq("id", createdProject.id);
          if (!directDeleteErr) rolledBack = true;
        }

        setFormError(
          !rolledBack
            ? "The project was created, but its roles could not be saved and automatic cleanup failed. Please do not submit again until you review the project."
            : "We couldn't save the project roles, so the project was not published. Please try again.",
        );
        return;
      }

      router.push(`/projects/${createdProject.id}`);
      router.refresh();
    } catch {
      setFormError("Something went wrong while creating the project. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
      <header className="border-b border-(--theme-border) bg-(--theme-bg)">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link
            href="/dashboard"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
            aria-label="Teamies Dashboard"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-(--theme-text-muted) transition-colors hover:text-(--theme-text)"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        {isLoading ? (
          <div
            className="rounded-xl border border-(--theme-border) bg-(--theme-surface) px-6 py-16 text-center"
            role="status"
          >
            <p className="text-sm font-mono text-(--theme-text-muted)">
              Preparing your project workspace...
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-(--theme-warn) bg-(--theme-surface) px-6 py-12 text-center">
            <h1 className="text-2xl font-sans font-bold tracking-[-0.03em] text-(--theme-text)">
              We couldn&apos;t open the project form
            </h1>
            <p className="mt-3 text-sm leading-6 text-(--theme-warn)" role="alert">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadAccess()}
              className="mt-6 button-primary"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="mb-10 max-w-3xl">
              <p className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-(--theme-text-muted)">
                Start building
              </p>
              <h1 className="text-balance text-4xl sm:text-5xl font-sans font-bold tracking-[-0.045em] text-(--theme-text)">
                Create a project
              </h1>
              <p className="mt-4 text-base leading-7 text-(--theme-text-muted) sm:text-lg">
                Tell builders what you&apos;re making and who you need to help
                ship it.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <div className="mb-7">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                    01 · Project basics
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    What are you building?
                  </h2>
                </div>

                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="project-name"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Project name <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="project-name"
                      name="projectName"
                      type="text"
                      required
                      minLength={3}
                      maxLength={100}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClassName}
                      placeholder="AI Study Assistant"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <label
                        htmlFor="short-description"
                        className="text-sm font-medium text-[var(--theme-text)]"
                      >
                        Short description <span aria-hidden="true">*</span>
                      </label>
                      <span className="text-xs text-[var(--theme-text-muted)]">
                        {shortDescription.length}/240
                      </span>
                    </div>
                    <textarea
                      id="short-description"
                      name="shortDescription"
                      rows={3}
                      required
                      minLength={10}
                      maxLength={240}
                      value={shortDescription}
                      onChange={(event) =>
                        setShortDescription(event.target.value)
                      }
                      className={textareaClassName}
                      placeholder="An AI study companion that turns notes into summaries, quizzes, and revision plans."
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <label
                        htmlFor="description"
                        className="text-sm font-medium text-[var(--theme-text)]"
                      >
                        Full description
                      </label>
                      <span className="text-xs text-[var(--theme-text-muted)]">
                        {description.length}/10,000
                      </span>
                    </div>
                    <textarea
                      id="description"
                      name="description"
                      rows={7}
                      maxLength={10000}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className={textareaClassName}
                      placeholder="Explain what the project does, the problem it solves, and where it stands today."
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="category"
                        className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                      >
                        Category <span aria-hidden="true">*</span>
                      </label>
                      <select
                        id="category"
                        name="category"
                        required
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className={inputClassName}
                      >
                        <option value="">Choose a category</option>
                        {categories.map((categoryOption) => (
                          <option key={categoryOption} value={categoryOption}>
                            {categoryOption}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="project-type"
                        className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                      >
                        Project type <span aria-hidden="true">*</span>
                      </label>
                      <select
                        id="project-type"
                        name="projectType"
                        required
                        value={projectType}
                        onChange={(event) =>
                          setProjectType(event.target.value as ProjectType)
                        }
                        className={inputClassName}
                      >
                        {projectTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <div className="mb-7">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                    02 · Collaboration details
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    Set clear expectations
                  </h2>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="stage"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Current stage <span aria-hidden="true">*</span>
                    </label>
                    <select
                      id="stage"
                      name="stage"
                      required
                      value={stage}
                      onChange={(event) =>
                        setStage(event.target.value as ProjectStage)
                      }
                      className={inputClassName}
                    >
                      {projectStages.map((stageOption) => (
                        <option key={stageOption.value} value={stageOption.value}>
                          {stageOption.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="collaboration-type"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Collaboration type <span aria-hidden="true">*</span>
                    </label>
                    <select
                      id="collaboration-type"
                      name="collaborationType"
                      required
                      value={collaborationType}
                      onChange={(event) =>
                        setCollaborationType(
                          event.target.value as CollaborationType,
                        )
                      }
                      className={inputClassName}
                    >
                      {collaborationTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {collaborationType !== "remote" ? (
                    <div className="sm:col-span-2">
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
                        maxLength={100}
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        className={inputClassName}
                        placeholder="Where will the team meet?"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="duration"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Duration
                    </label>
                    <input
                      id="duration"
                      name="duration"
                      type="text"
                      maxLength={100}
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      className={inputClassName}
                      placeholder="For example, 6 weeks or ongoing"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="weekly-commitment"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Weekly commitment
                    </label>
                    <input
                      id="weekly-commitment"
                      name="weeklyCommitment"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={168}
                      step={1}
                      value={weeklyCommitment}
                      onChange={(event) =>
                        setWeeklyCommitment(event.target.value)
                      }
                      className={inputClassName}
                      placeholder="Hours per week"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="max-team-size"
                      className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                    >
                      Maximum team size <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="max-team-size"
                      name="maxTeamSize"
                      type="number"
                      inputMode="numeric"
                      required
                      min={1}
                      max={50}
                      step={1}
                      value={maxTeamSize}
                      onChange={(event) => setMaxTeamSize(event.target.value)}
                      className={inputClassName}
                    />
                    <p className="mt-2 text-xs text-[var(--theme-text-muted)]">
                      You count as one member of the team.
                    </p>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <label
                        htmlFor="goal"
                        className="text-sm font-medium text-[var(--theme-text)]"
                      >
                        Project goal
                      </label>
                      <span className="text-xs text-[var(--theme-text-muted)]">
                        {goal.length}/500
                      </span>
                    </div>
                    <textarea
                      id="goal"
                      name="goal"
                      rows={3}
                      maxLength={500}
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                      className={textareaClassName}
                      placeholder="Build and launch a working MVP within 6 weeks."
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                      03 · Open roles
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                      Who do you need?
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--theme-text-muted)]">
                      Add at least one role so builders know how they can help.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addRole}
                    className="inline-flex h-11 w-fit items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-tag-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                  >
                    + Add another role
                  </button>
                </div>

                <div className="space-y-5">
                  {roles.map((role, index) => (
                    <fieldset
                      key={role.id}
                      className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-5 sm:p-6"
                    >
                      <legend className="sr-only">Role {index + 1}</legend>
                      <div className="mb-6 flex items-center justify-between gap-4">
                        <h3 className="text-lg font-semibold tracking-[-0.025em]">
                          Role {index + 1}
                        </h3>
                        <button
                          type="button"
                          onClick={() => removeRole(role.id)}
                          disabled={roles.length === 1}
                          className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--theme-text-muted)] transition-colors hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Remove role ${index + 1}`}
                          title={
                            roles.length === 1
                              ? "A project needs at least one role"
                              : undefined
                          }
                        >
                          Remove
                        </button>
                      </div>

                      <div className="space-y-5">
                        <div>
                          <label
                            htmlFor={`${role.id}-title`}
                            className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                          >
                            Role title <span aria-hidden="true">*</span>
                          </label>
                          <input
                            id={`${role.id}-title`}
                            type="text"
                            required
                            minLength={2}
                            maxLength={80}
                            value={role.title}
                            onChange={(event) =>
                              updateRole(role.id, "title", event.target.value)
                            }
                            className={inputClassName}
                            placeholder="Frontend Developer"
                          />
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <label
                              htmlFor={`${role.id}-description`}
                              className="text-sm font-medium text-[var(--theme-text)]"
                            >
                              Role description
                            </label>
                            <span className="text-xs text-[var(--theme-text-muted)]">
                              {role.description.length}/2,000
                            </span>
                          </div>
                          <textarea
                            id={`${role.id}-description`}
                            rows={4}
                            maxLength={2000}
                            value={role.description}
                            onChange={(event) =>
                              updateRole(
                                role.id,
                                "description",
                                event.target.value,
                              )
                            }
                            className={textareaClassName}
                            placeholder="Explain what this person will own and contribute."
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`${role.id}-skill`}
                            className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                          >
                            Required skills
                          </label>
                          <div className="flex gap-2">
                            <input
                              id={`${role.id}-skill`}
                              type="text"
                              value={role.skillDraft}
                              onChange={(event) =>
                                updateRole(
                                  role.id,
                                  "skillDraft",
                                  event.target.value,
                                )
                              }
                              onKeyDown={(event) =>
                                handleSkillKeyDown(event, role.id)
                              }
                              className={inputClassName}
                              placeholder="React, Figma, Python..."
                            />
                            <button
                              type="button"
                              onClick={() => addSkill(role.id)}
                              className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-tag-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                            >
                              Add
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-[var(--theme-text-muted)]">
                            Press Enter or Add after each skill.
                          </p>

                          {role.requiredSkills.length > 0 ? (
                            <ul
                              className="mt-4 flex flex-wrap gap-2"
                              aria-label={`Required skills for role ${index + 1}`}
                            >
                              {role.requiredSkills.map((skill) => (
                                <li
                                  key={skill.toLocaleLowerCase()}
                                  className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-tag-soft)] px-3 py-1.5 text-sm text-[var(--theme-text)]"
                                >
                                  {skill}
                                  <button
                                    type="button"
                                    onClick={() => removeSkill(role.id, skill)}
                                    className="rounded-full text-[var(--theme-text-muted)] transition-colors hover:text-[var(--theme-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                                    aria-label={`Remove ${skill}`}
                                  >
                                    ×
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>

                        <div className="grid gap-5 sm:grid-cols-3">
                          <div>
                            <label
                              htmlFor={`${role.id}-experience`}
                              className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                            >
                              Experience
                            </label>
                            <select
                              id={`${role.id}-experience`}
                              value={role.experienceLevel}
                              onChange={(event) =>
                                updateRole(
                                  role.id,
                                  "experienceLevel",
                                  event.target.value as RoleExperience,
                                )
                              }
                              className={inputClassName}
                            >
                              {roleExperienceLevels.map((level) => (
                                <option key={level.value} value={level.value}>
                                  {level.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor={`${role.id}-positions`}
                              className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                            >
                              Positions <span aria-hidden="true">*</span>
                            </label>
                            <input
                              id={`${role.id}-positions`}
                              type="number"
                              inputMode="numeric"
                              required
                              min={1}
                              max={20}
                              step={1}
                              value={role.positions}
                              onChange={(event) =>
                                updateRole(
                                  role.id,
                                  "positions",
                                  event.target.value,
                                )
                              }
                              className={inputClassName}
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`${role.id}-commitment`}
                              className="mb-2 block text-sm font-medium text-[var(--theme-text)]"
                            >
                              Hours / week
                            </label>
                            <input
                              id={`${role.id}-commitment`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={168}
                              step={1}
                              value={role.weeklyCommitment}
                              onChange={(event) =>
                                updateRole(
                                  role.id,
                                  "weeklyCommitment",
                                  event.target.value,
                                )
                              }
                              className={inputClassName}
                              placeholder="Optional"
                            />
                          </div>
                        </div>
                      </div>
                    </fieldset>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 sm:p-8">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
                  04 · Review
                </p>
                <div className="mt-3 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-2xl">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                      Ready to find your team?
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--theme-text-muted)]">
                      Your project and open roles will be available for builders
                      to discover. Review your details before publishing.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-12 w-full shrink-0 items-center justify-center rounded-full bg-[var(--theme-text)] px-7 text-sm font-medium text-[var(--theme-bg)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {isSubmitting ? "Creating project..." : "Create project"}
                  </button>
                </div>

                {formError ? (
                  <p
                    className="mt-5 rounded-xl border border-[var(--theme-warn)]/40 bg-[var(--theme-warn-soft)] px-4 py-3 text-sm leading-6 text-[var(--theme-warn)]"
                    role="alert"
                  >
                    {formError}
                  </p>
                ) : null}
              </section>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
