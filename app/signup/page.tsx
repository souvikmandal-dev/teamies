"use client";

import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TeamiesLogo } from "@/components/teamies-logo";

import { supabase } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setErrorMessage("Complete all fields to create your account.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: trimmedName,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccessMessage(
        "Account created. Check your email to confirm your account, then sign in.",
      );
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

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

      <section className="mx-auto flex w-full max-w-7xl justify-center px-5 py-12 sm:px-8 sm:py-20 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-(--theme-text-muted)">
              {APP_NAME}
            </p>
            <h1 className="text-3xl sm:text-4xl font-sans font-bold tracking-[-0.04em] text-(--theme-text)">
              Create your builder profile
            </h1>
            <p className="mt-3 text-sm text-(--theme-text-muted)">
              Join Teamies and start building with the right people.
            </p>
          </div>

          <div className="rounded-xl border border-(--theme-border) bg-(--theme-surface) p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="full-name"
                  className="mb-2 block text-xs font-mono uppercase tracking-[0.12em] text-(--theme-text-muted)"
                >
                  Full name
                </label>
                <input
                  id="full-name"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  aria-describedby={errorMessage ? "signup-error" : undefined}
                  className="h-11 w-full rounded-md border border-(--theme-border) bg-(--theme-surface) px-3 text-sm text-(--theme-text) outline-none transition focus:border-(--theme-accent) focus:ring-2 focus:ring-(--theme-accent)/20"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-xs font-mono uppercase tracking-[0.12em] text-(--theme-text-muted)"
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
                  aria-describedby={errorMessage ? "signup-error" : undefined}
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
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={
                    errorMessage ? "password-hint signup-error" : "password-hint"
                  }
                  className="h-11 w-full rounded-md border border-(--theme-border) bg-(--theme-surface) px-3 text-sm text-(--theme-text) outline-none transition focus:border-(--theme-accent) focus:ring-2 focus:ring-(--theme-accent)/20"
                  placeholder="Create a password"
                />
                <p id="password-hint" className="mt-2 text-xs font-mono text-(--theme-text-muted)">
                  Use at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-2 block text-xs font-mono uppercase tracking-[0.12em] text-(--theme-text-muted)"
                >
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-describedby={errorMessage ? "signup-error" : undefined}
                  className="h-11 w-full rounded-md border border-(--theme-border) bg-(--theme-surface) px-3 text-sm text-(--theme-text) outline-none transition focus:border-(--theme-accent) focus:ring-2 focus:ring-(--theme-accent)/20"
                  placeholder="Repeat your password"
                />
              </div>

              {errorMessage ? (
                <p
                  id="signup-error"
                  role="alert"
                  className="rounded-md border border-(--theme-warn) bg-(--theme-warn-soft) px-4 py-3 text-sm leading-6 text-(--theme-warn)"
                >
                  {errorMessage}
                </p>
              ) : null}

              {successMessage ? (
                <p
                  role="status"
                  className="rounded-md border border-(--theme-accent) bg-(--theme-accent-soft) px-4 py-3 text-sm leading-6 text-(--theme-accent)"
                >
                  {successMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="button-primary w-full !h-11 !text-sm"
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-(--theme-text-muted)">
              Already have an account?{" "}
              <Link
                href="/login"
                className="action-link-secondary"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
