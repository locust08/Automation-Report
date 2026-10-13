export function safeReportUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text === "Not available" || /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && (url.hostname.includes(".") || url.hostname === "localhost") ? url.href : null;
  } catch { return null; }
}
export function youtubePreviewId(url: string | null | undefined, provided?: string | null): string | null {
  if (provided && /^[a-zA-Z0-9_-]{11}$/.test(provided)) return provided;
  const safe = safeReportUrl(url);
  if (!safe) return null;
  const parsed = new URL(safe);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const id = host === "youtu.be" ? parsed.pathname.slice(1).split("/")[0]
    : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host) ? parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1] : null;
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}
