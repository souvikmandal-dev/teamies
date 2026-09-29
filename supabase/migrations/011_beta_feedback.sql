BEGIN;
-- Membership is provisioned only by a trusted database operator, never user metadata.
CREATE TABLE public.feedback_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.feedback_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_admins FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.is_feedback_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.feedback_admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_feedback_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_feedback_admin() TO authenticated;

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('general','bug','feature','ux','performance','idea','other')),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 4000),
  page_context text CHECK (page_context IS NULL OR page_context IN ('/','/dashboard','/discover/projects','/discover/builders','/projects/new','/projects/[id]','/profile/[username]','/settings/profile','/onboarding','/feedback','/other')),
  is_public boolean NOT NULL DEFAULT false,
  is_anonymous boolean NOT NULL DEFAULT true,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','resolved')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_id)
);
CREATE INDEX feedback_recent ON public.feedback(created_at DESC);
CREATE INDEX feedback_moderation ON public.feedback(status, feedback_type, created_at DESC);
CREATE INDEX feedback_user_recent ON public.feedback(user_id, created_at DESC);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.feedback TO authenticated;
CREATE POLICY feedback_admin_read ON public.feedback FOR SELECT TO authenticated USING (public.is_feedback_admin());
-- The owner-executed view deliberately projects only consented public fields.
-- Never grant clients SELECT on underlying records except through the admin policy.
CREATE VIEW public.feedback_reviews WITH (security_barrier = true) AS
SELECT feedback_type, rating, title, message, created_at, status,
  CASE WHEN is_anonymous THEN 'Anonymous Beta User' ELSE display_name END AS display_name
FROM public.feedback
WHERE is_public AND approved_at IS NOT NULL AND status IN ('approved','resolved');
REVOKE ALL ON public.feedback_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.feedback_reviews TO anon, authenticated;

CREATE FUNCTION public.submit_feedback(p_request_id uuid, p_type text, p_rating integer,
  p_title text, p_message text, p_context text, p_public boolean, p_anonymous boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); author text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  -- Serialize per user across server instances and direct API calls.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text, 11));
  IF EXISTS (SELECT 1 FROM public.feedback WHERE user_id = actor AND request_id = p_request_id) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.feedback WHERE user_id = actor AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Feedback rate limit' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.feedback WHERE user_id = actor AND title = btrim(p_title)
    AND message = btrim(p_message) AND created_at > now() - interval '10 minutes') THEN RETURN; END IF;
  SELECT left(coalesce(nullif(btrim(full_name), ''), 'Beta User'),100) INTO author FROM public.profiles WHERE id = actor;
  INSERT INTO public.feedback(user_id,request_id,feedback_type,rating,title,message,page_context,is_public,is_anonymous,display_name)
  VALUES (actor,p_request_id,p_type,p_rating,btrim(p_title),btrim(p_message),p_context,p_public,p_anonymous,coalesce(author,'Beta User'));
END;
$$;
REVOKE ALL ON FUNCTION public.submit_feedback(uuid,text,integer,text,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_feedback(uuid,text,integer,text,text,text,boolean,boolean) TO authenticated;

CREATE FUNCTION public.moderate_feedback(p_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_feedback_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending','approved','rejected','resolved') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.feedback SET status = p_status, updated_at = now(),
    approved_at = CASE WHEN p_status = 'approved' THEN now() WHEN p_status IN ('pending','rejected') THEN NULL ELSE approved_at END
  WHERE id = p_id AND (p_status <> 'approved' OR is_public);
  IF NOT FOUND THEN RAISE EXCEPTION 'Feedback unavailable or publication not consented'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_feedback(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_feedback(uuid,text) TO authenticated;
COMMIT;
