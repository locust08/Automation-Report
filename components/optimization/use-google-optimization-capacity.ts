"use client";

import { useCallback, useEffect, useState } from "react";

import type { DailyAnalysisCapacity } from "@/components/optimization/daily-capacity-counter-grid";

export function useGoogleOptimizationCapacity(refreshKey:string) {
  const [capacity,setCapacity]=useState<DailyAnalysisCapacity|null>(null);
  const refresh=useCallback(async()=>{
    try {
      const response=await fetch("/api/search-term-optimization/capacity",{cache:"no-store"});
      if(response.ok)setCapacity(await response.json() as DailyAnalysisCapacity);
    } catch {
      // Optimization remains available while the capacity service recovers.
    }
  },[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(timer);},[refresh,refreshKey]);
  useEffect(()=>{
    const refreshVisible=()=>{if(document.visibilityState!=="hidden")void refresh();};
    window.addEventListener("focus",refreshVisible);
    document.addEventListener("visibilitychange",refreshVisible);
    return()=>{window.removeEventListener("focus",refreshVisible);document.removeEventListener("visibilitychange",refreshVisible);};
  },[refresh]);
  return {capacity,refresh};
}
