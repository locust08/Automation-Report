export function completeCreativeReason(value: string): string {

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized || /(?:\.\.\.|\u2026)\s*$/.test(normalized)) return "";

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;

}

