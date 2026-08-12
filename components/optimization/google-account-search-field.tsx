"use client";

import type { KeyboardEventHandler, ReactNode } from "react";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

export type GoogleAccountSearchItem = {
  accountName: string;
  adAccountId: string;
};

type SearchState = "idle" | "loading" | "success" | "error";

type GoogleAccountSearchFieldProps<T extends GoogleAccountSearchItem> = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (account: T) => void;
  results: T[];
  recentAccounts?: T[];
  open: boolean;
  state?: SearchState;
  error?: string | null;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  highlightedIndex?: number;
  onHighlight?: (index: number) => void;
  renderMeta?: (account: T) => ReactNode;
};

export function GoogleAccountSearchField<T extends GoogleAccountSearchItem>({
  value,
  onChange,
  onSelect,
  results,
  recentAccounts = [],
  open,
  state = "idle",
  error,
  placeholder = "Search company or Google Ads CID",
  onFocus,
  onBlur,
  onKeyDown,
  highlightedIndex = -1,
  onHighlight,
  renderMeta,
}: GoogleAccountSearchFieldProps<T>) {
  const recentIds = new Set(recentAccounts.map((account) => account.adAccountId));
  const liveResults = results.filter((account) => !recentIds.has(account.adAccountId));
  const hasOptions = liveResults.length > 0 || recentAccounts.length > 0;

  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-neutral-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        className="h-12 rounded-xl pl-12 text-base shadow-sm"
      />

      {open && (hasOptions || state !== "idle") ? (
        <div className="absolute z-30 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 text-neutral-900 shadow-xl">
          {state === "error" ? <p className="p-3 text-sm text-red-700">{error}</p> : null}

          {liveResults.length > 0 ? (
            <div className="space-y-1">
              {liveResults.map((account, index) => (
                <AccountOption
                  key={`live-${account.adAccountId}`}
                  account={account}
                  index={index}
                  highlightedIndex={highlightedIndex}
                  onHighlight={onHighlight}
                  onSelect={onSelect}
                  renderMeta={renderMeta}
                />
              ))}
            </div>
          ) : null}

          {state === "success" && value.trim().length >= 2 && liveResults.length === 0 ? (
            <p className="p-3 text-sm text-neutral-500">No additional matching accounts.</p>
          ) : null}

          {recentAccounts.length > 0 ? (
            <div className={liveResults.length > 0 ? "mt-2 border-t border-neutral-200 pt-1" : ""}>
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Recent accounts
              </p>
              {recentAccounts.map((account, index) => (
                <AccountOption
                  key={`recent-${account.adAccountId}`}
                  account={account}
                  index={liveResults.length + index}
                  highlightedIndex={highlightedIndex}
                  onHighlight={onHighlight}
                  onSelect={onSelect}
                  renderMeta={renderMeta}
                />
              ))}
            </div>
          ) : null}

          {state === "loading" ? (
            <p className="mt-1 border-t bg-neutral-50 p-3 text-sm text-neutral-500">Searching accounts…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AccountOption<T extends GoogleAccountSearchItem>({
  account,
  index,
  highlightedIndex,
  onHighlight,
  onSelect,
  renderMeta,
}: {
  account: T;
  index: number;
  highlightedIndex: number;
  onHighlight?: (index: number) => void;
  onSelect: (account: T) => void;
  renderMeta?: (account: T) => ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={index === highlightedIndex}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => onHighlight?.(index)}
      onClick={() => onSelect(account)}
      className={`block w-full rounded-lg px-4 py-3 text-left transition ${
        index === highlightedIndex ? "bg-red-50" : "hover:bg-red-50"
      }`}
    >
      <span className="block text-sm font-semibold">{account.accountName}</span>
      <span className="mt-0.5 block text-sm text-neutral-500">{account.adAccountId}</span>
      {renderMeta?.(account)}
    </button>
  );
}
