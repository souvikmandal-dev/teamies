-- Disposable local database only. All fixtures are rolled back.
BEGIN;
INSERT INTO auth.users(id, raw_user_meta_data) VALUES
  ('a1000000-0000-4000-8000-000000000001', '{}'),
  ('a1000000-0000-4000-8000-000000000002', '{"role":"admin","is_admin":true}'),
  ('a1000000-0000-4000-8000-000000000003', '{}'),
  ('a1000000-0000-4000-8000-000000000004', '{}'),
  ('a1000000-0000-4000-8000-000000000005', '{}');
INSERT INTO public.feedback_admins VALUES
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000004');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',false);
UPDATE public.profiles SET username='removal_builder',full_name='Removal Builder' WHERE id=auth.uid();
SELECT pg_temp.assert_true(NOT public.is_platform_admin(), 'user metadata cannot grant admin access');
SELECT pg_temp.denied($q$INSERT INTO public.feedback_admins VALUES(auth.uid())$q$, 'user cannot become admin');
INSERT INTO public.projects(id,owner_id,name,slug,short_description,category,project_type) VALUES
  ('a2000000-0000-4000-8000-000000000001',auth.uid(),'Admin removal fixture','admin-removal-fixture','Synthetic removal fixture','Software','startup'),
  ('a2000000-0000-4000-8000-000000000002',auth.uid(),'Owned removal fixture','owned-removal-fixture','Synthetic removal fixture','Software','startup');
INSERT INTO public.project_roles(id,project_id,title) VALUES
  ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Engineer');
INSERT INTO public.project_handoffs VALUES ('a2000000-0000-4000-8000-000000000001','https://example.com/private','Private fixture',now());
SELECT pg_temp.denied($q$SELECT public.delete_project_confirmed('a2000000-0000-4000-8000-000000000001','Admin removal fixture')$q$, 'owner cannot call removal RPC');
SELECT pg_temp.denied($q$SELECT public.delete_builder_confirmed(auth.uid(),'removal_builder')$q$, 'builder cannot remove own account');
SELECT pg_temp.denied($q$DELETE FROM public.profiles WHERE id=auth.uid()$q$, 'direct profile delete denied');
SELECT pg_temp.denied($q$DELETE FROM auth.users WHERE id=auth.uid()$q$, 'direct auth delete denied');
SELECT public.submit_feedback('a4000000-0000-4000-8000-000000000001','general',4,'Removal fixture','Synthetic feedback for cascade testing','/feedback',false,true);

SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',false);
INSERT INTO public.join_requests(id,project_id,applicant_id,project_role_id) VALUES
  ('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',auth.uid(),'a3000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',false);
UPDATE public.join_requests SET status='accepted' WHERE id='a5000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.project_members WHERE project_id='a2000000-0000-4000-8000-000000000001'), 'occupied project fixture');

SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true(public.is_platform_admin(), 'trusted admin recognized');
SELECT pg_temp.denied($q$DELETE FROM public.projects WHERE id='a2000000-0000-4000-8000-000000000001'$q$, 'admin direct delete still requires confirmation');
SELECT pg_temp.assert_true(NOT public.delete_project_confirmed('a2000000-0000-4000-8000-000000000001','admin removal fixture'), 'exact project name required');
SELECT pg_temp.assert_true(NOT public.delete_builder_confirmed('a1000000-0000-4000-8000-000000000002','wrong'), 'builder confirmation required');
SELECT pg_temp.denied($q$SELECT public.delete_builder_confirmed(auth.uid(),auth.uid()::text)$q$, 'admin self deletion protected');
SELECT pg_temp.denied($q$SELECT public.delete_builder_confirmed('a1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000004')$q$, 'other admin protected');
SELECT pg_temp.assert_true(public.delete_project_confirmed('a2000000-0000-4000-8000-000000000001','Admin removal fixture'), 'admin removes another builders occupied project');
SELECT pg_temp.assert_true(NOT public.delete_project_confirmed('a2000000-0000-4000-8000-000000000001','Admin removal fixture'), 'project replay reports missing');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.project_roles WHERE project_id='a2000000-0000-4000-8000-000000000001'), 'roles cascade');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.project_members WHERE project_id='a2000000-0000-4000-8000-000000000001'), 'memberships cascade');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.join_requests WHERE project_id='a2000000-0000-4000-8000-000000000001'), 'applications cascade');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.project_handoffs WHERE project_id='a2000000-0000-4000-8000-000000000001'), 'handoff cascade');
SELECT pg_temp.assert_true(public.delete_builder_confirmed('a1000000-0000-4000-8000-000000000002','removal_builder'), 'admin removes builder');
SELECT pg_temp.assert_true(NOT public.delete_builder_confirmed('a1000000-0000-4000-8000-000000000002','removal_builder'), 'builder replay reports missing');
SELECT pg_temp.assert_true(public.delete_builder_confirmed('a1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000005'), 'builder without username uses ID');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM auth.users WHERE id IN ('a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000005')), 'auth accounts removed');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.profiles WHERE id='a1000000-0000-4000-8000-000000000002'), 'profile removed');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.projects WHERE owner_id='a1000000-0000-4000-8000-000000000002'), 'owned projects removed');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.feedback WHERE user_id='a1000000-0000-4000-8000-000000000002'), 'feedback removed');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM auth.users WHERE id='a1000000-0000-4000-8000-000000000003'), 'unrelated account survives');
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.denied($q$SELECT public.is_platform_admin()$q$, 'anonymous admin check denied');
SELECT pg_temp.denied($q$SELECT public.delete_builder_confirmed('a1000000-0000-4000-8000-000000000003','anything')$q$, 'anonymous builder removal denied');
RESET ROLE;
ROLLBACK;
