"use client";

import { FormEvent } from "react";
import type { ReactNode } from "react";
import { Loader2Icon, WandSparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MediaPlanFormData } from "@/lib/media-plan/schema";
import {
  getIssueMessage,
  MediaPlanValidationIssue,
} from "@/lib/media-plan/validation";

interface MediaPlanFormProps {
  value: MediaPlanFormData;
  issues: MediaPlanValidationIssue[];
  generateDisabled: boolean;
  generating?: boolean;
  buttonLabel?: string;
  onChange: (nextValue: MediaPlanFormData) => void;
  onGenerate: () => void;
}

export function MediaPlanForm({
  value,
  issues,
  generateDisabled,
  generating = false,
  buttonLabel = "Generate Media Plan",
  onChange,
  onGenerate,
}: MediaPlanFormProps) {
  function updateField<K extends keyof MediaPlanFormData>(key: K, fieldValue: MediaPlanFormData[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGenerate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#dedede] bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            htmlFor="media-plan-website-url"
            label="Website URL"
            required
            error={getIssueMessage(issues, "websiteUrl")}
          >
            <Input
              id="media-plan-website-url"
              value={value.websiteUrl}
              onChange={(event) => updateField("websiteUrl", event.target.value)}
              placeholder="https://example.com"
              aria-invalid={Boolean(getIssueMessage(issues, "websiteUrl"))}
            />
          </FormField>

          <FormField
            htmlFor="media-plan-ad-budget"
            label="Ad Budget"
            required
            error={getIssueMessage(issues, "adBudget")}
          >
            <Input
              id="media-plan-ad-budget"
              value={value.adBudget}
              onChange={(event) => updateField("adBudget", event.target.value)}
              inputMode="decimal"
              placeholder="150"
              aria-invalid={Boolean(getIssueMessage(issues, "adBudget"))}
            />
          </FormField>

          <FormField
            htmlFor="media-plan-google-cid"
            label="Google CID"
            required
            error={getIssueMessage(issues, "googleCid")}
          >
            <Input
              id="media-plan-google-cid"
              value={value.googleCid}
              onChange={(event) => updateField("googleCid", event.target.value)}
              placeholder="697-252-8848"
              aria-invalid={Boolean(getIssueMessage(issues, "googleCid"))}
            />
          </FormField>

          <FormField
            htmlFor="media-plan-campaign-type"
            label="Campaign Type"
            error={getIssueMessage(issues, "campaignType")}
          >
            <Input
              id="media-plan-campaign-type"
              value={value.campaignType}
              onChange={(event) => updateField("campaignType", event.target.value)}
              list="media-plan-campaign-types"
              aria-invalid={Boolean(getIssueMessage(issues, "campaignType"))}
            />
            <datalist id="media-plan-campaign-types">
              <option value="Search" />
              <option value="Performance Max" />
              <option value="Shopping" />
              <option value="Video" />
              <option value="Display" />
              <option value="Demand Gen" />
              <option value="AI Max" />
            </datalist>
          </FormField>

          <FormField htmlFor="media-plan-target-location" label="Target Location">
            <Input
              id="media-plan-target-location"
              value={value.targetLocation}
              onChange={(event) => updateField("targetLocation", event.target.value)}
              placeholder="Malaysia Nationwide"
            />
          </FormField>

          <FormField htmlFor="media-plan-language" label="Language">
            <Input
              id="media-plan-language"
              value={value.language}
              onChange={(event) => updateField("language", event.target.value)}
              placeholder="Infer from website later"
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-4">
          <FormField htmlFor="media-plan-special-remarks" label="Special Remarks">
            <Textarea
              id="media-plan-special-remarks"
              value={value.specialRemarks}
              onChange={(event) => updateField("specialRemarks", event.target.value)}
              placeholder="Optional notes for campaign angle, exclusions, or landing page context."
              className="min-h-32 resize-y"
            />
          </FormField>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#667085]">
              Generates a strict Google Search plan through the server. Approval stays disabled until Phase 3.
            </p>
            <Button
              type="submit"
              className="h-10 bg-[#9f0019] text-white hover:bg-[#820015]"
              disabled={generateDisabled || generating}
            >
              {generating ? <Loader2Icon className="size-4 animate-spin" /> : <WandSparklesIcon className="size-4" />}
              {generating ? "Generating" : buttonLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function FormField({
  htmlFor,
  label,
  required = false,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-semibold text-[#344054]">
        {label}
        {required ? <span className="text-[#be123c]"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
    </div>
  );
}
