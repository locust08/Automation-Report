import type { MetaPreviewBlockIssue } from "@/lib/reporting/types";

type MetaPreviewFailurePayload = {
  metaFatalErrors?: MetaPreviewBlockIssue[];
};

export function getMetaPreviewFailureMessage(payload: MetaPreviewFailurePayload): string | null {
  const failure = payload.metaFatalErrors?.[0];
  if (!failure) return null;

  if (failure.errorCode === 80004 || failure.errorSubcode === 2446079) {
    return "Meta temporarily rate-limited this ad account. Wait a few minutes, then refresh official data.";
  }

  return `Meta could not load the required ${formatBlockLabel(failure.label)} data. ${failure.message}`;
}

function formatBlockLabel(label: string) {
  return label.replace(/^meta-preview-/, "").replaceAll("-", " ");
}
