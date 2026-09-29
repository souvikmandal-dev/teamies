import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { BuildFlow } from "@/components/build-flow";
import { TeamiesLogo } from "@/components/teamies-logo";

export default function Home() {

  return (
    <main className="motion-home min-h-screen bg-(--theme-bg) text-(--theme-text)">
      <header className="border-b border-(--theme-border)">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-y-4 px-5 py-5 sm:flex-nowrap sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
            aria-label="Teamies"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>

          <nav
            aria-label="Primary navigation"
            className="order-3 flex w-full items-center justify-center gap-7 border-t border-(--theme-border) pt-4 text-sm font-medium text-(--theme-text-muted) sm:order-none sm:w-auto sm:border-0 sm:pt-0"
          >
            <Link
              href="/discover/projects"
              className="transition-colors hover:text-(--theme-text)"
            >
              Explore Projects
            </Link>
            <Link
              href="/discover/builders"
              className="transition-colors hover:text-(--theme-text)"
            >
              Find Builders
            </Link>
            <Link
              href="/feedback"
              className="transition-colors hover:text-(--theme-text)"
            >
              Feedback
            </Link>
            <Link
              href="/login"
              className="transition-colors hover:text-(--theme-text)"
            >
              Login
            </Link>
          </nav>

          <Link
            href="/signup"
            className="button-primary !py-2 !px-5"
          >
            Start Building
          </Link>
        </div>
      </header>

      <section className="motion-hero mx-auto flex max-w-7xl flex-col items-center px-5 pb-24 pt-20 text-center sm:px-8 sm:pb-32 sm:pt-28 lg:px-10 lg:pb-36 lg:pt-36">
        <div className="hero-copy">
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.18em] text-(--theme-text-muted)">
            Better projects start with the right people
          </p>

          <h1 className="max-w-5xl font-sans text-balance text-5xl font-bold leading-[1.02] tracking-[-0.05em] text-(--theme-text) sm:text-6xl lg:text-7xl">
            Find people.
            <br />
            Build together.
            <br />
            Ship something real.
          </h1>

          <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-(--theme-text-muted) sm:text-xl">
            Find serious collaborators for projects, hackathons, startups, and
            ideas worth building.
          </p>

          <div className="mt-10 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/signup"
              className="button-primary !h-12 !px-8 !text-base"
            >
              Start Building
            </Link>
            <Link
              href="/discover/projects"
              className="button-secondary !h-12 !px-8 !text-base"
            >
              Explore Projects
            </Link>
          </div>

          <div className="mt-12 text-left">
            <ActivityFeed limit={5} />
          </div>
        </div>
        <BuildFlow />
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-28 lg:px-10">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="journey-title text-3xl font-sans font-bold text-(--theme-text)">How it works.</h2>
          <p className="max-w-md text-sm leading-6 text-(--theme-text-muted) sm:text-right">
            A simple path from finding the right people to finishing work that
            matters.
          </p>
        </div>

        <ol className="grid overflow-hidden rounded-xl border border-(--theme-border) bg-(--theme-surface) md:grid-cols-3">
          <li className="border-b border-(--theme-border) p-7 last:border-b-0 sm:p-8 md:border-b-0 md:border-r md:border-(--theme-border) md:last:border-r-0">
            <span className="font-mono text-xs text-(--theme-text-muted)">01</span>
            <h3 className="mt-8 text-2xl font-sans font-semibold tracking-[-0.03em] text-(--theme-text)">
              Find
            </h3>
            <p className="mt-3 leading-7 text-(--theme-text-muted)">
              Discover builders with the skills, interests, and availability
              you need.
            </p>
          </li>

          <li className="border-b border-(--theme-border) p-7 last:border-b-0 sm:p-8 md:border-b-0 md:border-r md:border-(--theme-border) md:last:border-r-0">
            <span className="font-mono text-xs text-(--theme-text-muted)">02</span>
            <h3 className="mt-8 text-2xl font-sans font-semibold tracking-[-0.03em] text-(--theme-text)">
              Build
            </h3>
            <p className="mt-3 leading-7 text-(--theme-text-muted)">
              Form a team around a real project and work toward something
              concrete.
            </p>
          </li>

          <li className="border-b border-(--theme-border) p-7 last:border-b-0 sm:p-8 md:border-b-0 md:border-r md:border-(--theme-border) md:last:border-r-0">
            <span className="font-mono text-xs text-(--theme-text-muted)">03</span>
            <h3 className="mt-8 text-2xl font-sans font-semibold tracking-[-0.03em] text-(--theme-text)">
              Ship
            </h3>
            <p className="mt-3 leading-7 text-(--theme-text-muted)">
              Finish something real and start building a reputation through
              actual work.
            </p>
          </li>
        </ol>
      </section>
    </main>
  );
}
