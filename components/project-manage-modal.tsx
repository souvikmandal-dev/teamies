"use client";

import { useState } from "react";
import {
  updateProjectDetails,
  updateRecruitingStatus,
  updateProjectLifecycle,
  deleteProjectPermanently,
  addProjectRole,
  updateProjectRole,
  toggleProjectRoleStatus,
  changeMemberRoleAction,
  removeMemberAction,
  updateTeamHandoffAction,
} from "@/app/actions/project-management";
import { isValidSocialUrl } from "@/lib/social-urls";

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

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  primary_role: string | null;
  skills: string[] | null;
};

interface ProjectManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  roles: ProjectRole[];
  members: ProjectMember[];
  profiles: Record<string, Profile>;
  occupancyByRole: Record<string, number>;
  onProjectUpdated: () => Promise<void>;
  onProjectDeleted: () => void;
}

const inputClassName =
  "h-10 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm text-[var(--theme-text)] outline-none transition focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]";

const textareaClassName =
  "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none transition focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]";

export function ProjectManageModal({
  isOpen,
  onClose,
  project,
  roles,
  members,
  profiles,
  occupancyByRole,
  onProjectUpdated,
  onProjectDeleted,
}: ProjectManageModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "roles" | "team" | "danger">("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState("");

  // Details form state
  const [name, setName] = useState(project.name);
  const [shortDesc, setShortDesc] = useState(project.short_description);
  const [desc, setDesc] = useState(project.description || "");
  const [category, setCategory] = useState(project.category);
  const [stage, setStage] = useState(project.stage);
  const [collabType, setCollabType] = useState(project.collaboration_type);
  const [city, setCity] = useState(project.city || "");
  const [duration, setDuration] = useState(project.duration || "");
  const [weeklyCommitment, setWeeklyCommitment] = useState<number | "">(project.weekly_commitment ?? "");
  const [maxTeamSize, setMaxTeamSize] = useState<number>(project.max_team_size);

  // New role state
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleTitle, setNewRoleTitle] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleSkills, setNewRoleSkills] = useState("");
  const [newRoleExperience, setNewRoleExperience] = useState("any");
  const [newRolePositions, setNewRolePositions] = useState(1);
  const [newRoleCommitment, setNewRoleCommitment] = useState<number | "">("");

  // Editing role state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleTitle, setEditRoleTitle] = useState("");
  const [editRoleDesc, setEditRoleDesc] = useState("");
  const [editRoleSkills, setEditRoleSkills] = useState("");
  const [editRoleExperience, setEditRoleExperience] = useState("any");
  const [editRolePositions, setEditRolePositions] = useState(1);

  // Team handoff state
  const [teamLink, setTeamLink] = useState(project.team_link || "");
  const [nextSteps, setNextSteps] = useState(project.next_steps || "");

  // Member removal confirmation
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null);

  // Delete project confirmation
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  if (!isOpen) return null;

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const res = await updateProjectDetails(project.id, {
      name,
      short_description: shortDesc,
      description: desc.trim() || null,
      category,
      stage,
      collaboration_type: collabType,
      city: city.trim() || null,
      duration: duration.trim() || null,
      weekly_commitment: weeklyCommitment === "" ? null : Number(weeklyCommitment),
      max_team_size: Number(maxTeamSize),
    });

    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to update project details.");
    } else {
      setFeedbackNotice("Project details updated successfully.");
      await onProjectUpdated();
    }
  }

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const skills = newRoleSkills.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await addProjectRole(project.id, {
      title: newRoleTitle,
      description: newRoleDesc.trim() || null,
      required_skills: skills,
      experience_level: newRoleExperience,
      positions: Number(newRolePositions),
      weekly_commitment: newRoleCommitment === "" ? null : Number(newRoleCommitment),
    });

    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to add role.");
    } else {
      setFeedbackNotice("Role added successfully.");
      setShowAddRole(false);
      setNewRoleTitle("");
      setNewRoleDesc("");
      setNewRoleSkills("");
      setNewRolePositions(1);
      setNewRoleCommitment("");
      await onProjectUpdated();
    }
  }

  async function handleUpdateRole(roleId: string, e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const skills = editRoleSkills.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await updateProjectRole(project.id, roleId, {
      title: editRoleTitle,
      description: editRoleDesc.trim() || null,
      required_skills: skills,
      experience_level: editRoleExperience,
      positions: Number(editRolePositions),
    });

    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to update role.");
    } else {
      setFeedbackNotice("Role updated successfully.");
      setEditingRoleId(null);
      await onProjectUpdated();
    }
  }

  async function handleToggleRoleStatus(role: ProjectRole) {
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const newStatus = role.status === "open" ? "closed" : "open";
    const res = await toggleProjectRoleStatus(project.id, role.id, newStatus);
    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to update role status.");
    } else {
      setFeedbackNotice(`Role ${newStatus === "open" ? "reopened" : "closed"}.`);
      await onProjectUpdated();
    }
  }

  async function handleChangeMemberRole(memberId: string, newRoleId: string) {
    if (!newRoleId) return;
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const res = await changeMemberRoleAction(project.id, memberId, newRoleId);
    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to reassign role.");
    } else {
      setFeedbackNotice("Member role reassigned successfully.");
      await onProjectUpdated();
    }
  }

  async function handleRemoveMember(memberId: string) {
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const res = await removeMemberAction(project.id, memberId);
    setIsSubmitting(false);
    setConfirmRemoveMemberId(null);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to remove member.");
    } else {
      setFeedbackNotice("Member removed from project.");
      await onProjectUpdated();
    }
  }

  async function handleSaveTeamHandoff(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackError("");
    setFeedbackNotice("");

    if (teamLink.trim() && !isValidSocialUrl(teamLink.trim())) {
      setFeedbackError("Please enter a valid HTTP or HTTPS URL for the team link.");
      return;
    }

    setIsSubmitting(true);

    const res = await updateTeamHandoffAction(project.id, {
      team_link: teamLink,
      next_steps: nextSteps,
    });

    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to update team handoff.");
    } else {
      setFeedbackNotice("Team workspace instructions saved.");
      await onProjectUpdated();
    }
  }

  async function handleToggleRecruiting() {
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const current = project.recruiting_status || "open";
    const newStatus = current === "paused" ? "open" : "paused";
    const res = await updateRecruitingStatus(project.id, newStatus);
    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to update recruiting status.");
    } else {
      setFeedbackNotice(newStatus === "paused" ? "Recruiting paused." : "Recruiting resumed.");
      await onProjectUpdated();
    }
  }

  async function handleUpdateLifecycle(status: "active" | "completed" | "cancelled" | "archived") {
    setIsSubmitting(true);
    setFeedbackError("");
    setFeedbackNotice("");

    const res = await updateProjectLifecycle(project.id, status);
    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to update project status.");
    } else {
      setFeedbackNotice(`Project marked as ${status}.`);
      await onProjectUpdated();
    }
  }

  async function handleDeleteProject() {
    if (deleteConfirmText.trim().toLowerCase() !== project.name.trim().toLowerCase()) {
      setFeedbackError("Project name confirmation does not match.");
      return;
    }

    setIsSubmitting(true);
    setFeedbackError("");
    const res = await deleteProjectPermanently(project.id, deleteConfirmText);
    setIsSubmitting(false);
    if (!res.success) {
      setFeedbackError(res.error || "Failed to delete project.");
    } else {
      onClose();
      onProjectDeleted();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl my-8 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-6 py-4 bg-[var(--theme-bg)]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--theme-text-muted)]">
              Owner Controls
            </p>
            <h2 className="text-xl font-sans font-bold tracking-tight text-[var(--theme-text)]">
              Manage {project.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text)] transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--theme-border)] bg-[var(--theme-bg)] px-6 text-sm font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`border-b-2 py-3 px-3 transition whitespace-nowrap ${
              activeTab === "details"
                ? "border-[var(--theme-accent)] text-[var(--theme-accent)] font-semibold"
                : "border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            Project Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`border-b-2 py-3 px-3 transition whitespace-nowrap ${
              activeTab === "roles"
                ? "border-[var(--theme-accent)] text-[var(--theme-accent)] font-semibold"
                : "border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            Roles & Seats ({roles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("team")}
            className={`border-b-2 py-3 px-3 transition whitespace-nowrap ${
              activeTab === "team"
                ? "border-[var(--theme-accent)] text-[var(--theme-accent)] font-semibold"
                : "border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            Team & Workspace ({members.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("danger")}
            className={`border-b-2 py-3 px-3 transition whitespace-nowrap ${
              activeTab === "danger"
                ? "border-[var(--theme-warn)] text-[var(--theme-warn)] font-semibold"
                : "border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            }`}
          >
            Status & Lifecycle
          </button>
        </div>

        {/* Feedback alerts */}
        {feedbackError ? (
          <div className="mx-6 mt-4 rounded-md border border-[var(--theme-warn)] bg-[var(--theme-warn-soft)] px-4 py-2.5 text-xs text-[var(--theme-warn)]" role="alert">
            {feedbackError}
          </div>
        ) : null}
        {feedbackNotice ? (
          <div className="mx-6 mt-4 rounded-md border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] px-4 py-2.5 text-xs text-[var(--theme-accent)]" role="status">
            {feedbackNotice}
          </div>
        ) : null}

        {/* Tab Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* TAB 1: DETAILS */}
          {activeTab === "details" && (
            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClassName}
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                  Short Description
                </label>
                <input
                  type="text"
                  required
                  minLength={10}
                  maxLength={240}
                  value={shortDesc}
                  onChange={(e) => setShortDesc(e.target.value)}
                  className={inputClassName}
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                  Full Description
                </label>
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className={textareaClassName}
                  placeholder="Detailed breakdown of what you're making, tech stack, and roadmap."
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                    Stage
                  </label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="idea">Idea</option>
                    <option value="planning">Planning</option>
                    <option value="building">Building</option>
                    <option value="mvp">MVP</option>
                    <option value="launched">Launched</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                    Collaboration
                  </label>
                  <select
                    value={collabType}
                    onChange={(e) => setCollabType(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="remote">Remote</option>
                    <option value="local">Local</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                    City (if local/hybrid)
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 3 months"
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                    Weekly Commitment (hrs/wk)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={168}
                    value={weeklyCommitment}
                    onChange={(e) => setWeeklyCommitment(e.target.value === "" ? "" : Number(e.target.value))}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                    Maximum Team Size
                  </label>
                  <input
                    type="number"
                    required
                    min={Math.max(1, members.length + 1)}
                    max={50}
                    value={maxTeamSize}
                    onChange={(e) => setMaxTeamSize(Number(e.target.value))}
                    className={inputClassName}
                  />
                  <p className="mt-1 text-[11px] font-mono text-[var(--theme-text-muted)]">
                    Current active team: {members.length + 1} (including owner)
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--theme-border)] flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="button-primary"
                >
                  {isSubmitting ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: ROLES */}
          {activeTab === "roles" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--theme-text-muted)]">
                  Manage the roles builders can apply for in your project.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddRole(!showAddRole)}
                  className="action-link-secondary text-xs"
                >
                  {showAddRole ? "Cancel" : "+ Add new role"}
                </button>
              </div>

              {/* Add role inline form */}
              {showAddRole && (
                <form onSubmit={handleAddRole} className="p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] space-y-3">
                  <h3 className="text-sm font-bold text-[var(--theme-text)]">New project role</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Role Title</label>
                      <input
                        type="text"
                        required
                        value={newRoleTitle}
                        onChange={(e) => setNewRoleTitle(e.target.value)}
                        placeholder="e.g. Frontend Developer"
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Seats / Positions</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        required
                        value={newRolePositions}
                        onChange={(e) => setNewRolePositions(Number(e.target.value))}
                        className={inputClassName}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Required Skills (comma separated)</label>
                    <input
                      type="text"
                      value={newRoleSkills}
                      onChange={(e) => setNewRoleSkills(e.target.value)}
                      placeholder="React, TypeScript, Tailwind"
                      className={inputClassName}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Experience Level</label>
                      <select
                        value={newRoleExperience}
                        onChange={(e) => setNewRoleExperience(e.target.value)}
                        className={inputClassName}
                      >
                        <option value="any">Any experience</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Weekly Commitment (hrs/wk)</label>
                      <input
                        type="number"
                        min={0}
                        max={168}
                        value={newRoleCommitment}
                        onChange={(e) => setNewRoleCommitment(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Optional"
                        className={inputClassName}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Role Description (optional)</label>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={newRoleDesc}
                      onChange={(e) => setNewRoleDesc(e.target.value)}
                      className={textareaClassName}
                      placeholder="Key responsibilities for this teammate"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddRole(false)}
                      className="button-secondary text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="button-primary text-xs"
                    >
                      {isSubmitting ? "Adding..." : "Add role"}
                    </button>
                  </div>
                </form>
              )}

              {/* Roles list */}
              <div className="space-y-3">
                {roles.map((role) => {
                  const occupancy = occupancyByRole[role.id] ?? 0;
                  const isEditing = editingRoleId === role.id;

                  if (isEditing) {
                    return (
                      <form
                        key={role.id}
                        onSubmit={(e) => handleUpdateRole(role.id, e)}
                        className="p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] space-y-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Title</label>
                            <input
                              type="text"
                              required
                              value={editRoleTitle}
                              onChange={(e) => setEditRoleTitle(e.target.value)}
                              className={inputClassName}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">
                              Seats (minimum {occupancy} currently active)
                            </label>
                            <input
                              type="number"
                              min={occupancy}
                              max={20}
                              required
                              value={editRolePositions}
                              onChange={(e) => setEditRolePositions(Number(e.target.value))}
                              className={inputClassName}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Skills (comma separated)</label>
                          <input
                            type="text"
                            value={editRoleSkills}
                            onChange={(e) => setEditRoleSkills(e.target.value)}
                            className={inputClassName}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Experience</label>
                          <select
                            value={editRoleExperience}
                            onChange={(e) => setEditRoleExperience(e.target.value)}
                            className={inputClassName}
                          >
                            <option value="any">Any experience</option>
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-[var(--theme-text-muted)] mb-1">Description</label>
                          <textarea
                            rows={2}
                            value={editRoleDesc}
                            onChange={(e) => setEditRoleDesc(e.target.value)}
                            className={textareaClassName}
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setEditingRoleId(null)}
                            className="button-secondary text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="button-primary text-xs"
                          >
                            {isSubmitting ? "Saving..." : "Save changes"}
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <article
                      key={role.id}
                      className="p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-sans font-bold text-sm text-[var(--theme-text)]">
                            {role.title}
                          </h4>
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                            role.status === "open" ? "bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]" : "bg-[var(--theme-surface)] text-[var(--theme-text-muted)]"
                          }`}>
                            {role.status === "open" ? "Open" : "Closed"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-mono text-[var(--theme-text-muted)]">
                          {occupancy} of {role.positions} seats filled · {role.experience_level || "any"} experience
                        </p>
                        {role.required_skills?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {role.required_skills.map((s) => (
                              <span key={s} className="chip-tag text-[11px]">{s}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoleId(role.id);
                            setEditRoleTitle(role.title);
                            setEditRoleDesc(role.description || "");
                            setEditRoleSkills((role.required_skills ?? []).join(", "));
                            setEditRoleExperience(role.experience_level || "any");
                            setEditRolePositions(role.positions);
                          }}
                          className="action-link-secondary text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRoleStatus(role)}
                          disabled={isSubmitting}
                          className="button-secondary text-xs !py-1 !min-h-0"
                        >
                          {role.status === "open" ? "Close role" : "Reopen role"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: TEAM & WORKSPACE */}
          {activeTab === "team" && (
            <div className="space-y-6">
              {/* Active Members Management */}
              <div>
                <h3 className="text-sm font-bold text-[var(--theme-text)] mb-3">
                  Active Team Members ({members.length})
                </h3>
                {members.length === 0 ? (
                  <p className="p-4 rounded-md border border-dashed border-[var(--theme-border)] text-center text-xs text-[var(--theme-text-muted)]">
                    No accepted team members yet. Review applications in the workspace to accept builders.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {members.map((member) => {
                      const profile = profiles[member.profile_id];
                      return (
                        <div
                          key={member.id}
                          className="p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                        >
                          <div>
                            <p className="font-sans font-bold text-sm text-[var(--theme-text)]">
                              {profile?.full_name || `@${profile?.username}` || "Team member"}
                            </p>
                            <p className="text-xs text-[var(--theme-text-muted)]">
                              {profile?.username ? `@${profile.username} · ` : ""}{profile?.primary_role || "Builder"}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Reassign role */}
                            <select
                              value={member.project_role_id || ""}
                              onChange={(e) => handleChangeMemberRole(member.id, e.target.value)}
                              disabled={isSubmitting}
                              className="h-8 rounded border border-[var(--theme-border)] bg-[var(--theme-surface)] px-2 text-xs text-[var(--theme-text)]"
                              aria-label="Reassign member role"
                            >
                              <option value="" disabled>Select role</option>
                              {roles.map((r) => {
                                const occ = occupancyByRole[r.id] ?? 0;
                                const isCurrent = member.project_role_id === r.id;
                                const isFull = !isCurrent && occ >= r.positions;
                                return (
                                  <option key={r.id} value={r.id} disabled={isFull}>
                                    {r.title} {isFull ? "(Full)" : `(${occ}/${r.positions})`}
                                  </option>
                                );
                              })}
                            </select>

                            {/* Remove member */}
                            {confirmRemoveMemberId === member.id ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-[var(--theme-warn)] font-medium">Confirm?</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(member.id)}
                                  disabled={isSubmitting}
                                  className="button-danger text-xs !py-1 !min-h-0"
                                >
                                  Yes, remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveMemberId(null)}
                                  className="button-secondary text-xs !py-1 !min-h-0"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveMemberId(member.id)}
                                disabled={isSubmitting}
                                className="button-secondary text-xs text-[var(--theme-warn)] !py-1 !min-h-0"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Private Team Workspace / Next steps */}
              <div className="pt-6 border-t border-[var(--theme-border)]">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-[var(--theme-text)]">
                    Team Workspace & Onboarding Handoff
                  </h3>
                  <p className="text-xs text-[var(--theme-text-muted)]">
                    These instructions and links are private — visible ONLY to accepted active teammates.
                  </p>
                </div>

                <form onSubmit={handleSaveTeamHandoff} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                      Team Collaboration Link (Discord, Slack, WhatsApp, GitHub)
                    </label>
                    <input
                      type="url"
                      value={teamLink}
                      onChange={(e) => setTeamLink(e.target.value)}
                      placeholder="https://discord.gg/... or https://github.com/..."
                      className={inputClassName}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[var(--theme-text-muted)] mb-1">
                      Next Steps & Onboarding Instructions
                    </label>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={nextSteps}
                      onChange={(e) => setNextSteps(e.target.value)}
                      placeholder="e.g. Join the Discord server above, read the #welcome channel, and check out the project board."
                      className={textareaClassName}
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="button-primary text-xs"
                    >
                      {isSubmitting ? "Saving..." : "Save workspace handoff"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: LIFECYCLE & DANGER ZONE */}
          {activeTab === "danger" && (
            <div className="space-y-6">
              {/* Recruiting Controls */}
              <div className="p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-sans font-bold text-sm text-[var(--theme-text)]">
                      Recruitment Status
                    </h3>
                    <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                      Currently:{" "}
                      <span className="font-mono font-semibold text-[var(--theme-text)]">
                        {project.recruiting_status === "paused" ? "Paused (not accepting applications)" : "Open"}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleRecruiting}
                    disabled={isSubmitting}
                    className="button-secondary text-xs"
                  >
                    {project.recruiting_status === "paused" ? "Resume recruiting" : "Pause recruiting"}
                  </button>
                </div>
              </div>

              {/* Lifecycle status */}
              <div className="p-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] space-y-3">
                <h3 className="font-sans font-bold text-sm text-[var(--theme-text)]">
                  Project Lifecycle
                </h3>
                <p className="text-xs text-[var(--theme-text-muted)]">
                  Current project status: <span className="font-mono font-semibold uppercase">{project.status}</span>
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  {project.status !== "completed" ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateLifecycle("completed")}
                      disabled={isSubmitting}
                      className="button-secondary text-xs"
                    >
                      Mark as completed
                    </button>
                  ) : null}

                  {project.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateLifecycle("cancelled")}
                      disabled={isSubmitting}
                      className="button-secondary text-xs text-[var(--theme-warn)]"
                    >
                      Cancel project
                    </button>
                  ) : null}

                  {project.status !== "archived" ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateLifecycle("archived")}
                      disabled={isSubmitting}
                      className="button-secondary text-xs"
                    >
                      Archive project
                    </button>
                  ) : null}

                  {project.status !== "open" && project.status !== "active" ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateLifecycle("active")}
                      disabled={isSubmitting}
                      className="button-primary text-xs"
                    >
                      Restore to active
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Danger Zone: Permanent Deletion */}
              <div className="p-5 rounded-lg border border-[var(--theme-warn)] bg-[var(--theme-warn-soft)] space-y-4">
                <div>
                  <h3 className="font-sans font-bold text-sm text-[var(--theme-warn)]">
                    Permanent Deletion
                  </h3>
                  <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                    This permanently removes the project, all roles, memberships, and applications. This action cannot be undone.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-mono text-[var(--theme-text)] mb-1">
                    To confirm, please type <span className="font-bold underline">{project.name}</span>:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={project.name}
                    className="h-9 w-full rounded border border-[var(--theme-warn)] bg-[var(--theme-surface)] px-3 text-xs text-[var(--theme-text)] outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleDeleteProject}
                    disabled={isSubmitting || deleteConfirmText.trim().toLowerCase() !== project.name.trim().toLowerCase()}
                    className="button-danger text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Deleting..." : "Permanently delete project"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

