import Link from "next/link";
import { TeamiesLogo } from "@/components/teamies-logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-(--theme-bg) px-5 py-12 text-(--theme-text)">
      <section className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <TeamiesLogo variant="horizontal" size="md" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-(--theme-text-muted)">404 · Page not found</p>
        <h1 className="mt-3 font-sans text-3xl font-bold tracking-tight text-(--theme-text)">Lost in the workshop?</h1>
        <p className="mt-4 text-sm text-(--theme-text-muted)">Check the address or explore projects looking for builders.</p>
        <Link href="/discover/projects" className="button-primary mt-6">Explore projects</Link>
      </section>
    </main>
  );
}
