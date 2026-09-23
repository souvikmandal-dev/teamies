-- Migration 009: Teamies V1.2 Launch Hardening & Production Polish
-- Covers:
-- 1. Project lifecycle & recruiting status separation
-- 2. Post-acceptance handoff fields (team_link, next_steps)
-- 3. Stored procedures for atomic team member management (leave, remove, role change)
-- 4. Updated join request triggers for active/paused project states
-- 5. Stale detection logic update (only active projects with open recruiting)
-- 6. Safety & reporting mechanism (reports table)

-- ============================================================================
-- 1. PROJECTS TABLE ENHANCEMENTS
-- ============================================================================

-- Add recruiting_status column
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS recruiting_status text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_recruiting_status_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_recruiting_status_check
      CHECK (recruiting_status IN ('open', 'paused', 'closed'));
  END IF;
END $$;

-- Expand status check constraint to support modern lifecycle states
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('open', 'active', 'in_progress', 'completed', 'cancelled', 'archived'));

-- Add post-acceptance team handoff fields
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS team_link text,
  ADD COLUMN IF NOT EXISTS next_steps text;

-- Add lifecycle timestamps
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Add index on recruiting_status
CREATE INDEX IF NOT EXISTS idx_projects_recruiting_status
  ON public.projects (recruiting_status);

-- ============================================================================
-- 2. TEAM MEMBER MANAGEMENT FUNCTIONS (RPC)
-- ============================================================================

-- Function 2.1: Voluntary Member Leave
CREATE OR REPLACE FUNCTION public.leave_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_owner_id uuid;
  v_member_record record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project not found');
  END IF;

  IF v_user_id = v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project owner cannot leave their own project');
  END IF;

  SELECT * INTO v_member_record
  FROM public.project_members
  WHERE project_id = p_project_id
    AND profile_id = v_user_id
    AND membership_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active membership not found');
  END IF;

  UPDATE public.project_members
  SET membership_status = 'left',
      updated_at = now()
  WHERE id = v_member_record.id;

  UPDATE public.projects
  SET last_activity_at = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_project(uuid) TO authenticated;

