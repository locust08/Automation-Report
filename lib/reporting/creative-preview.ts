import type { PreviewAdNode } from "./types";

export function previewCreativeSource(ad?: PreviewAdNode): string | undefined {
  const creative = ad?.creative;
  const source = creative?.mediaType === "video"
    ? creative.posterUrl || creative.thumbnailUrl || creative.imageUrl
    : creative?.imageUrl || creative?.posterUrl || creative?.thumbnailUrl;
  return source || ad?.images?.[0]?.url || undefined;
}
