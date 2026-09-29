-- Runs only inside the disposable PostgreSQL cluster used by the security suite.
INSERT INTO auth.users(id) VALUES ('aaaaaaaa-1111-4111-8111-111111111111'), ('bbbbbbbb-1111-4111-8111-111111111111');
INSERT INTO public.feedback_admins VALUES ('bbbbbbbb-1111-4111-8111-111111111111');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',false);
SELECT public.submit_feedback('cccccccc-1111-4111-8111-111111111111','bug',4,'Private report','Keep this report private please','/dashboard',false,true);
SELECT public.submit_feedback('cccccccc-1111-4111-8111-111111111111','bug',4,'Private report','Keep this report private please','/dashboard',false,true);
SELECT public.submit_feedback('dddddddd-1111-4111-8111-111111111111','feature',5,'Public candidate','This review can be displayed publicly','/feedback',true,true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.feedback) THEN RAISE EXCEPTION 'Private row leak'; END IF;
 IF EXISTS(SELECT 1 FROM public.feedback_reviews) THEN RAISE EXCEPTION 'Pending leak'; END IF;
 BEGIN PERFORM public.moderate_feedback('cccccccc-1111-4111-8111-111111111111','approved'); RAISE EXCEPTION 'Unauthorized moderation'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.feedback SET status='approved'; RAISE EXCEPTION 'Direct update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.feedback; RAISE EXCEPTION 'Direct delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.feedback_admins VALUES(auth.uid()); RAISE EXCEPTION 'Privilege escalation'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.submit_feedback(gen_random_uuid(),'bug',6,'Invalid rating','An invalid rating must fail','/feedback',false,true); RAISE EXCEPTION 'Invalid rating allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.submit_feedback(gen_random_uuid(),'bug',3,'','An empty title must fail','/feedback',false,true); RAISE EXCEPTION 'Empty allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.feedback) <> 2 THEN RAISE EXCEPTION 'Replay created duplicate'; END IF; END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-1111-4111-8111-111111111111',false);
DO $$ DECLARE private_id uuid; public_id uuid; BEGIN
 SELECT id INTO private_id FROM public.feedback WHERE NOT is_public;
 SELECT id INTO public_id FROM public.feedback WHERE is_public;
 BEGIN PERFORM public.moderate_feedback(private_id,'approved'); RAISE EXCEPTION 'Private approval allowed' USING ERRCODE='23514'; EXCEPTION WHEN raise_exception THEN NULL; END;
 PERFORM public.moderate_feedback(public_id,'resolved');
 IF EXISTS(SELECT 1 FROM public.feedback_reviews) THEN RAISE EXCEPTION 'Resolution leaked pending review'; END IF;
 PERFORM public.moderate_feedback(public_id,'approved');
 IF (SELECT count(*) FROM public.feedback_reviews WHERE display_name='Anonymous Beta User') <> 1 THEN RAISE EXCEPTION 'Approval failed'; END IF;
 PERFORM public.moderate_feedback(public_id,'rejected');
 IF EXISTS(SELECT 1 FROM public.feedback_reviews) THEN RAISE EXCEPTION 'Rejection leaked review'; END IF;
 PERFORM public.moderate_feedback(public_id,'approved');
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.feedback_reviews) <> 1 THEN RAISE EXCEPTION 'Public read failed'; END IF;
 BEGIN PERFORM * FROM public.feedback; RAISE EXCEPTION 'Anonymous private access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.submit_feedback(gen_random_uuid(),'bug',3,'Anonymous write','Anonymous writes should fail','/feedback',false,true); RAISE EXCEPTION 'Anonymous write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
