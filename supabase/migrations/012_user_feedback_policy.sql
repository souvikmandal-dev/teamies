BEGIN;

-- 1. Ensure Souvik Mandal is recognized as feedback admin
CREATE OR REPLACE FUNCTION public.is_feedback_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feedback_admins WHERE user_id = auth.uid()
    UNION
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'souvikmandal.work1@gmail.com'
  );
$$;

-- 2. Provide get_my_feedback RPC for secure, authenticated retrieval of user's own feedback
CREATE OR REPLACE FUNCTION public.get_my_feedback()
RETURNS TABLE (
  id uuid,
  feedback_type text,
  rating smallint,
  title text,
  message text,
  page_context text,
  is_public boolean,
  is_anonymous boolean,
  display_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, feedback_type, rating, title, message, page_context, is_public, is_anonymous, display_name, status, created_at, updated_at
  FROM public.feedback
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_feedback() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_feedback() TO authenticated;

-- 3. Populate feedback_admins with the project owner
INSERT INTO public.feedback_admins (user_id)
SELECT id FROM auth.users WHERE email = 'souvikmandal.work1@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
