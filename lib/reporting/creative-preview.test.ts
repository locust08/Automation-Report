import assert from "node:assert/strict";
import test from "node:test";
import { previewCreativeSource } from "./creative-preview";
import type { PreviewAdNode } from "./types";
const ad: PreviewAdNode = { id: "1", name: "Ad", status: "ACTIVE", details: [], creative: { id: "creative", mediaType: "video", videoUrl: "https://example.com/video.mp4", posterUrl: "https://example.com/poster.jpg", thumbnailUrl: "https://example.com/thumb.jpg", imageUrl: "https://example.com/image.jpg" } };
test("video preview uses its poster/thumbnail rather than the video file or generic image", () => {
  assert.equal(previewCreativeSource(ad),"https://example.com/poster.jpg");
  assert.equal(previewCreativeSource({...ad,creative:{...ad.creative!,posterUrl:null}}),"https://example.com/thumb.jpg");
  assert.equal(previewCreativeSource({...ad,creative:{id:"creative",mediaType:"video",videoUrl:ad.creative!.videoUrl}}),undefined);
});
test("image preview preserves its image and missing creatives remain unavailable", () => {
  assert.equal(previewCreativeSource({...ad,creative:{...ad.creative!,mediaType:"image"}}),"https://example.com/image.jpg");
  assert.equal(previewCreativeSource(),undefined);
});
