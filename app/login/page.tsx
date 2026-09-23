"use client";

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { TeamiesLogo } from "@/components/teamies-logo";

import { safeInternalPath } from "@/lib/safe-redirect";
import { supabase } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectDestination = safeInternalPath(nextParam);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("Enter your email and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.replace(redirectDestination);
      router.refresh();
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-zinc-800"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby={errorMessage ? "login-error" : undefined}
          className="h-11 w-full rounded-md border border-(--theme-border) bg-(--theme-surface) px-3 text-sm text-(--theme-text) outline-none transition focus:border-(--theme-accent) focus:ring-2 focus:ring-(--theme-accent)/20"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-xs font-mono uppercase tracking-[0.12em] text-(--theme-text-muted)"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={errorMessage ? "login-error" : undefined}
          className="h-11 w-full rounded-md border border-(--theme-border) bg-(--theme-surface) px-3 text-sm text-(--theme-text) outline-none transition focus:border-(--theme-accent) focus:ring-2 focus:ring-(--theme-accent)/20"
          placeholder="Enter your password"
        />
      </div>

      {errorMessage ? (
        <p
          id="login-error"
          role="alert"
          className="rounded-md border border-(--theme-warn) bg-(--theme-warn-soft) px-4 py-3 text-sm leading-6 text-(--theme-warn)"
        >
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="button-primary w-full !h-11 !text-sm"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-(--theme-bg) text-(--theme-text)">
      <header className="border-b border-(--theme-border)">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-accent) rounded-lg"
            aria-label="Teamies"
          >
            <TeamiesLogo variant="auto" priority />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-(--theme-text-muted) transition-colors hover:text-(--theme-text)"
          >
            Back to home
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-7xl justify-center px-5 py-16 sm:px-8 sm:py-24 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-(--theme-text-muted)">
              {APP_NAME}
            </p>
            <h1 className="text-3xl sm:text-4xl font-sans font-bold tracking-[-0.04em] text-(--theme-text)">
              Welcome back
            </h1>
            <p className="mt-3 text-sm text-(--theme-text-muted)">
              Sign in to continue building.
            </p>
          </div>

          <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 sm:p-8">
            <Suspense
              fallback={
                <div className="py-10 text-center text-xs font-mono text-(--theme-text-muted)">
                  Loading form...
                </div>
              }
            >
              <LoginForm />
            </Suspense>

            <p className="mt-6 text-center text-sm text-(--theme-text-muted)">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="action-link-secondary"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
