"use client";

import { FormEvent } from "react";
import type { ReactNode } from "react";
import { ChevronUpIcon, ClipboardListIcon, Loader2Icon, WandSparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MEDIA_PLAN_LANGUAGE_OPTIONS,
  MEDIA_PLAN_TARGET_LOCATION_OPTIONS,
  SUPPORTED_CAMPAIGN_TYPE,
  type MediaPlanFormData,
} from "@/lib/media-plan/schema";
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
  onMockup: () => void;
}

const CONTROL_CLASS =
  "h-10 rounded-lg border-[#d7d7d7] bg-white px-3 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm";
const SELECT_TRIGGER_CLASS =
  "h-10 w-full rounded-lg border-[#d7d7d7] bg-white px-3 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm";

export function MediaPlanForm({
  value,
  issues,
  generateDisabled,
  generating = false,
  buttonLabel = "Generate Media Plan",
  onChange,
  onGenerate,
  onMockup,
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
      className="overflow-hidden rounded-2xl border border-[#dedede] bg-white shadow-md"
    >
      <div className="flex items-center justify-between border-b border-[#dedede] px-5 py-3 sm:px-6">
        <h2 className="text-xl font-bold leading-tight text-[#1f2937]">Input & Brief</h2>
        <ChevronUpIcon className="size-5 text-[#1f2937]" aria-hidden="true" />
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
              className={CONTROL_CLASS}
              aria-invalid={Boolean(getIssueMessage(issues, "websiteUrl"))}
            />
          </FormField>

          <FormField
            htmlFor="media-plan-ad-budget"
            label="Ad Budget (MYR)"
            required
            error={getIssueMessage(issues, "adBudget")}
          >
            <Input
              id="media-plan-ad-budget"
              value={value.adBudget}
              onChange={(event) => updateField("adBudget", event.target.value)}
              inputMode="decimal"
              placeholder="150"
              className={CONTROL_CLASS}
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
              className={CONTROL_CLASS}
              aria-invalid={Boolean(getIssueMessage(issues, "googleCid"))}
            />
          </FormField>

          <FormField
            htmlFor="media-plan-campaign-type"
            label="Campaign Type"
            required
            error={getIssueMessage(issues, "campaignType")}
          >
            <Select
              value={value.campaignType}
              onValueChange={(nextValue) => updateField("campaignType", nextValue)}
            >
              <SelectTrigger
                id="media-plan-campaign-type"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(getIssueMessage(issues, "campaignType"))}
              >
                <SelectValue placeholder="Search" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SUPPORTED_CAMPAIGN_TYPE}>{SUPPORTED_CAMPAIGN_TYPE}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            htmlFor="media-plan-target-location"
            label="Target Location"
            required
            error={getIssueMessage(issues, "targetLocation")}
          >
            <Select
              value={value.targetLocation}
              onValueChange={(nextValue) => updateField("targetLocation", nextValue)}
            >
              <SelectTrigger
                id="media-plan-target-location"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(getIssueMessage(issues, "targetLocation"))}
              >
                <SelectValue placeholder="Malaysia Nationwide" />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_PLAN_TARGET_LOCATION_OPTIONS.map((location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            htmlFor="media-plan-language"
            label="Language"
            required
            error={getIssueMessage(issues, "language")}
          >
            <Select
              value={value.language}
              onValueChange={(nextValue) => updateField("language", nextValue)}
            >
              <SelectTrigger
                id="media-plan-language"
                className={SELECT_TRIGGER_CLASS}
                aria-invalid={Boolean(getIssueMessage(issues, "language"))}
              >
                <SelectValue placeholder="English" />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_PLAN_LANGUAGE_OPTIONS.map((language) => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="sm:col-span-2">
            <FormField htmlFor="media-plan-special-remarks" label="Special Remarks">
              <Textarea
                id="media-plan-special-remarks"
                value={value.specialRemarks}
                onChange={(event) => updateField("specialRemarks", event.target.value)}
                placeholder="Optional notes for campaign angle, exclusions, or landing page context."
                className="min-h-20 resize-y rounded-lg border-[#d7d7d7] bg-white px-3 py-2.5 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[160px_minmax(0,1fr)]">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-[#d7d7d7] bg-white text-sm font-bold text-[#344054] hover:bg-[#f7f7f7]"
              disabled={generateDisabled || generating}
              onClick={onMockup}
            >
              <ClipboardListIcon className="size-4" />
              Mockup
            </Button>
            <Button
              type="submit"
              className="h-10 rounded-lg bg-[#b00012] text-sm font-bold text-white shadow-sm hover:bg-[#92000f]"
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
      <Label htmlFor={htmlFor} className="text-[13px] font-bold leading-tight text-[#344054]">
        {label}
        {required ? <span className="text-[#be123c]"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
    </div>
  );
}
