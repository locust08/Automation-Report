"use client";

import { FormEvent } from "react";
import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon, ClipboardListIcon, Loader2Icon, WandSparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MEDIA_PLAN_LANGUAGE_OPTIONS,
  MEDIA_PLAN_TARGET_LOCATION_OPTIONS,
  type MediaPlanFormData,
  type MediaPlanLanguage,
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
const MULTI_SELECT_TRIGGER_CLASS =
  "h-10 w-full justify-between rounded-lg border-[#d7d7d7] bg-white px-3 text-left text-sm font-medium text-[#344054] shadow-none hover:bg-white focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15";

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
        <div className="grid gap-x-6 gap-y-4 lg:grid-cols-3">
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
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <FormField
            htmlFor="media-plan-target-location"
            label="Target Location"
            required
            error={getFieldIssueMessage(issues, "targetLocation")}
          >
            <MultiSelectField
              id="media-plan-target-location"
              label="Target Location"
              options={MEDIA_PLAN_TARGET_LOCATION_OPTIONS}
              value={value.targetLocation}
              placeholder="Select locations"
              error={getFieldIssueMessage(issues, "targetLocation")}
              onChange={(nextValue) => updateField("targetLocation", nextValue)}
            />
          </FormField>

          <FormField
            htmlFor="media-plan-language"
            label="Language"
            required
            error={getFieldIssueMessage(issues, "language")}
          >
            <MultiSelectField
              id="media-plan-language"
              label="Language"
              options={MEDIA_PLAN_LANGUAGE_OPTIONS}
              value={value.language}
              placeholder="Select languages"
              error={getFieldIssueMessage(issues, "language")}
              onChange={(nextValue) => updateField("language", nextValue as MediaPlanLanguage[])}
            />
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

function MultiSelectField({
  id,
  label,
  options,
  value,
  placeholder,
  error,
  onChange,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: readonly string[];
  placeholder: string;
  error?: string | null;
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);
  const displayValue = value.length > 0 ? value.join(", ") : placeholder;

  function toggle(option: string, checked: boolean) {
    if (checked) {
      onChange(Array.from(new Set([...value, option])));
      return;
    }
    onChange(value.filter((item) => item !== option));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={MULTI_SELECT_TRIGGER_CLASS}
          aria-label={label}
          aria-invalid={Boolean(error)}
        >
          <span className="min-w-0 truncate">{displayValue}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-[#667085]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)]">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={selected.has(option)}
            onCheckedChange={(checked) => toggle(option, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getFieldIssueMessage(issues: MediaPlanValidationIssue[], path: string): string | null {
  return getIssueMessage(issues, path) ?? issues.find((issue) => issue.path.startsWith(`${path}.`))?.message ?? null;
}
