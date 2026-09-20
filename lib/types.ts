export const CLASSIFIER_VERSION = 'ads-v2-player';
export const DEFAULT_MODEL = 'jev-1.13.0';
export type ResourceType = 'script' | 'image' | 'sub_frame' | 'xmlhttprequest' | 'media' | 'other';
export const RESOURCE_TYPES: ResourceType[] = ['script', 'image', 'sub_frame', 'xmlhttprequest', 'media', 'other'];
export type CandidateType = ResourceType | 'popup' | 'overlay';
export interface PlayerEvidence {
  kind: 'popup' | 'overlay';
  playerGesture?: boolean; blank?: boolean; unrelatedDestination?: boolean;
  overlaysPlayer?: boolean; externalLink?: boolean;
  interceptsPlayback?: boolean; containsMedia?: boolean; containsControls?: boolean;
  unrequestedBlank?: boolean;
}
export interface Candidate {
  id: string; site: string; url: string; type: CandidateType;
  tag?: string; label?: string; marker?: string; origin: 'network' | 'dom' | 'behavior';
  selector?: string; evidence?: PlayerEvidence;
}
export interface SafeCandidate { id: string; site: string; url: string; type: CandidateType; tag?: string; label?: string; marker?: string; evidence?: PlayerEvidence }
export interface Decision { id: string; ad: number; essential: number; model: string }
export interface DecisionProvider { evaluate(candidates: SafeCandidate[], signal?: AbortSignal): Promise<Decision[]> }
export interface LearnedRule {
  id: number; site: string; url: string; type: CandidateType; ad: number; essential: number; selector?: string;
  model: string; classifierVersion: string; origin: Candidate['origin']; createdAt: string;
}
export interface Settings { provider: 'typesafe'; model: string; aiEnabled: boolean; dailyLimit: number; disabledSites: string[] }
export interface AllowEntry { site: string; url: string; type: CandidateType; selector?: string }
export interface State {
  version: 1; settings: Settings; rules: LearnedRule[]; allows: AllowEntry[]; nextRuleId: number;
  budget: { day: string; calls: number }; status: string;
}
export const initialState = (): State => ({
  version: 1, settings: { provider: 'typesafe', model: DEFAULT_MODEL, aiEnabled: false, dailyLimit: 200, disabledSites: [] },
  rules: [], allows: [], nextRuleId: 1, budget: { day: '', calls: 0 }, status: '',
});
export const fingerprint = (c: Pick<Candidate, 'site' | 'url' | 'type' | 'selector'>) => JSON.stringify([c.site, c.url, c.type, c.selector ?? '']);
