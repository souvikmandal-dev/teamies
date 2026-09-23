import { createClient } from "@supabase/supabase-js";
import { testBackend } from "./test-backend.mjs";

const { url, key } = testBackend();

console.log("Supabase URL:", url);
console.log("Supabase Key provided:", !!key);

if (!url || !key) {
  console.error("Missing credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function testConnection() {
  try {
    const { data: projects, error: projErr } = await supabase.from("projects").select("id, name, status, recruiting_status").limit(5);
    if (projErr) {
      console.log("Projects query error (testing schema compat):", projErr.message);
    } else {
      console.log("Projects query success, count:", projects?.length, projects);
    }

    const { data: profiles, error: pError } = await supabase.from("profiles").select("id, username, full_name").limit(5);
    if (pError) {
      console.log("Profiles query error:", pError.message);
    } else {
      console.log("Profiles query success, count:", profiles?.length, profiles);
    }
  } catch (err) {
    console.error("Connection exception:", err);
  }
}

testConnection();

