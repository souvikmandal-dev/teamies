-- Security boundary hardening. Apply after 009, in a transaction.
-- No remote database is changed by adding this file. Back up before applying.
BEGIN;

-- Handoff content is private, unlike project discovery fields.
CREATE TABLE public.project_handoffs (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  team_link text,
  next_steps text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handoff_link CHECK (team_link IS NULL OR
    (char_length(team_link) <= 500 AND team_link ~* '^https?://[^[:space:]/@]+([/?#][^[:space:]]*)?$')),
  CONSTRAINT handoff_steps CHECK (char_length(next_steps) <= 2000)
);
-- Preserve existing values; refuse migration rather than silently destroy invalid data.
INSERT INTO public.project_handoffs(project_id, team_link, next_steps)
SELECT id, nullif(btrim(team_link), ''), nullif(btrim(next_steps), '') FROM public.projects
WHERE team_link IS NOT NULL OR next_steps IS NOT NULL;
ALTER TABLE public.projects DROP COLUMN team_link, DROP COLUMN next_steps;
ALTER TABLE public.project_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_handoffs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.project_handoffs TO authenticated;
CREATE POLICY handoff_read ON public.project_handoffs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = project_handoffs.project_id
    AND m.profile_id = auth.uid() AND m.membership_status = 'active')
);
CREATE POLICY handoff_insert ON public.project_handoffs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);
CREATE POLICY handoff_update ON public.project_handoffs FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
);

-- Direct member writes bypass acceptance, consent and capacity. Only checked RPCs
-- and the acceptance trigger may mutate memberships.
REVOKE INSERT, UPDATE, DELETE ON public.project_members FROM anon, authenticated;
DROP POLICY "Project owners can create memberships" ON public.project_members;
DROP POLICY "Project owners can update memberships" ON public.project_members;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (is_read) ON public.notifications TO authenticated;
REVOKE ALL ON public.activity_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.activity_events TO anon, authenticated;
REVOKE ALL ON public.reports FROM PUBLIC, anon, authenticated;
GRANT INSERT (reporter_id, target_type, target_id, reason, details) ON public.reports TO authenticated;
ALTER TABLE public.reports ADD CONSTRAINT reports_details_length CHECK (char_length(details) <= 2000);

