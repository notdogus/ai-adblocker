import { domainMatches } from './cosmetics';
import type { Candidate, Decision, State } from './types';
export function enabledFor(site: string, state: State): boolean {
  return !state.settings.disabledSites.some(domain => domainMatches(site, domain));
}
export function sameResource(a: Pick<Candidate, 'site' | 'url' | 'type'>, b: Pick<Candidate, 'site' | 'url' | 'type'>): boolean {
  return domainMatches(a.site, b.site) && a.url === b.url && a.type === b.type;
}
export function known(candidate: Candidate, state: State): boolean {
  return [...state.rules, ...state.allows].some(rule => sameResource(candidate, rule));
}
export function shouldLearn(decision: Decision): boolean {
  return Number.isFinite(decision.ad) && Number.isFinite(decision.essential) && decision.ad >= .95 && decision.ad <= 1 && decision.essential >= 0 && decision.essential <= .1;
}
export function blocked(candidate: Candidate, state: State): boolean {
  return enabledFor(candidate.site, state) && !state.allows.some(rule => sameResource(candidate, rule)) && state.rules.some(rule => sameResource(candidate, rule));
}
export function topSite(details: { frameId: number; type: string; url: string; documentUrl?: string; frameAncestors?: { url: string }[] }, tabUrl?: string): string | undefined {
  const value = details.frameAncestors?.at(-1)?.url ?? (details.type === 'main_frame' ? details.url : details.frameId === 0 ? details.documentUrl ?? tabUrl : undefined);
  if (!value) return;
  try { return new URL(value).hostname; } catch { return; }
}
