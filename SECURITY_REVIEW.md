# Teamies security and release review

Date: 2026-09-23. Scope: local source, migrations 001–010, production build and disposable database tests. No production database migration, deployment, commit or push was performed.

## Release prerequisite

**Migration `010_security_boundary.sql` is required with this application version.** It has been tested on clean isolated PostgreSQL, not applied to the connected Supabase project. Back up the database, test on staging with representative existing data, and coordinate the migration and application release. Do not run the new application against an unmigrated database: sensitive mutations intentionally fail closed.

The migration copies handoff content into a private table before dropping the public columns, all in one transaction. Existing invalid/oversized data causes rollback instead of silent deletion. Review and correct invalid rows privately before retrying. Existing table, function, trigger and migration names were not cosmetically renamed.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| High | Private team links/instructions were columns of publicly readable projects | Separate `project_handoffs` table with owner/active-member read RLS and owner-only writes; no public-column fallback |
| High | Direct owner membership writes bypassed acceptance/capacity; failed RPCs fell back to non-atomic writes | Revoke direct membership writes; require checked RPCs; serialize membership operations on project rows |
| High | Client-invoked rate checks could be skipped, counters reset, and failures allowed writes | Database triggers increment counters atomically with mutations; revoke client counter access; fail-closed UX preflight |
| High | Team/role capacities could be lowered below existing membership | Database capacity guards and immutable identities; occupied-role deletion protection |
| Medium | Login destination accepted backslash variants of external redirects | Strict local-path validation for login and notification navigation |
| Medium | Team URLs and several inputs lacked runtime bounds/type checks | Runtime action validators, database length/array/URL constraints, and render-time URL guards |
| Medium | Direct deletion skipped confirmation; fallback writes sometimes reported false success | Owner-bound, exact-name deletion RPC; direct delete revoked; fail-closed errors |
| Medium | Broad writable columns and default privileged-function execution | Column grants, immutable identifiers, explicit execution grants; stale scanning restricted to service role |
| Medium | Raw database errors could reach user messages or browser logs | Safe user errors and reduced diagnostic logging |
| Low | Missing security headers and broad compatibility-error detection | CSP, anti-framing, nosniff, referrer/permissions policies; precise missing-column matching |

Existing private application and notification read policies were verified; unrelated users cannot read either. Public profiles, projects, active team information, activity events and aggregate owner responsiveness remain intentionally discoverable. User text uses React text rendering; no raw HTML insertion was found. Supabase auth remains session-based, with server actions deriving identity using `getUser()` and database policies enforcing direct REST requests.

Rate limits: project creation 5/day; profile edits 20/hour; application creation 10/hour; reports 10/hour; deletion 10/hour; project management and application decisions 100/hour. Limits use fixed windows and count committed mutations, not every failed attempt. Auth-provider/IP abuse controls remain an operational responsibility. Rate-limit rows require periodic retention cleanup by a trusted administrator.

## Teamies branding

Frontend copy, T↗ marks, metadata/Open Graph/Twitter metadata, manifest, package metadata, backend labels, SQL comments and test text use Teamies. Shared metadata/navbar constants live in `lib/brand.ts`. Database-generated notifications and activity text were inspected; their existing generic text contains no previous product name. No database identifiers or Supabase environment names were renamed for branding. The workspace's existing directory name is unchanged.

Legacy-brand search: no old-name occurrences remain in maintained source/configuration/tests/SQL. The remaining 14 ignored-file matches are classified as generated local state: 13 stale development-cache files under `.next/dev` and the install metadata `node_modules/.package-lock.json`. These are not maintained source or commit candidates; production HTML and bundles contain no legacy branding. Restart any already-running development server to refresh its old cache. Local environment content contains no legacy-brand match. There are no email-template or existing storage/callback identifiers requiring a rename in this source tree. External Supabase dashboard/auth email branding is not managed by these files and was not changed.

## Validation

