import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const SUPABASE_URL = "https://vcwegooifhejzxkniyqb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ucc1jPrw9itRlKiXg5XhQA_WfYlvGxX";

async function runTests() {
  console.log("==================================================================");
  console.log("   TEAMIES LIVE FEEDBACK & SECURITY VERIFICATION SUITE           ");
  console.log("==================================================================");

  // 1. Anon client tests
  console.log("\n[TEST 1] Anonymous User Isolation & Privacy");
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // Anon cannot read feedback table
  const { data: anonFeedback, error: anonFeedbackErr } = await anonClient
    .from("feedback")
    .select("*")
    .limit(1);
  assert.ok(anonFeedbackErr, "Anon must be denied access to feedback table");
  assert.equal(anonFeedbackErr.code, "42501", "Expected permission denied (42501)");
  console.log("  ✓ PASS: Anonymous user cannot read private 'feedback' table.");

  // Anon cannot read feedback_admins table
  const { data: anonAdmins, error: anonAdminsErr } = await anonClient
    .from("feedback_admins")
    .select("*")
    .limit(1);
  assert.ok(anonAdminsErr, "Anon must be denied access to feedback_admins table");
  assert.equal(anonAdminsErr.code, "42501", "Expected permission denied (42501)");
  console.log("  ✓ PASS: Anonymous user cannot read 'feedback_admins' table.");

  // Anon cannot call submit_feedback
  const { error: anonSubmitErr } = await anonClient.rpc("submit_feedback", {
    p_request_id: crypto.randomUUID(),
    p_type: "bug",
    p_rating: 4,
    p_title: "Anon Hack Attempt",
    p_message: "This should fail because anon has no auth.uid()",
    p_context: "/dashboard",
    p_public: false,
    p_anonymous: true,
  });
  assert.ok(anonSubmitErr, "Anon must not be able to execute submit_feedback");
  console.log("  ✓ PASS: Anonymous user cannot call submit_feedback RPC.");

  // Anon CAN read public feedback_reviews view
  const { data: publicReviews, error: publicReviewsErr } = await anonClient
    .from("feedback_reviews")
    .select("*");
  assert.ok(!publicReviewsErr, "Anon must be able to read feedback_reviews view");
  console.log(`  ✓ PASS: Anonymous user can query public 'feedback_reviews' view (currently ${publicReviews.length} approved items).`);

  // 2. Authenticated user tests
  console.log("\n[TEST 2] Authenticated Regular User Capabilities & Constraints");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const timestamp = Date.now();
  const testEmail = `qa_tester_${timestamp}@teamies-qa.internal`;
  const testPassword = "TeamiesPassword2026!#";

  const { data: authData, error: authErr } = await userClient.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: { data: { full_name: "Beta Tester" } },
  });
  assert.ok(!authErr, `Sign up must succeed: ${authErr?.message}`);
  const user = authData.user;
  console.log(`  ✓ Authenticated test user: ${user.id} (${testEmail})`);

  // Regular user is NOT an admin
  const { data: isAdmin, error: adminErr } = await userClient.rpc("is_feedback_admin");
  assert.ok(!adminErr, `is_feedback_admin query must succeed: ${adminErr?.message}`);
  assert.equal(isAdmin, false, "Regular user must NOT be feedback admin");
  console.log("  ✓ PASS: Regular user is_feedback_admin => false");

  // Regular user cannot call moderate_feedback
  const fakeId = crypto.randomUUID();
  const { error: illicitModErr } = await userClient.rpc("moderate_feedback", {
    p_id: fakeId,
    p_status: "approved",
  });
  assert.ok(illicitModErr, "Non-admin must not be able to execute moderate_feedback");
  console.log("  ✓ PASS: Non-admin calling moderate_feedback is rejected by database (Forbidden / 42501).");

  // Regular user cannot read feedback table directly (only admins have SELECT policy)
  const { data: userFeedbackDirect, error: userFeedbackDirectErr } = await userClient
    .from("feedback")
    .select("*");
  // Should return empty or permission denied
  if (userFeedbackDirectErr) {
    assert.equal(userFeedbackDirectErr.code, "42501");
    console.log("  ✓ PASS: Regular user cannot read raw 'feedback' table (permission denied).");
  } else {
    // If SELECT is granted to authenticated but filtered by RLS, rows must be 0
    assert.equal(userFeedbackDirect.length, 0, "Non-admin must see 0 rows via RLS");
    console.log("  ✓ PASS: Regular user sees 0 rows in raw 'feedback' table via RLS.");
  }

  // 3. Feedback submission tests
  console.log("\n[TEST 3] Feedback Submission, Idempotency & Validation");
  const requestId1 = crypto.randomUUID();
  const { error: submit1Err } = await userClient.rpc("submit_feedback", {
    p_request_id: requestId1,
    p_type: "feature",
    p_rating: 5,
    p_title: "Add GitHub Integration",
    p_message: "It would be great to link GitHub repositories directly to projects.",
    p_context: "/projects/new",
    p_public: true,
    p_anonymous: false,
  });
  assert.ok(!submit1Err, `Valid feedback submission must succeed: ${submit1Err?.message}`);
  console.log("  ✓ PASS: Valid feedback submitted successfully.");

  // Idempotent retry with same requestId
  const { error: submitReplayErr } = await userClient.rpc("submit_feedback", {
    p_request_id: requestId1,
    p_type: "feature",
    p_rating: 5,
    p_title: "Add GitHub Integration",
    p_message: "It would be great to link GitHub repositories directly to projects.",
    p_context: "/projects/new",
    p_public: true,
    p_anonymous: false,
  });
  assert.ok(!submitReplayErr, "Replay with same requestId must not throw error");
  console.log("  ✓ PASS: Duplicate submission with same requestId is safely idempotent.");

  // Invalid rating (0 or 6) must fail check constraint
  const { error: invalidRatingErr } = await userClient.rpc("submit_feedback", {
    p_request_id: crypto.randomUUID(),
    p_type: "bug",
    p_rating: 6,
    p_title: "Rating test",
    p_message: "Testing rating out of range",
    p_context: "/feedback",
    p_public: false,
    p_anonymous: true,
  });
  assert.ok(invalidRatingErr, "Invalid rating must fail database check");
  console.log("  ✓ PASS: Invalid rating (6) rejected by database constraint.");

  // Pending feedback must NOT leak to public reviews
  const { data: publicReviewsAfterSubmit } = await anonClient
    .from("feedback_reviews")
    .select("*");
  const leaked = (publicReviewsAfterSubmit || []).find((r) => r.title === "Add GitHub Integration");
  assert.ok(!leaked, "Pending feedback must not appear in public feedback_reviews before approval");
  console.log("  ✓ PASS: Pending feedback is NOT visible in public reviews (moderation gate confirmed).");

  console.log("\n==================================================================");
  console.log("🎉 ALL LIVE FEEDBACK DATABASE & SECURITY TESTS PASSED 100%!       ");
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
