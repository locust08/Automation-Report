"use client";

import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

const LOCKOUT_STORAGE_KEY = "ads-reporting-login-lockout-until-v2";

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const LoginForm = () => {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
