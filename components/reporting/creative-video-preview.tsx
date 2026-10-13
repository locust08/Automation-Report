"use client";
import { useState } from "react";
import { PlayIcon } from "lucide-react";
import { safeReportUrl, youtubePreviewId } from "@/lib/reporting/safe-report-url";
export function CreativeVideoPreview({ url, poster, youtubeId, exportMode = false }: {
  url?: string | null; poster?: string | null; youtubeId?: string | null; exportMode?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = youtubePreviewId(url, youtubeId);
  const href = id ? `https://www.youtube.com/watch?v=${id}` : safeReportUrl(url);
  const thumbnail = safeReportUrl(poster) ?? (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);
  if (playing && !exportMode && href) return <div className="relative size-full">
    {id ? <iframe className="size-full" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`} title="Creative video preview" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      : <video className="size-full" src={href} poster={thumbnail ?? undefined} controls autoPlay playsInline onError={() => setFailed(true)} />}
    {failed ? <p className="absolute inset-x-0 bottom-0 bg-white p-2 text-xs">Playback unavailable. <a href={href} target="_blank" rel="noopener noreferrer" className="underline">Open video</a></p> : null}
    <a href={href} target="_blank" rel="noopener noreferrer" className="absolute bottom-1 right-1 rounded bg-white px-2 py-1 text-xs text-black underline">Open video</a>
    <button className="absolute right-1 top-1 rounded bg-white px-2 py-1 text-xs text-black" onClick={() => setPlaying(false)}>Close preview</button>
  </div>;
  const preview = <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {thumbnail ? <img src={thumbnail} alt="Video creative thumbnail" className="size-full object-cover" loading="eager" decoding="async" /> : <span className="flex size-full items-center justify-center text-xs">Video preview</span>}
    {href ? <span className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="flex size-12 items-center justify-center rounded-full bg-white text-black"><PlayIcon className="size-5 fill-current" /></span></span> : null}
  </>;
  if (!href) return <div className="relative size-full">{preview}</div>;
  if (exportMode) return <a href={href} target="_blank" rel="noopener noreferrer" className="relative block size-full" aria-label="Open creative video">{preview}</a>;
  return <button type="button" className="relative block size-full" onClick={() => setPlaying(true)} aria-label="Play creative video">{preview}</button>;
}