- `npx tsc --noEmit`: passes.
- `npm run lint`: passes, zero errors/warnings.
- `npm run build`: production webpack build passes.
- `npm audit --json`: zero reported vulnerabilities; lockfile dependencies unchanged.
- 13 unit/scenario/discovery tests pass, including malformed input, unsafe URLs, redirects, escaped scripts, stale lifecycle and incomplete builder records.
- Migrations 001–010 execute successfully in isolated PostgreSQL.
- Database suite verifies cross-user edits/deletes, self-acceptance, anonymous access, application/notification privacy, private handoff access and revocation, mass assignment, replay, exact delete confirmation, cascades, URL/bounds validation, profile upsert, acceptance/rejection notifications, role reassignment, removal and leaving.
- Six real concurrent tests pass: final role seat, final project seat, role reduction vs acceptance, team reduction vs acceptance, transfer vs acceptance, and rate-limit increments.
- Local production HTTP smoke tests cover auth pages, onboarding, dashboard redirection, settings, project creation shell/detail, profiles and both discovery routes. Security headers are present; HSTS is absent on local HTTP.
- Production Server Action smoke tests also confirm unauthenticated deletion is denied, malformed inputs are rejected, and cross-origin requests are rejected. All 12 tested route responses have Teamies branding, including manifest and Open Graph/Twitter metadata.
- Full authenticated browser workflow is not claimed: browser access to the local test origin was blocked, and no disposable live Supabase credentials were provided. Database workflow tests use synthetic users and a local auth identity stub, not the hosted Supabase Auth service.

The standalone TypeScript test runner emits Node's module-type detection warning; this is not an ESLint warning or a failed test.

## Git and credentials

The workspace initially had no `.git` directory; Git was initialized externally during this pass. Final checks show **no commits, no tracked files and no staged files**, with 74 untracked candidate files. Thus no sensitive file is tracked in the current repository. `git diff` and `git diff --cached` are empty because all files are untracked; source changes were instead compared with a temporary initial snapshot. Unrelated concurrent edits were preserved. This pass did not create a workspace repository, remote or commit. Ignore behavior was verified with both a disposable bare Git directory under `/tmp` and the final workspace Git metadata.

`.gitignore` protects local environments, dependencies/build caches, key containers, editor files, temporary files, dumps and local Supabase state, while allowing `.env.example` and migrations. The example contains placeholders only. All 74 candidate source/configuration/test files were scanned: no detected live secret token/private key, legacy-brand text or file over 5 MB. The local environment was preserved; only intended public Supabase configuration variables are present. No server-role credential was found in client code.

Concurrent test scripts contained a fixed test password and implicitly targeted `.env.local`. They now generate random passwords and require explicit isolated test configuration. If those older scripts were previously run against a real project, remove or rotate those synthetic test accounts; their previous shared password must not be trusted. No production secret requiring rotation was identified by this pass. There is no commit history in this newly initialized repository; prior exposure elsewhere cannot be assessed.

## Test reproduction

Unit tests (Node with TypeScript stripping support):

```sh
node --experimental-strip-types --test tests/security.test.mjs tests/scenario-tests.mjs tests/discover-builders.test.mjs
```

Database tests use [embedded-postgres](https://github.com/leinelissen/embedded-postgres) installed outside the application dependencies. In a temporary tooling directory install `embedded-postgres` and `pg`, permitting the package's documented symlink hydration install script. Set `TEAMIES_TEST_TOOLS` to that directory, then run:

```sh
node tests/run-database-security.mjs
```

The runner creates a disposable local cluster on loopback port 55439 with random credentials, applies migrations, executes attack/concurrency tests and stops/removes its database. It never reads application credentials or connects to remote Supabase. Other remote test scripts require explicit `TEAMIES_TEST_SUPABASE_URL` / `TEAMIES_TEST_SUPABASE_ANON_KEY`; non-loopback tests additionally require `TEAMIES_ALLOW_REMOTE_TESTS=true`. Use only a disposable project.

## Remaining release checks

Apply/test migration 010 on staging with existing data before any beta deployment. Re-run authenticated browser flows against that staging project, including auth email branding managed outside this repository. Schedule stale-event generation with a trusted service job, since public execution is deliberately revoked. Enable `ENABLE_HSTS=true` only on an exclusively HTTPS production host. CSP retains inline scripts for Next hydration; a nonce policy remains future work. This review does not establish that the application is vulnerability-free.

Repository is ready for user review before commit/push. Staging migration and authenticated workflow checks remain release prerequisites. NO git push was performed.
