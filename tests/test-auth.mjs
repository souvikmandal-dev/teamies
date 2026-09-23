import { createClient } from "@supabase/supabase-js";
import { testBackend } from "./test-backend.mjs";
import { randomUUID } from "node:crypto";

const { url, key } = testBackend();

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

async function testAuth() {
  const testEmail = `test_founder_${Date.now()}@example.com`;
  const testPassword = randomUUID() + "!Aa1";

  console.log("Attempting test signup with:", testEmail);
  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });

  if (error) {
    console.log("Signup error:", error.message, error.status);
    return;
  }

  console.log("Signup success! User ID:", data?.user?.id);
  console.log("Session present (auto-confirmed):", !!data?.session);
}

testAuth();