-- Prevent clients from resetting their own limits. Counts are changed only by
-- database triggers, in the same transaction as the protected mutation.
REVOKE ALL ON public.rate_limits, public.rate_limit_logs FROM PUBLIC, anon, authenticated;
DROP POLICY "Users can manage own rate limits" ON public.rate_limits;
DROP POLICY "Users can insert rate limit logs" ON public.rate_limit_logs;
DROP POLICY "Users can read own rate limit logs" ON public.rate_limit_logs;
CREATE OR REPLACE FUNCTION public.consume_mutation_limit(p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  maximum integer;
  seconds integer := 3600;
  boundary timestamptz;
  used integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  CASE p_action
    WHEN 'project_create' THEN maximum := 5; seconds := 86400;
    WHEN 'profile_update' THEN maximum := 20;
    WHEN 'application_create' THEN maximum := 10;
    WHEN 'report_create' THEN maximum := 10;
    WHEN 'project_delete' THEN maximum := 10;
    WHEN 'project_manage' THEN maximum := 100;
    WHEN 'application_decision' THEN maximum := 100;
    ELSE RAISE EXCEPTION 'Invalid mutation type';
  END CASE;
  boundary := to_timestamp(floor(extract(epoch FROM now()) / seconds) * seconds);
  INSERT INTO public.rate_limits(user_id, action_type, window_start, count)
  VALUES (actor, p_action, boundary, 1)
  ON CONFLICT (user_id, action_type, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
    WHERE public.rate_limits.count < maximum
  RETURNING count INTO used;
  IF used IS NULL THEN RAISE EXCEPTION 'Too many requests. Please try again later.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_mutation_limit(text) FROM PUBLIC, anon, authenticated;

-- This read-only preflight is UX only. Bypassing it cannot bypass write triggers.
CREATE FUNCTION public.mutation_limit_available(p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE maximum integer; seconds integer := 3600; used integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  CASE p_action
    WHEN 'project_create' THEN maximum := 5; seconds := 86400;
    WHEN 'profile_update' THEN maximum := 20;
    WHEN 'application_create' THEN maximum := 10;
    WHEN 'project_manage' THEN maximum := 100;
    WHEN 'project_delete' THEN maximum := 10;
    WHEN 'report_create' THEN maximum := 10;
    WHEN 'application_decision' THEN maximum := 100;
    ELSE RETURN false;
  END CASE;
  SELECT count INTO used FROM public.rate_limits WHERE user_id = auth.uid() AND action_type = p_action
    AND window_start = to_timestamp(floor(extract(epoch FROM now()) / seconds) * seconds);
  RETURN coalesce(used, 0) < maximum;
END;
$$;
REVOKE ALL ON FUNCTION public.mutation_limit_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutation_limit_available(text) TO authenticated;

CREATE FUNCTION public.enforce_mutation_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Internal activity timestamp updates must not charge applicants against owner operations.
  IF TG_TABLE_NAME = 'projects' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['updated_at','last_activity_at']) =
       (to_jsonb(OLD) - ARRAY['updated_at','last_activity_at']) THEN RETURN NEW; END IF;
  END IF;
  PERFORM public.consume_mutation_limit(TG_ARGV[0]);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_mutation_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER limit_project_create BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('project_create');
CREATE TRIGGER limit_project_update BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('project_manage');
CREATE TRIGGER limit_profile_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('profile_update');
CREATE TRIGGER limit_application_create BEFORE INSERT ON public.join_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('application_create');
CREATE TRIGGER limit_application_decision BEFORE UPDATE ON public.join_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('application_decision');
CREATE TRIGGER limit_role_write BEFORE INSERT OR UPDATE ON public.project_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('project_manage');
CREATE TRIGGER limit_handoff_write BEFORE INSERT OR UPDATE ON public.project_handoffs FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('project_manage');
CREATE TRIGGER limit_report_create BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.enforce_mutation_limit('report_create');

-- Safe bounded arrays and HTTP(S) links at the database boundary, including REST writes.
CREATE FUNCTION public.valid_tags(tags text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(cardinality(tags) <= 30 AND NOT EXISTS (
    SELECT 1 FROM unnest(tags) t WHERE t IS NULL OR char_length(btrim(t)) NOT BETWEEN 1 AND 60
  ) AND cardinality(tags) = (SELECT count(DISTINCT lower(btrim(t))) FROM unnest(tags) t), false);
$$;
CREATE FUNCTION public.safe_http_url(value text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT value IS NULL OR value = '' OR (char_length(value) <= 2048
    AND value ~* '^https?://[^[:space:]/@]+([/?#][^[:space:]]*)?$');
$$;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bounded_input CHECK (
  char_length(full_name) <= 100 AND char_length(bio) <= 2000
  AND char_length(college) <= 150 AND char_length(city) <= 100 AND char_length(primary_role) <= 80
  AND public.valid_tags(skills) AND public.valid_tags(interests)
  AND public.safe_http_url(portfolio_url) AND public.safe_http_url(github_url)
  AND public.safe_http_url(linkedin_url) AND public.safe_http_url(instagram_url)
  AND public.safe_http_url(avatar_url)
);
ALTER TABLE public.project_roles ADD CONSTRAINT roles_bounded_skills CHECK (public.valid_tags(required_skills));

-- Column grants prevent clients from forging audit timestamps, immutable IDs,
-- notification contents, or internal role counters. Profile upserts include id.
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT INSERT (id,username,full_name,avatar_url,bio,college,city,primary_role,experience_level,
  weekly_availability,portfolio_url,github_url,linkedin_url,instagram_url,skills,interests,builder_mode),
  UPDATE (id,username,full_name,avatar_url,bio,college,city,primary_role,experience_level,
  weekly_availability,portfolio_url,github_url,linkedin_url,instagram_url,skills,interests,builder_mode)
  ON public.profiles TO authenticated;
REVOKE INSERT, UPDATE ON public.join_requests FROM authenticated;
GRANT INSERT (id,project_id,applicant_id,project_role_id,message), UPDATE (status)
  ON public.join_requests TO authenticated;
REVOKE INSERT, UPDATE ON public.projects FROM authenticated;
GRANT INSERT (id,owner_id,name,slug,short_description,description,category,project_type,stage,
  collaboration_type,city,duration,weekly_commitment,max_team_size,goal),
  UPDATE (name,short_description,description,category,stage,collaboration_type,city,duration,
  weekly_commitment,max_team_size,goal,status,recruiting_status,last_activity_at,updated_at,
  completed_at,cancelled_at,archived_at) ON public.projects TO authenticated;
REVOKE INSERT, UPDATE ON public.project_roles FROM authenticated;
GRANT INSERT (id,project_id,title,description,required_skills,experience_level,positions,weekly_commitment,status),
  UPDATE (title,description,required_skills,experience_level,positions,weekly_commitment,status,updated_at)
  ON public.project_roles TO authenticated;

-- Immutable identities and capacity reductions must be checked below the UI.
CREATE FUNCTION public.protect_project_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Project identity is immutable'; END IF;
  IF NEW.max_team_size < (SELECT count(*) + 1 FROM public.project_members
    WHERE project_id = NEW.id AND membership_status = 'active') THEN
    RAISE EXCEPTION 'Team size is below current membership';
  END IF;
  IF NEW.status IN ('completed','cancelled','archived') THEN NEW.recruiting_status := 'closed'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_project_integrity BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.protect_project_integrity();
CREATE FUNCTION public.protect_role_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Role identity is immutable'; END IF;
  -- A concurrent acceptance holds the same role row lock. Updates either see the
  -- committed membership or cause one transaction to retry; they cannot overfill.
  IF NEW.positions < (SELECT count(*) FROM public.project_members
    WHERE project_role_id = NEW.id AND membership_status = 'active') THEN
    RAISE EXCEPTION 'Role positions are below current membership';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_role_integrity BEFORE UPDATE ON public.project_roles FOR EACH ROW EXECUTE FUNCTION public.protect_role_integrity();
REVOKE ALL ON FUNCTION public.protect_project_integrity(), public.protect_role_integrity() FROM PUBLIC, anon, authenticated;

-- Deleting a project cascades normally; deleting an occupied role by itself is refused.
CREATE FUNCTION public.protect_role_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE id = OLD.project_id FOR UPDATE;
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.project_members WHERE project_role_id = OLD.id AND membership_status = 'active') THEN
      RAISE EXCEPTION 'Reassign active members before deleting this role';
    END IF;
    PERFORM public.consume_mutation_limit('project_manage');
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER protect_role_deletion BEFORE DELETE ON public.project_roles FOR EACH ROW EXECUTE FUNCTION public.protect_role_deletion();
REVOKE ALL ON FUNCTION public.protect_role_deletion() FROM PUBLIC, anon, authenticated;

-- Align INSERT RLS with the lifecycle-aware trigger. Private read/update policies remain.
DROP POLICY "Builders can submit their own join requests" ON public.join_requests;
CREATE POLICY "Builders can submit their own join requests" ON public.join_requests FOR INSERT TO authenticated
WITH CHECK (applicant_id = auth.uid() AND status = 'pending' AND responded_at IS NULL);

-- Even direct REST deletion requires an owner-bound confirmation RPC.
REVOKE DELETE ON public.projects FROM authenticated;
CREATE FUNCTION public.delete_project_confirmed(p_project_id uuid, p_confirmed_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT name INTO project_name FROM public.projects
    WHERE id = p_project_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_confirmed_name IS NULL OR p_confirmed_name <> project_name THEN RETURN false; END IF;
  PERFORM public.consume_mutation_limit('project_delete');
  DELETE FROM public.projects WHERE id = p_project_id AND owner_id = auth.uid();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_project_confirmed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_confirmed(uuid, text) TO authenticated;

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
  WHERE id = p_project_id
  FOR UPDATE;

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

  PERFORM public.consume_mutation_limit('project_manage');

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
  WHERE id = p_project_id
  FOR UPDATE;

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

  PERFORM public.consume_mutation_limit('project_manage');

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
  WHERE id = p_project_id
  FOR UPDATE;

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

  IF v_role_status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destination role is closed');
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

  PERFORM public.consume_mutation_limit('project_manage');

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

-- All privileged functions have explicit execution permissions. Triggers do not
-- need caller EXECUTE privileges. Stale scanning is a service-only scheduled job.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname = ANY (ARRAY['change_project_member_role', 'check_and_record_stale_projects', 'consume_mutation_limit', 'delete_project_confirmed', 'enforce_mutation_limit', 'handle_new_user', 'leave_project', 'log_activity_on_project_created', 'mutation_limit_available', 'notify_applicant_on_decision', 'process_join_request_update', 'protect_assigned_project_role', 'protect_project_integrity', 'protect_requested_project_role', 'protect_role_integrity', 'remove_project_member', 'safe_http_url', 'set_updated_at', 'update_join_request_status_timestamp', 'update_project_last_activity_on_join_request', 'update_project_last_activity_on_project', 'update_project_last_activity_on_role', 'valid_tags', 'validate_join_request_insert', 'validate_project_membership'])
  LOOP EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.leave_project(uuid), public.remove_project_member(uuid,uuid),
  public.change_project_member_role(uuid,uuid,uuid), public.delete_project_confirmed(uuid,text),
  public.mutation_limit_available(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_stale_projects() TO service_role;
COMMIT;
