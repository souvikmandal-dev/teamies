-- Migration 008: Platform Activity Feed
-- Feature: Real-time feeling activity feed of recent platform events

-- 1. Create activity_events table
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for efficient feed queries
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at
  ON public.activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_project_event
  ON public.activity_events (project_id, event_type);

-- 3. Row Level Security: public read, restricted write
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view recent activity events" ON public.activity_events;
CREATE POLICY "Public can view recent activity events"
  ON public.activity_events
  FOR SELECT
  TO public
  USING (created_at >= now() - interval '30 days');

-- 4. Trigger: project_created on projects INSERT
CREATE OR REPLACE FUNCTION public.log_activity_on_project_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_events (
    event_type,
    project_id,
    actor_user_id,
    metadata
  ) VALUES (
    'project_created',
    NEW.id,
    NEW.owner_id,
    jsonb_build_object(
      'project_name', NEW.name,
      'category', NEW.category,
      'slug', NEW.slug
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_activity_project_created ON public.projects;
CREATE TRIGGER tr_activity_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.log_activity_on_project_created();

-- 5. Update process_join_request_update to log application_accepted and role_filled
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

  SELECT p.owner_id, p.name, p.status, p.max_team_size
  INTO project_owner_id, project_name, project_status, project_max_team_size
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

  IF project_status <> 'open' THEN
    RAISE EXCEPTION 'This project is no longer accepting new members.';
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
  ) THEN
    RAISE EXCEPTION 'A membership relationship already exists for this builder and project.';
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
  );

  -- Log activity_event: application_accepted (privacy-safe: no pitch, no applicant details)
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

-- 6. Function to check and record project_stale events without duplicate spam
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
    WHERE p.status = 'open'
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