-- Function 2.2: Owner Member Removal
CREATE OR REPLACE FUNCTION public.remove_project_member(
  p_project_id uuid,
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_owner_id uuid;
  v_project_name text;
  v_target_profile_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT owner_id, name INTO v_owner_id, v_project_name
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project not found');
  END IF;

  IF v_user_id <> v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the project owner can remove members');
  END IF;

  SELECT profile_id INTO v_target_profile_id
  FROM public.project_members
  WHERE id = p_member_id
    AND project_id = p_project_id
    AND membership_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active member not found in this project');
  END IF;

  UPDATE public.project_members
  SET membership_status = 'removed',
      updated_at = now()
  WHERE id = p_member_id;

  UPDATE public.projects
  SET last_activity_at = now()
  WHERE id = p_project_id;

  -- Notify removed member
  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    link
  ) VALUES (
    v_target_profile_id,
    'Team membership update',
    'You were removed from ' || v_project_name || '.',
    '/dashboard'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_project_member(uuid, uuid) TO authenticated;

-- Function 2.3: Owner Atomic Role Reassignment
CREATE OR REPLACE FUNCTION public.change_project_member_role(
  p_project_id uuid,
  p_member_id uuid,
  p_new_role_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_owner_id uuid;
  v_role_project_id uuid;
  v_role_positions integer;
  v_role_status text;
  v_active_role_members bigint;
  v_target_profile_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Project not found');
  END IF;

  IF v_user_id <> v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the project owner can reassign roles');
  END IF;

  SELECT profile_id INTO v_target_profile_id
  FROM public.project_members
  WHERE id = p_member_id
    AND project_id = p_project_id
    AND membership_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active member not found in this project');
  END IF;

  -- Validate destination role
  SELECT project_id, positions, status
  INTO v_role_project_id, v_role_positions, v_role_status
  FROM public.project_roles
  WHERE id = p_new_role_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destination role does not exist');
  END IF;

  IF v_role_project_id <> p_project_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destination role belongs to a different project');
  END IF;

  -- Count existing active members for the new role (excluding the member being moved if already in this role)
  SELECT count(*)
  INTO v_active_role_members
  FROM public.project_members
  WHERE project_id = p_project_id
    AND project_role_id = p_new_role_id
    AND id <> p_member_id
    AND membership_status = 'active';

  IF v_active_role_members >= v_role_positions THEN
    RETURN jsonb_build_object('success', false, 'error', 'The destination role has no available capacity');
  END IF;

  UPDATE public.project_members
  SET project_role_id = p_new_role_id,
      updated_at = now()
  WHERE id = p_member_id;

  UPDATE public.projects
  SET last_activity_at = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_project_member_role(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- 3. UPDATED JOIN REQUEST TRIGGERS (LIFECYCLE & RECRUITING STATUS SAFE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_join_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_actor_id uuid;
  project_owner_id uuid;
  project_status text;
  project_recruiting text;
  role_project_id uuid;
  role_status text;
BEGIN
  request_actor_id := auth.uid();

  IF request_actor_id IS NULL OR request_actor_id <> new.applicant_id THEN
    RAISE EXCEPTION 'A join request can only be created by its applicant.';
  END IF;

  IF new.status <> 'pending' OR new.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'A new join request must begin with pending status.';
  END IF;

  SELECT p.owner_id, p.status, coalesce(p.recruiting_status, 'open')
  INTO project_owner_id, project_status, project_recruiting
  FROM public.projects AS p
  WHERE p.id = new.project_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The referenced project does not exist.';
  END IF;

  -- Project must be open or active
  IF project_status NOT IN ('open', 'active') THEN
    RAISE EXCEPTION 'This project is not currently active.';
  END IF;

  -- Project recruiting must be open
  IF project_recruiting <> 'open' THEN
    RAISE EXCEPTION 'This project is not accepting applications right now.';
  END IF;

  IF new.applicant_id = project_owner_id THEN
    RAISE EXCEPTION 'A project owner cannot apply to their own project.';
  END IF;

  SELECT r.project_id, r.status
  INTO role_project_id, role_status
  FROM public.project_roles AS r
  WHERE r.id = new.project_role_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The referenced project role does not exist.';
  END IF;

  IF role_project_id <> new.project_id THEN
    RAISE EXCEPTION 'The selected project role belongs to a different project.';
  END IF;

  IF role_status <> 'open' THEN
    RAISE EXCEPTION 'This project role is not accepting join requests.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_members AS pm
    WHERE pm.project_id = new.project_id
      AND pm.profile_id = new.applicant_id
      AND pm.membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active project member cannot submit a join request.';
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_join_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_actor_id uuid;
  project_owner_id uuid;
  project_name text;
  project_status text;
  project_recruiting text;
  project_max_team_size integer;
  role_project_id uuid;
  role_title text;
  role_status text;
  role_positions integer;
  active_role_members bigint;
  active_project_members bigint;
BEGIN
  IF new.id IS DISTINCT FROM old.id
    OR new.project_id IS DISTINCT FROM old.project_id
    OR new.applicant_id IS DISTINCT FROM old.applicant_id
    OR new.project_role_id IS DISTINCT FROM old.project_role_id
    OR new.message IS DISTINCT FROM old.message
    OR new.created_at IS DISTINCT FROM old.created_at
  THEN
    RAISE EXCEPTION 'Join request identity and submission details are immutable.';
  END IF;

  IF new.responded_at IS DISTINCT FROM old.responded_at THEN
    RAISE EXCEPTION 'responded_at is managed automatically.';
  END IF;

  IF old.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending join requests can change status.';
  END IF;

  request_actor_id := auth.uid();

  SELECT p.owner_id, p.name, p.status, coalesce(p.recruiting_status, 'open'), p.max_team_size
  INTO project_owner_id, project_name, project_status, project_recruiting, project_max_team_size
  FROM public.projects AS p
  WHERE p.id = old.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The referenced project does not exist.';
  END IF;

  IF request_actor_id = old.applicant_id THEN
    IF new.status <> 'withdrawn' THEN
      RAISE EXCEPTION 'Applicants may only withdraw pending join requests.';
    END IF;

    new.responded_at := null;
    RETURN new;
  END IF;

  IF request_actor_id <> project_owner_id THEN
    RAISE EXCEPTION 'Only the applicant or project owner may update this request.';
  END IF;

  IF new.status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Project owners may only accept or reject pending requests.';
  END IF;

  IF new.status = 'rejected' THEN
    new.responded_at := now();
    RETURN new;
  END IF;

  IF project_status NOT IN ('open', 'active') THEN
    RAISE EXCEPTION 'This project is no longer active.';
  END IF;

  IF project_recruiting <> 'open' THEN
    RAISE EXCEPTION 'This project is not accepting new members.';
  END IF;

  IF old.applicant_id = project_owner_id THEN
    RAISE EXCEPTION 'A project owner cannot become a project member.';
  END IF;

  SELECT r.project_id, r.title, r.status, r.positions
  INTO role_project_id, role_title, role_status, role_positions
  FROM public.project_roles AS r
  WHERE r.id = old.project_role_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested project role no longer exists.';
  END IF;

  IF role_project_id <> old.project_id THEN
    RAISE EXCEPTION 'The requested role belongs to a different project.';
  END IF;

  IF role_status <> 'open' THEN
    RAISE EXCEPTION 'The requested project role is no longer open.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_members AS pm
    WHERE pm.project_id = old.project_id
      AND pm.profile_id = old.applicant_id
      AND pm.membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'The builder is already an active member of this project.';
  END IF;

  SELECT count(*)
  INTO active_role_members
  FROM public.project_members AS pm
  WHERE pm.project_id = old.project_id
    AND pm.project_role_id = old.project_role_id
    AND pm.membership_status = 'active';

  IF active_role_members >= role_positions THEN
    RAISE EXCEPTION 'This project role has no available positions.';
  END IF;

  SELECT count(*)
  INTO active_project_members
  FROM public.project_members AS pm
  WHERE pm.project_id = old.project_id
    AND pm.membership_status = 'active';

  IF active_project_members + 1 >= project_max_team_size THEN
    RAISE EXCEPTION 'This project has reached its maximum team size.';
  END IF;

  -- Upsert into project_members safely (in case builder was previously left or removed)
  INSERT INTO public.project_members (
    project_id,
    profile_id,
    project_role_id,
    membership_status,
    joined_at
  )
  VALUES (
    old.project_id,
    old.applicant_id,
    old.project_role_id,
    'active',
    now()
  )
  ON CONFLICT (project_id, profile_id)
  DO UPDATE SET
    project_role_id = EXCLUDED.project_role_id,
    membership_status = 'active',
    joined_at = now(),
    updated_at = now();

  -- Log activity_event: application_accepted
  INSERT INTO public.activity_events (
    event_type,
    project_id,
    actor_user_id,
    metadata
  ) VALUES (
    'application_accepted',
    old.project_id,
    old.applicant_id,
    jsonb_build_object(
      'project_name', project_name,
      'role_title', role_title
    )
  );

  -- Log activity_event: role_filled if capacity reached
  IF active_role_members + 1 = role_positions THEN
    INSERT INTO public.activity_events (
      event_type,
      project_id,
      actor_user_id,
      metadata
    ) VALUES (
      'role_filled',
      old.project_id,
      null,
      jsonb_build_object(
        'project_name', project_name,
        'role_title', role_title,
        'positions', role_positions
      )
    );
  END IF;

  new.responded_at := now();
  RETURN new;
END;
$$;

-- ============================================================================
-- 4. STALE PROJECTS FUNCTION (LIFECYCLE AWARE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_and_record_stale_projects()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  stale_rec record;
  recorded_count integer := 0;
BEGIN
  FOR stale_rec IN
    SELECT p.id AS project_id, p.name AS project_name
    FROM public.projects AS p
    WHERE p.status IN ('open', 'active')
      AND coalesce(p.recruiting_status, 'open') = 'open'
      AND p.last_activity_at < now() - interval '30 days'
      AND EXISTS (
        SELECT 1
        FROM public.project_roles AS pr
        WHERE pr.project_id = p.id
          AND pr.status = 'open'
          AND (
            SELECT count(*)
            FROM public.project_members AS pm
            WHERE pm.project_id = p.id
              AND pm.project_role_id = pr.id
              AND pm.membership_status = 'active'
          ) < pr.positions
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.activity_events AS ae
        WHERE ae.project_id = p.id
          AND ae.event_type = 'project_stale'
          AND ae.created_at >= now() - interval '30 days'
      )
  LOOP
    INSERT INTO public.activity_events (
      event_type,
      project_id,
      actor_user_id,
      metadata
    ) VALUES (
      'project_stale',
      stale_rec.project_id,
      null,
      jsonb_build_object(
        'project_name', stale_rec.project_name
      )
    );
    recorded_count := recorded_count + 1;
  END LOOP;

  RETURN recorded_count;
END;
$$;

-- ============================================================================
-- 5. SAFETY & REPORTING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('project', 'profile')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'harassment', 'scam', 'other')),
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_created_at
  ON public.reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_target
  ON public.reports (target_type, target_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can create reports" ON public.reports;
CREATE POLICY "Authenticated users can create reports"
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = reporter_id);

