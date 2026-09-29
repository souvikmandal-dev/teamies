BEGIN;

-- ====================================================================
-- TEAMIES MIGRATION 013: REMOVE TEST BOTS AND ACTIVITY HISTORY
-- ====================================================================
-- 🔒 HARD-LOCKED ADMIN & REAL BUILDER PROTECTION:
-- Admin: Souvik Mandal (e7a63d1c-0576-474b-af28-08becc9c9979 / souvikmandal.work1@gmail.com)
-- Admin Projects: clipper-agent, teamies-devloper, dev-team (NEVER TOUCHED)
-- Real Builders: aksha123, ritesh01, reallymanav, izhanlovesfood, flameritesh (NEVER TOUCHED)
-- ====================================================================

-- 1. Delete all synthetic / test projects (EXCLUDING ADMIN AND REAL PROJECTS)
DELETE FROM public.projects
WHERE owner_id != 'e7a63d1c-0576-474b-af28-08becc9c9979'
  AND (
    slug IN (
      'buildmate-live-beta-test-858606',
      'buildmate-live-beta-test-905790',
      'qa-project-981387',
      'feed-proj-928681',
      'studyflow-ai-1790178959155',
      'studyflow-ai-1790179126348',
      'studyflow-ai-1790179218819',
      'teamies-live-smoke-1790186963229',
      'teamies-live-smoke-1790187009414',
      'teamies-live-smoke-1790187073229',
      'agentmesh-551486',
      'agentmesh-597860'
    )
    OR slug LIKE 'buildmate-%'
    OR slug LIKE 'qa-project-%'
    OR slug LIKE 'feed-proj-%'
    OR slug LIKE 'studyflow-ai-%'
    OR slug LIKE 'teamies-live-smoke-%'
    OR slug LIKE 'agentmesh-%'
  );

-- 2. Delete test feedback submissions (EXCLUDING ADMIN SOUVIK)
DELETE FROM public.feedback
WHERE user_id != 'e7a63d1c-0576-474b-af28-08becc9c9979'
  AND (
    title ILIKE '%test%'
    OR title ILIKE '%smoke%'
    OR title ILIKE '%GitHub Integration%'
    OR title ILIKE '%Rating test%'
    OR title ILIKE '%Private report%'
    OR title ILIKE '%Public candidate%'
    OR message ILIKE '%This is a live test message%'
    OR message ILIKE '%verify end to end%'
  );

-- 3. Delete only test bots from auth.users (ADMIN AND REAL BUILDERS ARE HARD-LOCKED PROTECTED)
DELETE FROM auth.users
WHERE id != 'e7a63d1c-0576-474b-af28-08becc9c9979' -- NEVER DELETE ADMIN SOUVIK
  AND email != 'souvikmandal.work1@gmail.com'       -- NEVER DELETE ADMIN EMAIL
  AND id NOT IN (
    '60544eac-9ab6-4740-9350-0477a096ee2d',         -- aksha123
    'e18180e4-76c7-4b44-9870-a674f9877519',         -- ritesh01
    'fa39e9fa-5194-42a9-9538-110072e0c662',         -- reallymanav
    'c3bef6f9-e2cf-4cb4-93f8-929c6470b152',         -- izhanlovesfood
    '862ea35d-a9ef-4856-b09e-23927ae53c8a'          -- flameritesh
  )
  AND (
    email ILIKE '%@teamies-qa.internal'
    OR email ILIKE '%@teamies-beta.test'
    OR email ILIKE '%@teamies.internal'
    OR email ILIKE '%qa_tester%'
    OR email ILIKE '%smoke%'
    OR email ILIKE '%alex_rivera%'
    OR email ILIKE '%bianca_chen%'
    OR email ILIKE '%carlos_gomez%'
    OR email ILIKE '%example.com'
    OR id IN (
      SELECT id FROM public.profiles
      WHERE username ILIKE 'smoke_%'
         OR username ILIKE 'qa_%'
         OR username ILIKE 'beta_%'
         OR username ILIKE 'incomplete_%'
         OR username ILIKE 'user_%'
         OR username ILIKE 'user2_%'
         OR username ILIKE 'alex_founder_%'
         OR username ILIKE 'chloe_des_%'
         OR username ILIKE 'ben_dev_%'
         OR username ILIKE 'dana_dev_%'
         OR username ILIKE 'feed_%'
         OR username ILIKE 'owner_%'
         OR username ILIKE 'builder_%'
         OR full_name IN (
           'Smoke User A',
           'Smoke User B',
           'Alex Rivera (QA Lead)',
           'Bianca Chen',
           'Carlos Gomez',
           'Beta Tester',
           'Incomplete Tester',
           'Test User',
           'Direct API Debug User',
           'JS SDK Debug User',
           'Beta Tester Frontend'
         )
         OR (username IS NULL AND full_name IS NULL)
         OR (username IS NULL AND full_name = 'Beta Tester')
    )
  );

-- 4. Ensure admin Souvik is registered in feedback_admins
INSERT INTO public.feedback_admins (user_id)
VALUES ('e7a63d1c-0576-474b-af28-08becc9c9979')
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
