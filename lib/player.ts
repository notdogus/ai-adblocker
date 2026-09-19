/**
 * Mutates a player configuration before the player code consumes it. This is
 * deliberately limited to explicit advertising configuration; it never seeks,
 * clicks controls, or rewrites a media source.
 */
export function disableConfiguredAds(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;
  const ads = (config as { ads?: unknown }).ads;
  if (!ads || typeof ads !== 'object') return false;
  const value = ads as Record<string, unknown>;
  let changed = false;
  if (value.enabled !== false) { value.enabled = false; changed = true; }
  if (value.displayFrame !== false) { value.displayFrame = false; changed = true; }
  if (Array.isArray(value.waterfall) && value.waterfall.length) { value.waterfall = []; changed = true; }
  if (value.fallback) { value.fallback = ''; changed = true; }
  if (value.fad && typeof value.fad === 'object') {
    const fad = value.fad as Record<string, unknown>;
    if (fad.enabled !== 0 && fad.enabled !== false) { fad.enabled = 0; changed = true; }
  }
  return changed;
}

export function hasAdvertisingConfiguration(config: unknown): boolean {
  return Boolean(config && typeof config === 'object' && 'ads' in config &&
    (config as { ads?: unknown }).ads && typeof (config as { ads?: unknown }).ads === 'object');
}
