-- Migration 007: Teamies V1.1 Features
-- Feature 1: Project Health Visibility (last_activity_at & triggers)
-- Feature 2: Applicant Status Transparency (status_updated_at & notifications)
-- Feature 3: Owner Responsiveness View
-- Feature 4: Rate Limiting tables

-- ============================================================================
-- FEATURE 1: Project Health Visibility
-- ============================================================================
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_activity_at timestamptz not null default now();

-- 1. Trigger when project stage or description changes
CREATE OR REPLACE FUNCTION public.update_project_last_activity_on_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (new.stage IS DISTINCT FROM old.stage) OR (new.description IS DISTINCT FROM old.description) THEN
    new.last_activity_at := now();
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tr_project_last_activity ON public.projects;
CREATE TRIGGER tr_project_last_activity
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_last_activity_on_project();

-- 2. Trigger when a role is added to a project
CREATE OR REPLACE FUNCTION public.update_project_last_activity_on_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET last_activity_at = now()
  WHERE id = new.project_id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tr_role_last_activity ON public.project_roles;
CREATE TRIGGER tr_role_last_activity
  AFTER INSERT ON public.project_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_last_activity_on_role();

-- 3. Trigger when join request is accepted or rejected
CREATE OR REPLACE FUNCTION public.update_project_last_activity_on_join_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.status IN ('accepted', 'rejected') AND (old.status IS NULL OR old.status <> new.status) THEN
    UPDATE public.projects
    SET last_activity_at = now()
    WHERE id = new.project_id;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tr_join_request_last_activity ON public.join_requests;
CREATE TRIGGER tr_join_request_last_activity
  AFTER UPDATE ON public.join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_last_activity_on_join_request();


-- ============================================================================
-- FEATURE 2: Applicant Status Transparency
-- ============================================================================
ALTER TABLE public.join_requests ADD COLUMN IF NOT EXISTS status_updated_at timestamptz not null default now();

CREATE OR REPLACE FUNCTION public.update_join_request_status_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.status IS DISTINCT FROM old.status THEN
    new.status_updated_at := now();
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tr_join_request_status_timestamp ON public.join_requests;
CREATE TRIGGER tr_join_request_status_timestamp
  BEFORE UPDATE ON public.join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_join_request_status_timestamp();

-- Minimal in-app notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Trigger to create in-app notification when application accepted/rejected
CREATE OR REPLACE FUNCTION public.notify_applicant_on_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  proj_name text;
  role_name text;
BEGIN
  IF new.status IN ('accepted', 'rejected') AND (old.status IS NULL OR old.status <> new.status) THEN
    SELECT name INTO proj_name FROM public.projects WHERE id = new.project_id;
    SELECT title INTO role_name FROM public.project_roles WHERE id = new.project_role_id;

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (
      new.applicant_id,
      CASE WHEN new.status = 'accepted' THEN 'Application Accepted!' ELSE 'Application Update' END,
      CASE WHEN new.status = 'accepted'
           THEN 'You have been accepted for ' || coalesce(role_name, 'a role') || ' on ' || coalesce(proj_name, 'the project') || '!'
           ELSE 'Your application for ' || coalesce(role_name, 'a role') || ' on ' || coalesce(proj_name, 'the project') || ' was not selected.'
      END,
      '/projects/' || new.project_id::text
    );
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tr_notify_applicant ON public.join_requests;
CREATE TRIGGER tr_notify_applicant
  AFTER UPDATE ON public.join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_applicant_on_decision();


-- ============================================================================
-- FEATURE 3: Owner Responsiveness View
-- ============================================================================
CREATE OR REPLACE VIEW public.owner_responsiveness AS
SELECT
  p.owner_id,
  count(jr.id) AS decided_count,
  avg(extract(epoch from (coalesce(jr.status_updated_at, jr.responded_at, jr.updated_at) - jr.created_at))) AS avg_response_seconds
FROM public.projects p
JOIN public.join_requests jr ON jr.project_id = p.id
WHERE jr.status IN ('accepted', 'rejected')
GROUP BY p.owner_id;

GRANT SELECT ON public.owner_responsiveness TO anon, authenticated;


-- ============================================================================
-- FEATURE 4: Rate Limiting Tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action_type text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action_type, window_start)
);

CREATE TABLE IF NOT EXISTS public.rate_limit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own rate limits" ON public.rate_limits;
CREATE POLICY "Users can manage own rate limits"
  ON public.rate_limits
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert rate limit logs" ON public.rate_limit_logs;
CREATE POLICY "Users can insert rate limit logs"
  ON public.rate_limit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read own rate limit logs" ON public.rate_limit_logs;
CREATE POLICY "Users can read own rate limit logs"
  ON public.rate_limit_logs
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

