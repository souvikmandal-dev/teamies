import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminRemoveControl } from "@/components/admin-remove-control";
import { humanize } from "@/lib/humanize";
import { isUuid } from "@/lib/validation";

export const metadata = {
  title: "Admin Console",
  robots: { index: false, follow: false },
};

type AdminProject = {
  id: string;
  name: string;
  status: string;
  owner_id: string;
  profiles: { full_name: string | null; username: string | null } | null;
};

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) redirect("/login?next=/admin");
  const { data: admin, error: adminError } = await db.rpc("is_platform_admin");
  if (adminError || admin !== true) notFound();

  const params = await searchParams;
  const tab = params.tab === "builders" ? "builders" : "projects";
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.min(10000, Math.max(1, Number(params.page) || 1)) | 0;
  const pageSize = 20;
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;

  let projectQuery = db.from("projects")
    .select("id,name,status,owner_id,profiles!projects_owner_id_fkey(full_name,username)", { count: "exact" });
  let builderQuery = db.from("profiles")
    .select("id,full_name,username,primary_role,projects!projects_owner_id_fkey(count)", { count: "exact" });
  if (search) {
    const searchIsId = isUuid(search as unknown);
    projectQuery = searchIsId ? projectQuery.eq("id", search) : projectQuery.ilike("name", pattern);
    builderQuery = searchIsId
      ? builderQuery.eq("id", search)
      : search.startsWith("@")
        ? builderQuery.ilike("username", `%${search.slice(1).replace(/[\\%_]/g, "\\$&")}%`)
        : builderQuery.ilike("full_name", pattern);
  }
  const start = (page - 1) * pageSize;
  const projectResult = tab === "projects"
    ? await projectQuery.order("created_at", { ascending: false }).order("id").range(start, start + pageSize - 1)
        .overrideTypes<AdminProject[], { merge: false }>()
    : null;
  const builderResult = tab === "builders"
    ? await builderQuery.order("created_at", { ascending: false }).order("id").range(start, start + pageSize - 1)
    : null;
  const error = projectResult?.error || builderResult?.error;
  const count = projectResult?.count ?? builderResult?.count ?? 0;
  const pageLink = (p: number) => `/admin?${new URLSearchParams({ tab, q: search, page: String(p) })}`;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <header className="border-b border-(--theme-border) pb-6">
        <nav aria-label="Admin navigation" className="flex flex-wrap gap-4 text-sm">
          <Link href="/dashboard" className="action-link-secondary">← Dashboard</Link>
          <Link href="/admin/feedback" className="action-link-secondary">Feedback moderation</Link>
        </nav>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Admin Console</h1>
        <p className="mt-2 text-sm text-(--theme-text-muted)">
          Manage all projects and builders. Permanent removal is restricted to admins.
        </p>
      </header>
      <nav aria-label="Admin sections" className="mt-6 flex gap-3">
        <Link href="/admin?tab=projects" aria-current={tab === "projects" ? "page" : undefined}
          className={tab === "projects" ? "button-primary text-xs" : "button-secondary text-xs"}>Projects</Link>
        <Link href="/admin?tab=builders" aria-current={tab === "builders" ? "page" : undefined}
          className={tab === "builders" ? "button-primary text-xs" : "button-secondary text-xs"}>Builders</Link>
      </nav>
      <form className="my-6 flex flex-wrap items-end gap-3 rounded-xl border border-(--theme-border) bg-(--theme-surface) p-4">
        <input type="hidden" name="tab" value={tab} />
        <label className="min-w-0 flex-1 text-xs text-(--theme-text-muted)">
          {tab === "projects" ? "Search project name or ID" : "Search builder name, @username, or ID"}
          <input name="q" type="search" defaultValue={search} maxLength={100}
            className="mt-2 h-10 w-full rounded-md border border-(--theme-border) bg-(--theme-bg) px-3 text-sm text-(--theme-text)" />
        </label>
        <button className="button-secondary text-xs">Search</button>
        {search ? <Link href={`/admin?tab=${tab}`} className="action-link-secondary text-xs">Clear</Link> : null}
      </form>
      {error ? (
        <p role="alert" className="text-sm text-(--theme-warn)">Unable to load {tab}. Please refresh to retry.</p>
      ) : (
        <>
          <p className="mb-4 text-xs text-(--theme-text-muted)">{count} {tab}</p>
          <section aria-label={tab === "projects" ? "All projects" : "All builders"} className="space-y-4">
            {projectResult?.data?.map((project) => (
              <article key={project.id} className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5">
                <h2 className="break-words text-lg font-semibold">
                  <Link href={`/projects/${project.id}`} className="hover:underline">{project.name}</Link>
                </h2>
                <p className="mt-1 text-sm text-(--theme-text-muted)">
                  {humanize(project.status)} · Owner: {project.profiles?.full_name || project.profiles?.username || project.owner_id}
                </p>
                <p className="mt-2 break-all font-mono text-xs text-(--theme-text-muted)">{project.id}</p>
                <AdminRemoveControl kind="project" id={project.id} identifier={project.name} />
              </article>
            ))}
            {builderResult?.data?.map((builder) => (
              <article key={builder.id} className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-5">
                <h2 className="break-words text-lg font-semibold">{builder.full_name || builder.username || "Unnamed builder"}</h2>
                <p className="mt-1 text-sm text-(--theme-text-muted)">
                  {builder.username ? <Link href={`/profile/${builder.username}`} className="hover:underline">@{builder.username}</Link> : "No username"}
                  {" · "}{humanize(builder.primary_role)} · {builder.projects[0]?.count ?? 0} owned projects
                </p>
                <p className="mt-2 break-all font-mono text-xs text-(--theme-text-muted)">{builder.id}</p>
                <AdminRemoveControl kind="builder" id={builder.id} identifier={builder.username || builder.id}
                  ownedProjects={builder.projects[0]?.count ?? 0} isSelf={builder.id === user.id} />
              </article>
            ))}
            {count === 0 ? <p className="rounded-xl border border-dashed border-(--theme-border) p-8 text-center text-sm text-(--theme-text-muted)">No {tab} match your search.</p> : null}
            {count > 0 && start >= count ? <p className="text-sm text-(--theme-text-muted)">No more results. <Link href={pageLink(1)} className="action-link-secondary">Return to page 1</Link></p> : null}
          </section>
          <nav aria-label="Admin result pages" className="mt-6 flex items-center justify-between border-t border-(--theme-border) pt-4 text-xs">
            {page > 1 ? <Link href={pageLink(page - 1)} className="action-link-secondary">← Previous</Link> : <span />}
            <span>Page {page}</span>
            {count > page * pageSize ? <Link href={pageLink(page + 1)} className="action-link-secondary">Next →</Link> : <span />}
          </nav>
        </>
      )}
    </main>
  );
}
