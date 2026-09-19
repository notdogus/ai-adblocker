export const CLASSIFIER_VERSION = 'ads-v1';
export const DEFAULT_MODEL = 'jev-1.13.0';
export type ResourceType = 'script' | 'image' | 'sub_frame' | 'xmlhttprequest' | 'media' | 'other';
export const RESOURCE_TYPES: ResourceType[] = ['script', 'image', 'sub_frame', 'xmlhttprequest', 'media', 'other'];
export interface Candidate {
  id: string; site: string; url: string; type: ResourceType;
  tag?: string; label?: string; marker?: string; origin: 'network' | 'dom';
}
export interface SafeCandidate { id: string; site: string; url: string; type: ResourceType; tag?: string; label?: string; marker?: string }
export interface Decision { id: string; ad: number; essential: number; model: string }
export interface DecisionProvider { evaluate(candidates: SafeCandidate[], signal?: AbortSignal): Promise<Decision[]> }
export interface LearnedRule {
  id: number; site: string; url: string; type: ResourceType; ad: number; essential: number;
  model: string; classifierVersion: string; origin: Candidate['origin']; createdAt: string;
}
export interface Settings { provider: 'typesafe'; model: string; aiEnabled: boolean; dailyLimit: number; disabledSites: string[] }
export interface AllowEntry { site: string; url: string; type: ResourceType }
export interface State {
  version: 1; settings: Settings; rules: LearnedRule[]; allows: AllowEntry[]; nextRuleId: number;
  budget: { day: string; calls: number }; status: string;
}
export const initialState = (): State => ({
  version: 1, settings: { provider: 'typesafe', model: DEFAULT_MODEL, aiEnabled: false, dailyLimit: 200, disabledSites: [] },
  rules: [], allows: [], nextRuleId: 1, budget: { day: '', calls: 0 }, status: '',
});
export const fingerprint = (c: Pick<Candidate, 'site' | 'url' | 'type'>) => JSON.stringify([c.site, c.url, c.type]);
