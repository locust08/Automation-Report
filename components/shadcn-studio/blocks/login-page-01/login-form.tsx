"use client";

import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

const LOCKOUT_STORAGE_KEY = "ads-reporting-login-lockout-until-v2";

function getOAuthErrorMessage(authError: string | null) {
  if (authError === "organization") return "You are not in these organizations.";
  if (authError === "inactive") return "Your account is inactive. Contact your administrator.";
  return authError ? "Google sign-in could not be completed. Please try again." : null;
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function GoogleSignInButton() {
  return (
    <a
      href="/api/auth/google"
      className="group flex h-11 w-full items-center justify-center rounded-md border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f8faff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4285f4] focus-visible:ring-offset-2 active:bg-[#f2f2f2]"
    >
      <span className="flex items-center gap-3">
        <svg aria-hidden="true" className="size-[18px] shrink-0" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          <path fill="none" d="M0 0h48v48H0z" />
        </svg>
        <span>Sign in with Google</span>
      </span>
    </a>
  );
}

const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    getOAuthErrorMessage(searchParams.get("authError")),
  );
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    const storedLockout = Number(window.localStorage.getItem(LOCKOUT_STORAGE_KEY));
    if (Number.isFinite(storedLockout) && storedLockout > Date.now()) {
      const timeout = window.setTimeout(() => {
        setLockoutUntil(storedLockout);
        setAttemptsRemaining(0);
        setRetryAfterSeconds(Math.ceil((storedLockout - Date.now()) / 1000));
      }, 0);
      return () => window.clearTimeout(timeout);
    } else {
      window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return;

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setRetryAfterSeconds(seconds);

      if (seconds === 0) {
        window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
        setLockoutUntil(null);
        setAttemptsRemaining(3);
        setErrorMessage(null);
      }
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [lockoutUntil]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryAfterSeconds > 0) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          rememberMe,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        attemptsRemaining?: number;
        retryAfterSeconds?: number;
      };

      if (!response.ok) {
        const remaining = result.attemptsRemaining;
        if (typeof remaining === "number") setAttemptsRemaining(remaining);

        if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
          const until = Date.now() + result.retryAfterSeconds * 1000;
          setLockoutUntil(until);
          setRetryAfterSeconds(result.retryAfterSeconds);
          window.localStorage.setItem(LOCKOUT_STORAGE_KEY, String(until));
          setErrorMessage(`Too many failed attempts. Try again in ${formatCountdown(result.retryAfterSeconds)}.`);
        } else {
          const suffix = typeof remaining === "number"
            ? ` ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`
            : "";
          setErrorMessage(`${result.error ?? "Unable to sign in."}${suffix}`);
        }

        setIsSubmitting(false);
        return;
      }

      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        if (sessionResponse.ok) {
          const { user } = (await sessionResponse.json()) as {
            user?: { id?: unknown; role?: unknown };
          };
          if (typeof user?.id === "string" && user.id) {
            posthog.identify(user.id, {
              ...(typeof user.role === "string" ? { role: user.role } : {}),
            });
          }
        }
      } catch {}

      window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="gap-5">
        <GoogleSignInButton />
        <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200" /><span>or</span><span className="h-px flex-1 bg-neutral-200" />
        </div>
        <Field className="gap-2">
          <FieldLabel htmlFor="userEmail" className="font-semibold text-neutral-800">Email address</FieldLabel>
          <Input id="userEmail" name="email" type="email" autoComplete="email" placeholder="name@locus-t.com.my" required className="h-12 rounded-xl border-neutral-300 bg-white focus-visible:border-red-600 focus-visible:ring-red-600/20" />
        </Field>
        <Field className="gap-2">
          <FieldLabel htmlFor="password" className="font-semibold text-neutral-800">Password</FieldLabel>
          <InputGroup className="h-12 rounded-xl border-neutral-300 bg-white focus-within:border-red-600 focus-within:ring-2 focus-within:ring-red-600/20">
            <InputGroupInput id="password" name="password" type={isVisible ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required />
            <InputGroupAddon align="inline-end" className="pr-1.5">
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsVisible((visible) => !visible)} className="cursor-pointer rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-700">
                {isVisible ? <EyeOffIcon /> : <EyeIcon />}
                <span className="sr-only">{isVisible ? "Hide password" : "Show password"}</span>
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Field orientation="horizontal" className="w-auto items-center gap-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
              className="border-neutral-400 data-[state=checked]:border-red-600 data-[state=checked]:bg-red-600"
            />
            <FieldLabel htmlFor="rememberMe" className="font-normal text-neutral-600">Remember me</FieldLabel>
          </Field>
        </div>
        <Field>
          <Button className="h-12 w-full cursor-pointer rounded-xl bg-red-600 text-base font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed" type="submit" disabled={isSubmitting || retryAfterSeconds > 0}>
            {retryAfterSeconds > 0
              ? `Try again in ${formatCountdown(retryAfterSeconds)}`
              : isSubmitting
                ? "Signing in…"
                : "Sign in to Ads Reporting"}
          </Button>
        </Field>
        {retryAfterSeconds > 0 ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            Too many failed attempts. Try again in {formatCountdown(retryAfterSeconds)}.
          </p>
        ) : errorMessage ? (
          <p role="alert" className="text-sm font-medium text-red-700">{errorMessage}</p>
        ) : null}
        {!errorMessage && attemptsRemaining < 3 && (
          <p className="text-sm text-neutral-600">{attemptsRemaining} login attempts remaining.</p>
        )}
      </FieldGroup>
    </form>
  );
};

export default LoginForm;
