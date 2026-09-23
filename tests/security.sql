-- Runs only against an isolated test database after migrations 001–010.
-- Fixtures are synthetic. Never execute on production.
INSERT INTO auth.users(id) VALUES
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000003'),
 ('10000000-0000-0000-0000-000000000004');
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAILED (allowed): %', label; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
INSERT INTO public.projects(id,owner_id,name,slug,short_description,category,project_type,max_team_size)
VALUES ('20000000-0000-0000-0000-000000000001',auth.uid(),'Test project','test-project','A valid description','Software','startup',2);
INSERT INTO public.project_roles(id,project_id,title,positions) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Engineer',1),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Designer',1);
INSERT INTO public.project_handoffs VALUES ('20000000-0000-0000-0000-000000000001','https://example.com/private','Private instructions',now());
SELECT pg_temp.denied($q$INSERT INTO public.project_members(project_id,profile_id,project_role_id) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001')$q$, 'owner direct membership bypass');
SELECT pg_temp.denied($q$UPDATE public.projects SET owner_id='10000000-0000-0000-0000-000000000002'$q$,'owner transfer');
SELECT pg_temp.denied($q$UPDATE public.project_handoffs SET team_link='javascript:alert(1)'$q$,'unsafe team link');
SELECT pg_temp.denied($q$UPDATE public.profiles SET github_url='javascript:alert(1)' WHERE id=auth.uid()$q$,'unsafe social link');
SELECT pg_temp.denied($q$UPDATE public.profiles SET skills=ARRAY['JS','js'] WHERE id=auth.uid()$q$,'duplicate tags');
SELECT pg_temp.denied($q$UPDATE public.profiles SET bio=repeat('x',2001) WHERE id=auth.uid()$q$,'oversized bio');
SELECT pg_temp.denied($q$DELETE FROM public.projects$q$,'direct deletion bypass');
SELECT pg_temp.assert_true(NOT public.delete_project_confirmed('20000000-0000-0000-0000-000000000001','wrong'), 'confirmation mismatch');
-- Applicant can submit, but cannot decide or read handoff data.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
INSERT INTO public.join_requests(id,project_id,applicant_id,project_role_id,message) VALUES
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',auth.uid(),'30000000-0000-0000-0000-000000000001','Private pitch');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.project_handoffs),'applicant private handoff denied');
SELECT pg_temp.denied($q$UPDATE public.join_requests SET status='accepted' WHERE applicant_id=auth.uid()$q$,'self acceptance');
SELECT pg_temp.assert_true(NOT public.delete_project_confirmed('20000000-0000-0000-0000-000000000001','Test project'),'IDOR delete');
UPDATE public.projects SET name='Hacked project' WHERE id='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT name='Test project' FROM public.projects),'IDOR edit');
SELECT pg_temp.assert_true(NOT (public.remove_project_member('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001')->>'success')::boolean,'owner RPC denied');
SELECT pg_temp.denied($q$DELETE FROM public.rate_limits$q$,'rate reset denied');
SELECT pg_temp.denied($q$SELECT public.check_and_record_stale_projects()$q$,'privileged batch denied');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.join_requests),'unrelated pitch denied');
INSERT INTO public.join_requests(id,project_id,applicant_id,project_role_id,message) VALUES
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',auth.uid(),'30000000-0000-0000-0000-000000000001','Second pitch');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
UPDATE public.join_requests SET status='accepted' WHERE id='40000000-0000-0000-0000-000000000001';
SELECT pg_temp.denied($q$UPDATE public.join_requests SET status='accepted' WHERE id='40000000-0000-0000-0000-000000000002'$q$,'final seat capacity');
SELECT pg_temp.denied($q$UPDATE public.projects SET max_team_size=1$q$,'team size reduction');
SELECT pg_temp.denied($q$DELETE FROM public.project_roles WHERE id='30000000-0000-0000-0000-000000000001'$q$,'occupied role deletion');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.project_members WHERE membership_status='active'),'capacity invariant');
SELECT pg_temp.denied($q$UPDATE public.join_requests SET status='accepted' WHERE id='40000000-0000-0000-0000-000000000001'$q$,'decision replay');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.project_handoffs),'active member handoff access');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.notifications),'own notification readable');
SELECT pg_temp.denied($q$UPDATE public.notifications SET message='spoof'$q$,'notification content protected');
UPDATE public.notifications SET is_read=true;
SELECT pg_temp.assert_true((SELECT bool_and(is_read) FROM public.notifications),'notification marking works');
SELECT pg_temp.assert_true((public.leave_project('20000000-0000-0000-0000-000000000001')->>'success')::boolean,'member leave');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.project_handoffs),'former member loses handoff');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.notifications),'cross-user notification read denied');
-- Atomic limit is enforced without any preflight call.
DO $$ BEGIN
 FOR i IN 1..20 LOOP UPDATE public.profiles SET bio='test' WHERE id=auth.uid(); END LOOP;
END $$;
SELECT pg_temp.denied($q$UPDATE public.profiles SET bio='over limit' WHERE id=auth.uid()$q$,'direct REST rate bypass');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
-- Exercise successful role reassignment/removal and rejection/withdrawal after hardening.
UPDATE public.join_requests SET status='accepted' WHERE id='40000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((public.change_project_member_role(
 '20000000-0000-0000-0000-000000000001',
 (SELECT id FROM public.project_members WHERE profile_id='10000000-0000-0000-0000-000000000003'),
 '30000000-0000-0000-0000-000000000002')->>'success')::boolean,'owner role reassignment');
SELECT pg_temp.assert_true((public.remove_project_member(
 '20000000-0000-0000-0000-000000000001',
 (SELECT id FROM public.project_members WHERE profile_id='10000000-0000-0000-0000-000000000003'))->>'success')::boolean,'owner member removal');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
INSERT INTO public.profiles(id,username,full_name) VALUES(auth.uid(),'fixture_four','Fixture Four')
 ON CONFLICT(id) DO UPDATE SET id=excluded.id, username=excluded.username, full_name=excluded.full_name;
INSERT INTO public.join_requests(id,project_id,applicant_id,project_role_id) VALUES
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',auth.uid(),'30000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
UPDATE public.join_requests SET status='rejected' WHERE id='40000000-0000-0000-0000-000000000003';
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.notifications),'rejection notification');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT pg_temp.assert_true(public.delete_project_confirmed('20000000-0000-0000-0000-000000000001','Test project'),'owner confirmed delete');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.project_handoffs),'handoff cascade');
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.denied($q$SELECT public.delete_project_confirmed('20000000-0000-0000-0000-000000000001','Test project')$q$,'anonymous mutation');
SELECT pg_temp.denied($q$SELECT * FROM public.join_requests$q$,'anonymous pitch');
SELECT pg_temp.denied($q$SELECT * FROM public.project_handoffs$q$,'anonymous handoff');
RESET ROLE;
