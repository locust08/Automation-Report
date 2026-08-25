const INTERNAL_ERROR_PATTERNS = [
  /workflow database request failed/i,
  /\bPGRST\d+\b/i,
  /\b(?:42P\d+|[0-9A-Z]{5})\b.*(?:column|relation|function|schema)/i,
  /schema cache/i,
  /(?:column|relation|function)\s+(?:public\.)?[a-z0-9_.]+\s+(?:does not exist|was not found)/i,
];

export function formatAdsManagementUserError(
  cause: unknown,
  fallback: string,
): string {
  const message = cause instanceof Error ? cause.message.trim() : "";
  if (!message || INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return fallback;
  }
  return message;
}
