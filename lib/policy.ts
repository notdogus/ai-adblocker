import { domainMatches } from './cosmetics';
import type { Candidate, CandidateType, Decision, State } from './types';
export function evidenceStrength(candidate: Pick<Candidate, 'evidence'>): number {
  if (!candidate.evidence) return 0;
  return candidate.evidence.kind === 'popup' || candidate.evidence.interceptsPlayback ? 2 : 1;
}
export function enabledFor(site: string, state: State): boolean {
  return !state.settings.disabledSites.some(domain => domainMatches(site, domain));
}
export function sameResource(a: Pick<Candidate, 'site' | 'url' | 'type' | 'selector'>, b: Pick<Candidate, 'site' | 'url' | 'type' | 'selector'>): boolean {
  return domainMatches(a.site, b.site) && a.url === b.url && a.type === b.type && a.selector === b.selector;
}
export function known(candidate: Candidate, state: State): boolean {
  return [...state.rules, ...state.allows].some(rule => sameResource(candidate, rule));
}
export function shouldLearn(decision: Decision, type: CandidateType = 'script'): boolean {
  // Reversible, structurally guarded element/side-effect actions have a lower
  // cost than disabling a whole resource. The essential-content veto is shared.
  const minimum = type === 'popup' || type === 'overlay' ? .85 : .95;
  return Number.isFinite(decision.ad) && Number.isFinite(decision.essential) && decision.ad >= minimum && decision.ad <= 1 && decision.essential >= 0 && decision.essential <= .1;
}
export function blocked(candidate: Candidate, state: State): boolean {
  return enabledFor(candidate.site, state) && !state.allows.some(rule => sameResource(candidate, rule)) && state.rules.some(rule => sameResource(candidate, rule));
}
export function topSite(details: { frameId: number; type: string; url: string; documentUrl?: string; frameAncestors?: { url: string }[] }, tabUrl?: string): string | undefined {
  const value = details.frameAncestors?.at(-1)?.url ?? (details.type === 'main_frame' ? details.url : details.frameId === 0 ? details.documentUrl ?? tabUrl : undefined);
  if (!value) return;
  try { return new URL(value).hostname; } catch { return; }
}
