// Matches KBS's Meta provider: use plays, never the three-second actions metric.
export function metaVideoPlays(actions: { action_type?: string; value?: string | number }[] | null | undefined): number | null {
  if (!actions) return null;
  const plays = actions.filter((action) => action.action_type === "video_view");
  if (!plays.length) return actions.length === 0 ? 0 : null;
  if (plays.some((action) => action.value == null || action.value === "" || !Number.isFinite(Number(action.value)))) return null;
  return plays.reduce((sum, action) => sum + Number(action.value), 0);
}
