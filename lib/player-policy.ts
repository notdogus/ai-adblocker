/** Pure policy shared by the page hook and its regression tests. */
export const PLAYER_CONFIG = 'ai-adblocker:player-config';
export const PLAYER_OBSERVATION = 'ai-adblocker:player-observation';
export const PLAYER_READY = 'ai-adblocker:player-ready';
export interface PopupIntent {
  enabled: boolean; playerGesture: boolean; explicitDestination: boolean;
  learnedCaller: boolean; unrequestedBlank?: boolean;
}
export function preventPopup(intent: PopupIntent): boolean {
  return intent.enabled && !intent.explicitDestination && (intent.playerGesture || intent.learnedCaller || Boolean(intent.unrequestedBlank));
}
export function scriptFromStack(stack: string, scripts: string[]): string | undefined {
  // Match an observed external script exactly, not an arbitrary URL supplied by
  // page data. Keep the nearest caller; shared player code is not a network rule.
  for (const line of stack.split('\n').slice(1, 16)) {
    for (const source of scripts) if (line.includes(`${source}:`) || line.endsWith(`@${source}`)) return source;
  }
}
export function validOverlaySelector(value: unknown): value is string {
  if (typeof value === 'string' && /^[a-z][a-z0-9-]*\[data-(?:ad|ad-slot|cl-overlay)\]$/.test(value)) return true;
  return typeof value === 'string' && value.length <= 180 && /^(?:[a-z][a-z0-9-]*(?:#[a-zA-Z_][\w-]*|(?:\.[a-zA-Z_][\w-]*){1,3})(?: > [a-z][a-z0-9-]*:nth-of-type\([1-9]\d?\))?|body > [a-z][a-z0-9-]*:nth-of-type\([1-9]\d?\))$/.test(value);
}
export function youtubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
}
/** Remove only separate ad slots from a recognized player response. Never walk
 * or edit streamingData, captions, videoDetails or media bytes. */
export function prunePlayerAds(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, any>;
  let changed = false;
  if (data.videoDetails && (data.streamingData || data.playabilityStatus)) {
    for (const key of ['playerAds', 'adPlacements', 'adSlots']) {
      if (Array.isArray(data[key])) { delete data[key]; changed = true; }
    }
  }
  if (data.playerResponse && data.playerResponse !== data) changed = prunePlayerAdsRoot(data.playerResponse) || changed;
  return changed;
}
function prunePlayerAdsRoot(value: any): boolean {
  // A single known wrapper only; no recursion through arbitrary page objects.
  if (!value || typeof value !== 'object' || !value.videoDetails || !(value.streamingData || value.playabilityStatus)) return false;
  let changed = false;
  for (const key of ['playerAds', 'adPlacements', 'adSlots']) {
    if (Array.isArray(value[key])) { delete value[key]; changed = true; }
  }
  return changed;
}
