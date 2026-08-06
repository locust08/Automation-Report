"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

const LoginForm = () => {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to sign in.");
      }

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
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsVisible((visible) => !visible)} className="rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-700">
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
          <Button className="h-12 w-full rounded-xl bg-red-600 text-base font-semibold text-white shadow-sm hover:bg-red-700" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in to Ads Reporting"}
          </Button>
        </Field>
        {errorMessage && <p role="alert" className="text-sm font-medium text-red-700">{errorMessage}</p>}
      </FieldGroup>
    </form>
  );
};

export default LoginForm;
