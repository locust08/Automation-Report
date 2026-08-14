"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { CheckIcon, FilterIcon, RotateCcwIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CampaignNameFilter,
  CampaignNameFilterMode,
} from "@/lib/reporting/campaign-name-filter";
import { formatCampaignNameFilterLabel, getCampaignNameOptions } from "@/lib/reporting/campaign-name-filter";

export function CampaignNameFilterControl({
  filter,
  campaignOptions,
  onChange,
  align = "right",
  className = "",
}: {
  filter: CampaignNameFilter | null;
  campaignOptions: string[];
  onChange: (filter: CampaignNameFilter | null) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<CampaignNameFilterMode>(filter?.mode ?? "include");
  const [draftValues, setDraftValues] = useState<string[]>(filter?.values ?? []);
  const [searchValue, setSearchValue] = useState("");
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = Boolean(filter?.values.length);
  const normalizedOptions = getCampaignNameOptions(campaignOptions);
  const filteredOptions = searchValue.trim()
    ? normalizedOptions.filter((option) =>
        option.toLocaleLowerCase().includes(searchValue.trim().toLocaleLowerCase())
      )
    : normalizedOptions;
  const selectedSet = new Set(draftValues.map((value) => value.toLocaleLowerCase()));

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = getCampaignNameOptions(draftValues);
    onChange(values.length > 0 ? { mode: draftMode, values } : null);
    setOpen(false);
  }

  function handleClear() {
    setDraftValues([]);
    setSearchValue("");
    onChange(null);
    setOpen(false);
  }

  function toggleOpen() {
    const nextOpen = !open;
    if (nextOpen) {
      setDraftMode(filter?.mode ?? "include");
      setDraftValues(filter?.values ?? []);
      setSearchValue("");
    }
    setOpen(nextOpen);
  }

  function toggleCampaign(campaignName: string) {
    setDraftValues((current) => {
      const exists = current.some((value) => value.toLocaleLowerCase() === campaignName.toLocaleLowerCase());
      return exists
        ? current.filter((value) => value.toLocaleLowerCase() !== campaignName.toLocaleLowerCase())
        : [...current, campaignName];
    });
  }

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-wrap items-center gap-2 ${className}`}
      data-report-export-exclude="true"
    >
      <Button
        type="button"
        variant="outline"
        className={`h-9 gap-2 border-red-200 bg-white px-3 text-sm font-semibold text-[#e10600] hover:bg-red-50 ${
          active ? "border-[#e10600] bg-red-50" : ""
        }`}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={toggleOpen}
      >
        <FilterIcon className="size-4" />
        Campaign Filter
        {active ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-[#e10600] text-[11px] leading-none text-white">
            1
          </span>
        ) : null}
      </Button>

      {active && filter ? (
        <button
          type="button"
          className="inline-flex h-9 max-w-full items-center gap-2 rounded-md border border-red-100 bg-red-50 px-3 text-sm font-medium text-[#e10600]"
          onClick={handleClear}
        >
          <span className="truncate">{formatCampaignNameFilterLabel(filter)}</span>
          <XIcon className="size-3.5 shrink-0" />
        </button>
      ) : null}

      {active ? (
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-2 bg-white px-3 text-sm"
          onClick={handleClear}
        >
          <RotateCcwIcon className="size-4" />
          Reset
        </Button>
      ) : null}

      {open ? (
        <form
          id={popoverId}
          onSubmit={handleSubmit}
          className={`absolute top-[calc(100%+0.75rem)] z-40 w-[min(calc(100vw-2rem),30rem)] rounded-lg border border-[#e3e3e3] bg-white p-4 text-[#111] shadow-[0_22px_60px_rgba(15,23,42,0.18)] ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <label className="text-sm font-semibold" htmlFor={`${popoverId}-value`}>
            Campaign name
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_1fr]">
            <Select value={draftMode} onValueChange={(value) => setDraftMode(value as CampaignNameFilterMode)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="include">Includes</SelectItem>
                <SelectItem value="exclude">Does not include</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Input
                id={`${popoverId}-value`}
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search campaigns..."
                className="h-10 pr-9"
              />
              <SearchIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#777]" />
            </div>
          </div>
          {draftValues.length > 0 ? (
            <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-auto">
              {draftValues.map((campaignName) => (
                <span
                  key={campaignName}
                  className="inline-flex max-w-full items-center gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-[#7f1d1d]"
                >
                  <span className="truncate">{campaignName}</span>
                  <button
                    type="button"
                    onClick={() => toggleCampaign(campaignName)}
                    aria-label={`Remove ${campaignName}`}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 max-h-64 overflow-auto rounded-md border border-[#eeeeee] bg-white p-1">
            {normalizedOptions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-[#777]">No campaigns available for this account.</p>
            ) : filteredOptions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-[#777]">No campaigns match your search.</p>
            ) : (
              filteredOptions.map((campaignName) => {
                const selected = selectedSet.has(campaignName.toLocaleLowerCase());
                return (
                  <button
                    type="button"
                    key={campaignName}
                    className={`flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-red-50 ${
                      selected ? "bg-red-50 text-[#9f0019]" : "text-[#222]"
                    }`}
                    onClick={() => toggleCampaign(campaignName)}
                  >
                    <span
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                        selected ? "border-[#e10600] bg-[#e10600] text-white" : "border-[#d8d8d8] bg-white"
                      }`}
                    >
                      {selected ? <CheckIcon className="size-3" /> : null}
                    </span>
                    <span className="break-words leading-5">{campaignName}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-4 flex gap-3 border-t border-[#eeeeee] pt-4">
            <Button type="button" variant="outline" className="h-10 flex-1" onClick={handleClear}>
              Clear
            </Button>
            <Button type="submit" className="h-10 flex-1 bg-[#e10600] text-white hover:bg-[#b90000]">
              Apply Filter
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
