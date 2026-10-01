BEGIN;

-- Reuse the existing, operator-provisioned admin membership. User metadata and
-- client-provided emails must never grant platform deletion privileges.
CREATE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feedback_admins WHERE user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- Replace the owner-only RPC as well, so old clients cannot bypass admin removal.
REVOKE DELETE ON public.projects, public.profiles FROM anon, authenticated;
DROP POLICY IF EXISTS "Owners can delete their projects" ON public.projects;
CREATE OR REPLACE FUNCTION public.delete_project_confirmed(p_project_id uuid, p_confirmed_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project_name text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only admins can remove projects.' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO project_name FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_confirmed_name IS NULL OR p_confirmed_name <> project_name THEN RETURN false; END IF;
  PERFORM public.consume_mutation_limit('project_delete');
  DELETE FROM public.projects WHERE id = p_project_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_project_confirmed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_confirmed(uuid, text) TO authenticated;

CREATE FUNCTION public.delete_builder_confirmed(p_builder_id uuid, p_confirmed_identifier text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE builder_identifier text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only admins can remove builders.' USING ERRCODE = '42501';
  END IF;
  -- Serialize account removal against account changes and protect admin accounts.
  PERFORM 1 FROM auth.users WHERE id = p_builder_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_builder_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.feedback_admins WHERE user_id = p_builder_id
  ) THEN
    RAISE EXCEPTION 'Admin accounts cannot be removed.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(username, id::text) INTO builder_identifier
    FROM public.profiles WHERE id = p_builder_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_confirmed_identifier IS NULL OR p_confirmed_identifier <> builder_identifier THEN RETURN false; END IF;
  PERFORM public.consume_mutation_limit('project_delete');
  -- Remove the auth account, not just the profile. Existing foreign keys cascade
  -- to the profile, owned projects, applications, memberships and feedback.
  DELETE FROM auth.users WHERE id = p_builder_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_builder_confirmed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_builder_confirmed(uuid, text) TO authenticated;

COMMIT;
