import { createClient } from "@supabase/supabase-js";
import { testBackend } from "./test-backend.mjs";

const { url, key } = testBackend();

const supabase = createClient(url, key);

async function inspectSchema() {
  console.log("=== REMOTE SCHEMA INSPECTION ===");
  const tables = [
    "profiles",
    "projects",
    "project_roles",
    "project_members",
    "join_requests",
    "notifications",
    "activity_events",
    "owner_responsiveness",
    "reports",
    "project_handoffs",
  ];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.log(`Table '${table}': ERROR/MISSING -> ${error.message} (code: ${error.code})`);
    } else {
      const sample = data?.[0] || {};
      const cols = Object.keys(sample);
      console.log(`Table '${table}': EXISTS (${data.length} rows sample) -> columns: [${cols.join(", ")}]`);
    }
  }
}

inspectSchema();

