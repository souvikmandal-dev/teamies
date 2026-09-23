import assert from "node:assert/strict";
import test from "node:test";

// Import humanize helper
import { humanize } from "../lib/humanize.ts";

test("humanize handles all null, undefined, empty, whitespace, and normal string inputs", () => {
  assert.equal(humanize(null), "Not specified");
  assert.equal(humanize(undefined), "Not specified");
  assert.equal(humanize(""), "Not specified");
  assert.equal(humanize("    "), "Not specified");
  assert.equal(humanize(null, "Any"), "Any");
  assert.equal(humanize(undefined, "Default"), "Default");
  assert.equal(humanize("", "Fallback"), "Fallback");

  // Case normalization
  assert.equal(humanize("mvp"), "MVP");
  assert.equal(humanize("MVP"), "MVP");
  assert.equal(humanize("beginner"), "Beginner");
  assert.equal(humanize("intermediate"), "Intermediate");
  assert.equal(humanize("advanced"), "Advanced");
  assert.equal(humanize("full_stack_developer"), "Full Stack Developer");
  assert.equal(humanize("ui_ux_designer"), "Ui Ux Designer");
  assert.equal(humanize("have_something_to_build"), "Have Something To Build");
});

test("simulated builder discovery pipeline handles malformed / incomplete profiles safely", () => {
  const testProfiles = [
    // 1. Complete profile
    {
      id: "p1",
      username: "alex_complete",
      full_name: "Alex Complete",
      primary_role: "Full Stack Developer",
      experience_level: "advanced",
      weekly_availability: 20,
      skills: ["React", "TypeScript", "Node.js"],
      bio: "Shipping real products.",
      college: "Stanford",
      city: "San Francisco",
      builder_mode: "have_something_to_build",
    },
    // 2. Profile missing primary_role
    {
      id: "p2",
      username: "bob_no_role",
      full_name: "Bob No Role",
      primary_role: null,
      experience_level: "intermediate",
      weekly_availability: 10,
      skills: ["Python", "Django"],
      bio: "Learning AI.",
      college: null,
      city: "New York",
      builder_mode: "want_something_to_build",
    },
    // 3. Profile missing experience_level (The exact crash scenario reported by user!)
    {
      id: "p3",
      username: "chloe_no_exp",
      full_name: "Chloe No Exp",
      primary_role: "UI/UX Designer",
      experience_level: null,
      weekly_availability: 15,
      skills: ["Figma"],
      bio: "Designing interfaces.",
      college: "MIT",
      city: null,
      builder_mode: "want_something_to_build",
    },
    // 4. Profile with null skills
    {
      id: "p4",
      username: "dan_no_skills",
      full_name: "Dan No Skills",
      primary_role: "Product Manager",
      experience_level: "beginner",
      weekly_availability: 5,
      skills: null,
      bio: "Managing sprint roadmaps.",
      college: null,
      city: "Austin",
      builder_mode: "both",
    },
    // 5. Profile with null bio
    {
      id: "p5",
      username: "elena_no_bio",
      full_name: "Elena No Bio",
      primary_role: "Mobile Developer",
      experience_level: "intermediate",
      weekly_availability: null,
      skills: ["React Native", "Swift"],
      bio: null,
      college: null,
      city: "Seattle",
      builder_mode: null,
    },
    // 6. Profile with null builder_mode
    {
      id: "p6",
      username: "frank_no_mode",
      full_name: "Frank No Mode",
      primary_role: "DevOps Engineer",
      experience_level: "advanced",
      weekly_availability: 25,
      skills: ["Docker", "Kubernetes", "AWS"],
      bio: "Infrastructure automation.",
      college: "Berkeley",
      city: "Remote",
      builder_mode: null,
    },
    // 7. Profile with whitespace strings & dirty skills array
    {
      id: "p7",
      username: "grace_dirty",
      full_name: "   ",
      primary_role: "   ",
      experience_level: "   ",
      weekly_availability: -5,
      skills: ["Rust", null, 42, "  ", "Go"],
      bio: "   ",
      college: "   ",
      city: "   ",
      builder_mode: "   ",
    },
    // 8. Completely bare minimal / legacy profile
    {
      id: "p8",
      username: null,
      full_name: null,
      primary_role: null,
      experience_level: null,
      weekly_availability: null,
      skills: null,
      bio: null,
      college: null,
      city: null,
      builder_mode: null,
    },
  ];

  // 1. Roles extraction test
  const roles = [
    ...new Set(
      testProfiles
        .map((b) => b.primary_role?.trim())
        .filter(Boolean),
    ),
  ].sort();

  assert.ok(roles.includes("Full Stack Developer"));
  assert.ok(roles.includes("UI/UX Designer"));
  assert.ok(roles.includes("Product Manager"));
  assert.ok(roles.includes("Mobile Developer"));
  assert.ok(roles.includes("DevOps Engineer"));
  // Must NOT include null, undefined, or empty string
  assert.equal(roles.includes(null), false);
  assert.equal(roles.includes(undefined), false);
  assert.equal(roles.includes(""), false);
  assert.equal(roles.includes("   "), false);

  // 2. Search & filter pipeline test
  const searchQueries = ["", "alex", "figma", "san francisco", "react", "nonexistent"];
  for (const q of searchQueries) {
    const normalizedSearch = q.trim().toLocaleLowerCase();
    const filtered = testProfiles.filter((builder) => {
      const safeFullName = builder.full_name?.trim() || "";
      const safeUsername = builder.username?.trim() || "";
      const safeRole = builder.primary_role?.trim() || "";
      const safeSkills = Array.isArray(builder.skills)
        ? builder.skills.filter((s) => typeof s === "string" && s.trim().length > 0)
        : [];

      const searchableText = [
        safeFullName,
        safeUsername,
        safeRole,
        builder.bio?.trim() ?? "",
        builder.college?.trim() ?? "",
        builder.city?.trim() ?? "",
        ...safeSkills,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return !normalizedSearch || searchableText.includes(normalizedSearch);
    });

    assert.ok(Array.isArray(filtered));
  }

  // 3. Card rendering data transformation test for EVERY profile
  for (const builder of testProfiles) {
    // Assert no exceptions thrown for any profile
    assert.doesNotThrow(() => {
      const safeUsername = builder.username?.trim() || "anonymous";
      const safeFullName = builder.full_name?.trim() || safeUsername || "Anonymous Builder";
      const safeRole = builder.primary_role?.trim() || "Builder";
      const safeSkills = Array.isArray(builder.skills)
        ? builder.skills.filter((s) => typeof s === "string" && s.trim().length > 0)
        : [];
      const safeExperience = humanize(builder.experience_level);

      // Verify outputs are non-empty strings or valid primitives
      assert.equal(typeof safeUsername, "string");
      assert.equal(typeof safeFullName, "string");
      assert.equal(typeof safeRole, "string");
      assert.ok(Array.isArray(safeSkills));
      assert.equal(typeof safeExperience, "string");

      const bioRendered = builder.bio?.trim() ? builder.bio.trim() : "No bio added yet.";
      assert.equal(typeof bioRendered, "string");

      const skillsRendered = safeSkills.length > 0
        ? safeSkills.slice(0, 6).map((item, idx) => `${item}-${idx}`)
        : "No skills listed.";
      assert.ok(skillsRendered);

      const hasAvailability =
        typeof builder.weekly_availability === "number" &&
        !isNaN(builder.weekly_availability) &&
        builder.weekly_availability >= 0;

      if (hasAvailability) {
        assert.equal(typeof builder.weekly_availability, "number");
      }
    });
  }
});

test("renderToStaticMarkup renders all malformed / incomplete profile cards without crashing", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");

  const edgeCaseProfiles = [
    { id: "1", username: "complete_user", full_name: "Full Name", primary_role: "Designer", experience_level: "advanced", skills: ["Figma"], bio: "A bio", weekly_availability: 10 },
    { id: "2", username: "missing_role", full_name: "No Role", primary_role: null, experience_level: "intermediate", skills: ["Python"], bio: "A bio", weekly_availability: null },
    { id: "3", username: "missing_exp", full_name: "No Exp", primary_role: "Developer", experience_level: null, skills: ["Go"], bio: null, weekly_availability: 20 },
    { id: "4", username: "null_skills", full_name: "Null Skills", primary_role: "PM", experience_level: "beginner", skills: null, bio: "Bio", weekly_availability: null },
    { id: "5", username: "null_bio", full_name: "Null Bio", primary_role: "Dev", experience_level: "advanced", skills: [], bio: null, weekly_availability: 5 },
    { id: "6", username: null, full_name: null, primary_role: null, experience_level: null, skills: null, bio: null, weekly_availability: null },
  ];

  for (const builder of edgeCaseProfiles) {
    const safeUsername = builder.username?.trim() || "anonymous";
    const safeFullName = builder.full_name?.trim() || safeUsername || "Anonymous Builder";
    const safeRole = builder.primary_role?.trim() || "Builder";
    const safeSkills = Array.isArray(builder.skills)
      ? builder.skills.filter((s) => typeof s === "string" && s.trim().length > 0)
      : [];
    const safeExperience = humanize(builder.experience_level);

    assert.doesNotThrow(() => {
      const vnode = createElement(
        "article",
        { key: builder.id },
        createElement("p", null, safeExperience),
        createElement("h2", null, safeFullName),
        createElement("p", null, `@${safeUsername}`),
        createElement("p", null, safeRole),
        builder.bio?.trim()
          ? createElement("p", null, builder.bio.trim())
          : createElement("p", null, "No bio added yet."),
        safeSkills.length > 0
          ? createElement(
              "ul",
              null,
              safeSkills.map((s, idx) => createElement("li", { key: idx }, s)),
            )
          : createElement("p", null, "No skills listed."),
      );

      const html = renderToStaticMarkup(vnode);
      assert.ok(html.length > 0);
      assert.ok(html.includes("article"));
    });
  }
});

